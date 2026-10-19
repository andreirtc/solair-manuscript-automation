import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Codex } from "./codex.ts";
import { Store, now, id } from "./store.ts";
import { buildSections, annotateAnchors } from "./sections.ts";
import { previewReview } from "./review.ts";
import { layoutProfile, auditLayout, layoutOperations } from "./layout.ts";
import { isTabularSource, selectedTableText } from "./tabular-sources.ts";
import { imageInfo } from "./images.ts";
import { issueTransfer } from "./transfers.ts";
import { formattingSignature } from "./format-preservation.ts";
import { manuscriptFigures } from "./figures.ts";
import { manuscriptEquations } from "./equations.ts";
import { Printing, PRINT_CHECKS } from "./printing.ts";
import { downloadPdf } from "./pdf.ts";
import {
  sourceBindings,
  assertSourceBindings,
  sourceBytes,
} from "./source-snapshots.ts";
import { AppError } from "./errors.ts";
export { AppError } from "./errors.ts";
import type {
  Anchor,
  Job,
  Operation,
  Source,
  PrintReadiness,
} from "../../../packages/contracts/index.ts";
const require = createRequire(import.meta.url);
export const Engine = require("../../../packages/engine/Core.cjs");
export const TARGET = {
  document_id: "1dCOOm4LIpuF49lcIxgcJcDuSgeHV9d4IAJ6GpjI6q80",
  tab_id: "t.rf2v4q59t7sc",
  tab_title: "DP1 THESIS (FINAL)",
};
export const MAINTAINED = "1rgMme-k53PQdyBDcAi43mDfrCxrt2LJlIFU-fz5P7NM";
export const INBOX = "1Vlx6tp0oQHfuHxAgo7Pl6JyMH3pfrlpN";
const BACKUPS = "1l5dhhIfh3SWs3lUQHQguPvrKZOChUJhX";
export interface Google {
  privateImages?: boolean;
  privateImageOrigin?: string;
  tool(name: string, args: any): Promise<any>;
  applyJob?(job: any, revision: string): Promise<any>;
}
export function preservation(raw: any, ignoredImages: string[] = []) {
  const doc = Engine.normalize(raw);
  function stable(v: any): any {
    if (Array.isArray(v)) return v.map(stable);
    if (v && typeof v === "object") {
      const r: any = {};
      for (const k of Object.keys(v).sort())
        if (
          ![
            "startIndex",
            "endIndex",
            "contentUri",
            "sourceUri",
            "documentId",
            "document_url",
          ].includes(k)
        )
          r[k] = stable(v[k]);
      return r;
    }
    return v;
  }
  const target = doc.tabs.find((t: any) => t.tabId === TARGET.tab_id),
    ps = Engine.paragraphs(target),
    sop = Engine.protectedSection(ps);
  function objects(content: any[]): any {
    return (content || []).flatMap((e) =>
      e.table
        ? [
            {
              rows: e.table.rows,
              columns: e.table.columns,
              style: stable(e.table.tableStyle),
              cells: e.table.tableRows.map((r: any) => ({
                style: stable(r.tableRowStyle),
                cells: r.tableCells.map((c: any) => ({
                  style: stable(c.tableCellStyle),
                  objects: objects(c.content),
                })),
              })),
            },
          ]
        : e.paragraph
          ? e.paragraph.elements
              .filter(
                (x: any) =>
                  !x.textRun &&
                  !ignoredImages.includes(
                    x.inlineObjectElement?.inlineObjectId,
                  ),
              )
              .map(stable)
          : [],
    );
  }
  return JSON.stringify({
    reference: stable(doc.tabs.find((t: any) => t.tabId === "t.xmpxojg07hrf")),
    sop: stable(
      ps
        .filter((x: any) => x.start >= sop.start && x.start < sop.end)
        .map((x: any) => x.paragraph),
    ),
    documentStyle: stable(target.documentStyle),
    namedStyles: stable(target.namedStyles),
    lists: stable(target.lists),
    footnotes: stable(target.footnotes),
    dropdownDefinitions: stable(target.dropdownDefinitions),
    suggestedDocumentStyleChanges: stable(target.suggestedDocumentStyleChanges),
    suggestedNamedStylesChanges: stable(target.suggestedNamedStylesChanges),
    headers: stable(target.headers),
    footers: stable(target.footers),
    objects: objects(target.body.content),
    inlineObjects: stable(
      Object.fromEntries(
        Object.entries(target.inlineObjects || {}).filter(
          ([id]) => !ignoredImages.includes(id),
        ),
      ),
    ),
    positionedObjects: stable(target.positionedObjects),
  });
}
export class Manuscript {
  readonly target: typeof TARGET;
  assertTarget(job: Job) {
    const expected = this.mode === "maintained" ? "maintained" : "trial";
    if (
      job.target !== expected ||
      (job.documentId || TARGET.document_id) !== this.target.document_id
    )
      throw new AppError(
        "JOB_TARGET_CHANGED",
        "This proposal belongs to a different manuscript. Create and review a fresh proposal for the active document; old trial approvals cannot transfer.",
        409,
      );
  }
  snapshot: any;
  fetchedAt?: string;
  live = false;
  applying = false;
  constructor(
    public store: Store,
    public google: Google,
    public project: string,
    public readonly mode: "trial" | "maintained" = "trial",
  ) {
    if (!["trial", "maintained"].includes(mode))
      throw new Error(
        "Use the explicitly configured trial or adviser-review manuscript.",
      );
    this.target = {
      ...TARGET,
      document_id: mode === "maintained" ? MAINTAINED : TARGET.document_id,
    };
    const saved = store.get(
      "snapshot",
      mode === "trial" ? "trial" : this.target.document_id,
    );
    if (saved) {
      this.snapshot = saved.raw;
      this.fetchedAt = saved.fetchedAt;
    } else if (mode === "trial") {
      const p = join(
        project,
        "work/manuscript-automation/trial-after/document-result.json",
      );
      if (existsSync(p)) this.snapshot = JSON.parse(readFileSync(p, "utf8"));
    }
    if (
      this.snapshot &&
      Engine.normalize(this.snapshot).documentId !== this.target.document_id
    )
      throw new Error("Cached manuscript target mismatch.");
    // An interrupted write is uncertain, never reported as failed-before-write or complete.
    for (const j of store.list<Job>("job"))
      if (j.status === "applying") {
        j.status = "blocked";
        j.blockers = [
          "Application restarted during a write. Reconcile using a fresh dry run; never replay blindly.",
        ];
        this.save(j);
      }
  }
  async refresh() {
    const raw = await this.refreshRaw();
    return this.info(raw);
  }
  async refreshRaw() {
    const raw = await this.google.tool("get_document", {
      document_id: this.target.document_id,
    });
    const d = Engine.normalize(raw);
    if (
      d.documentId !== this.target.document_id ||
      !d.tabs.find(
        (t: any) =>
          t.tabId === this.target.tab_id && t.title === this.target.tab_title,
      )
    )
      throw new AppError(
        "TARGET_MISMATCH",
        "The connected document or tab does not match the configured manuscript.",
        409,
      );
    Engine.protectedSection(
      Engine.paragraphs(
        d.tabs.find((t: any) => t.tabId === this.target.tab_id),
      ),
    );
    this.snapshot = raw;
    this.fetchedAt = now();
    this.live = true;
    this.store.put("snapshot", {
      id: this.mode === "trial" ? "trial" : this.target.document_id,
      raw,
      fetchedAt: this.fetchedAt,
    });
    return raw;
  }
  info(raw = this.snapshot) {
    const d = raw ? Engine.normalize(raw) : undefined;
    return {
      documentId: this.target.document_id,
      maintainedDocumentId: MAINTAINED,
      tabId: this.target.tab_id,
      tabTitle: this.target.tab_title,
      title: d?.title,
      revision: d?.revisionId,
      readState: this.live ? "live" : "cached_snapshot",
      fetchedAt: this.fetchedAt || "historical transfer snapshot",
      writeMode:
        this.mode === "maintained" ? "maintained_reviewed" : "trial_only",
      productionWrites: this.mode === "maintained",
      originalWrites: false,
      figureWritesAvailable: Boolean(this.google.privateImages),
    };
  }
  outline(): Anchor[] {
    if (!this.snapshot) return [];
    const d = Engine.normalize(this.snapshot),
      tab = d.tabs.find((t: any) => t.tabId === this.target.tab_id),
      ps = Engine.paragraphs(tab),
      sop = Engine.protectedSection(ps);
    let section = "Front matter";
    const anchors = ps
      .filter((p: any) => p.text.trim())
      .map((p: any) => {
        const text = p.text.trim();
        if (
          !p.location &&
          text.length < 100 &&
          p.paragraph.paragraphStyle?.keepWithNext
        )
          section = text;
        return {
          id: createHash("sha256")
            .update(p.start + ":" + text)
            .digest("hex")
            .slice(0, 20),
          text,
          start: p.start,
          end: p.end,
          section,
          protected: p.start < sop.end && p.end > sop.start,
          location: p.location
            ? { row: p.location.row, column: p.location.column }
            : null,
        };
      });
    return annotateAnchors(anchors, this.sections());
  }
  sections() {
    return buildSections(this.snapshot, this.target.tab_id);
  }
  figures() {
    return manuscriptFigures(this.snapshot, this.outline());
  }
  equations() {
    return manuscriptEquations(
      this.snapshot,
      this.outline(),
      this.target.tab_id,
    );
  }
  async figureImage(figureId: string) {
    await this.refresh();
    const figure = this.figures().find((f) => f.id === figureId),
      cached = this.store.get("native_image", figureId),
      revision = this.info().revision;
    if (cached && (!figure || cached.revision === revision))
      return {
        bytes: readFileSync(join(this.store.dir, "native-images", figureId)),
        mime: cached.mime,
      };
    if (!figure)
      throw new AppError(
        "NOT_FOUND",
        "Refresh the figure list. This image is no longer in the manuscript.",
        404,
      );
    const tab = Engine.normalize(this.snapshot).tabs.find(
        (t: any) => t.tabId === this.target.tab_id,
      ),
      uri =
        tab.inlineObjects[figure.nativeObjectId].inlineObjectProperties
          .embeddedObject.imageProperties.contentUri;
    const url = new URL(uri);
    if (
      url.protocol !== "https:" ||
      !/(^|\.)googleusercontent\.com$/.test(url.hostname)
    )
      throw new AppError(
        "IMAGE_PREVIEW_UNAVAILABLE",
        "Open this figure in Google Docs to review its current image.",
      );
    const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (
      !response.ok ||
      Number(response.headers.get("content-length")) > 20 * 1024 * 1024
    )
      throw new AppError(
        "IMAGE_PREVIEW_UNAVAILABLE",
        "Private figure preview could not be downloaded.",
      );
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 20 * 1024 * 1024)
      throw new AppError("SOURCE_TOO_LARGE", "Preview exceeds 20 MB.");
    const info = imageInfo(bytes);
    if (!info)
      throw new AppError(
        "IMAGE_PREVIEW_UNAVAILABLE",
        "Open this figure in Google Docs to review it.",
      );
    mkdirSync(join(this.store.dir, "native-images"), {
      recursive: true,
      mode: 0o700,
    });
    writeFileSync(join(this.store.dir, "native-images", figureId), bytes, {
      mode: 0o600,
    });
    this.store.put("native_image", {
      id: figureId,
      revision,
      mime: info.mime,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
    return { bytes, mime: info.mime };
  }
  layoutProfile() {
    return layoutProfile(this.snapshot);
  }
  auditLayout(sectionIds: string[] = []) {
    return auditLayout(
      this.snapshot,
      this.outline(),
      this.sections(),
      sectionIds,
    );
  }
  async proposeLayout(sectionIds: string[] = []) {
    await this.refresh();
    const audit = this.auditLayout(sectionIds),
      operations = layoutOperations(audit);
    return {
      audit,
      job: operations.length
        ? this.create(
            "Repair sampled school body formatting in the requested scope",
            operations,
            [],
            "layout_audit",
          )
        : undefined,
      remaining: Math.max(0, audit.issues.length - operations.length),
    };
  }
  create(
    request: string,
    operations: Operation[],
    sourceIds: string[] = [],
    origin = "gui",
    bindings?: Record<string, string>,
    sourceReviewMode?: "proposal_review",
  ) {
    if (
      operations.some(
        (op) => op.type === "insert_figure" || op.type === "replace_figure",
      ) &&
      operations.length !== 1
    )
      throw new AppError(
        "SEPARATE_FIGURE_JOB",
        "Review each figure in its own proposal before other edits.",
      );
    sourceIds = [
      ...new Set([
        ...sourceIds,
        ...operations.flatMap((op) => ("sourceId" in op ? [op.sourceId] : [])),
      ]),
    ];
    for (const s of sourceIds)
      if (!this.store.get("source", s))
        throw new AppError(
          "SOURCE_NOT_FOUND",
          "A selected source does not exist.",
          404,
        );
    // Runtime validation is performed by the HTTP schema and again by the pure planner.
    if (bindings) assertSourceBindings(this.store, sourceIds, bindings);
    const j: Job = {
      id: id(),
      request,
      status: "draft",
      target: this.mode,
      documentId: this.target.document_id,
      operations,
      sourceIds,
      sourceBindings: bindings || sourceBindings(this.store, sourceIds),
      sourceReviewMode,
      proposedChanges: [],
      blockers: [],
      createdAt: now(),
      updatedAt: now(),
      origin,
      createdBy: this.store.actor(),
    };
    this.save(j);
    this.store.activity(
      "job_created",
      "Prepared a draft update; manuscript unchanged.",
      j.id,
      origin,
    );
    return j;
  }
  get(key: string): Job {
    const j = this.store.get<Job>("job", key);
    if (!j) throw new AppError("NOT_FOUND", "Update not found.", 404);
    return j;
  }
  save(j: Job) {
    j.updatedAt = now();
    return this.store.put("job", j);
  }
  rawJob(j: Job): any {
    this.assertTarget(j);
    const anchors = this.outline();
    return {
      schema_version: 1,
      job_id: j.id,
      document_id: this.target.document_id,
      tab_id: this.target.tab_id,
      operations: j.operations.map((op) => {
        const resolved =
          "anchorId" in op && op.anchorId
            ? {
                ...op,
                expected_start:
                  anchors.find((a) => a.id === op.anchorId)?.start ?? -1,
              }
            : op;
        if (op.type !== "insert_figure" && op.type !== "replace_figure")
          return resolved;
        const figure =
          op.type === "replace_figure"
            ? this.figures().find((f) => f.id === op.figureId)
            : undefined;
        if (op.type === "replace_figure" && (!figure || figure.readOnly)) {
          // A committed marker is checked before operations; permit recovery after the old object was replaced.
          return {
            ...resolved,
            old_image_id: "missing",
            expected_caption: "missing",
          };
        }
        const source = this.store.get<Source>("source", op.sourceId),
          anchor = anchors.find(
            (a) =>
              a.id ===
              (op.type === "insert_figure"
                ? op.anchorId
                : figure!.imageAnchorId),
          );
        if (
          !source?.image ||
          (j.sourceReviewMode !== "proposal_review" && !source.evidenceReviewed) ||
          !anchor ||
          anchor.protected ||
          (op.type === "insert_figure" && anchor.text !== op.after_paragraph)
        )
          throw new AppError(
            "FIGURE_MAPPING_REQUIRED",
            "Map and review this private image and its current editable section before insertion.",
          );
        const section = source.sectionId
          ? this.sections().find((s) => s.id === source.sectionId)
          : undefined;
        if (
          j.sourceReviewMode !== "proposal_review" && source.anchorId !== anchor.id &&
          !(
            section &&
            anchor.start >= section.start &&
            anchor.start < section.end
          )
        )
          throw new AppError(
            "FIGURE_MAPPING_REQUIRED",
            "The figure destination must belong to its mapped section.",
          );
        const uri = join(
            this.store.dir,
            "sources",
            source.id + (source.image.mime === "image/png" ? ".png" : ".jpg"),
          ),
          bytes = readFileSync(uri),
          image = imageInfo(bytes);
        if (
          !image ||
          createHash("sha256").update(bytes).digest("hex") !== source.sha256
        )
          throw new AppError(
            "ASSET_CHANGED",
            "The private image bytes changed. Upload and review it again.",
          );
        const profile = this.layoutProfile(),
          caption = profile.roles.figureCaption,
          imageRole = profile.roles.figureImage || caption;
        const maxWidth =
          profile.page.pageSize.width.magnitude -
          profile.page.marginLeft.magnitude -
          profile.page.marginRight.magnitude -
          Math.max(
            imageRole.paragraphStyle.indentFirstLine?.magnitude || 0,
            imageRole.paragraphStyle.indentStart?.magnitude || 0,
          ) -
          (imageRole.paragraphStyle.indentEnd?.magnitude || 0) -
          18;
        const captionLines = Math.max(
          1,
          Math.ceil(op.caption.length / Math.max(12, Math.floor(maxWidth / 6))),
        );
        const captionHeight =
          (captionLines *
            (caption.textStyle.fontSize?.magnitude || 11) *
            1.15 *
            (caption.paragraphStyle.lineSpacing || 200)) /
          100;
        const heightLimit = Math.min(
          figure?.heightPt || 480,
          540 - captionHeight - 24,
        );
        const width = Math.min(
            op.width_pt || figure?.widthPt || 360,
            maxWidth,
            (heightLimit * image.width) / image.height,
          ),
          height = (width * image.height) / image.width;
        if (width < 36 || height < 12)
          throw new AppError(
            "FIGURE_SIZE_REVIEW",
            "This image cannot fit legibly. Provide a differently sized source or placement.",
          );
        return {
          ...resolved,
          uri,
          asset_id: source.id,
          width_pt: width,
          height_pt: height,
          caption_style: caption.paragraphStyle,
          image_style: imageRole.paragraphStyle,
          caption_text_style: caption.textStyle,
          ...(figure
            ? {
                old_image_id: figure.nativeObjectId,
                expected_caption: figure.caption,
                expected_caption_start: figure.captionStart,
              }
            : {}),
        };
      }),
    };
  }
  texts(raw: any): string[] {
    const d = Engine.normalize(raw);
    return Engine.paragraphs(
      d.tabs.find((t: any) => t.tabId === this.target.tab_id),
    ).map((p: any) => p.text);
  }
  expectedTexts(raw: any, j: Job): string[] {
    const d = Engine.normalize(raw),
      ps = Engine.paragraphs(
        d.tabs.find((t: any) => t.tabId === this.target.tab_id),
      ),
      expected = ps.map((p: any) => p.text),
      seen = new Set<number>();
    for (const op of j.operations)
      if (op.type === "replace_text") {
        const one = Engine.plan(
          raw,
          {
            ...this.rawJob(j),
            operations: [this.rawJob(j).operations[j.operations.indexOf(op)]],
          },
          this.target,
        );
        const r = one.requests.find(
            (r: any) => r.deleteContentRange || r.insertText,
          ),
          index =
            r.deleteContentRange?.range.startIndex ??
            r.insertText.location.index;
        const pi = ps.findIndex((p: any) => p.start <= index && p.end > index);
        if (pi < 0 || seen.has(pi))
          throw new AppError(
            "SPLIT_PARAGRAPH_UPDATE",
            "Use one wording replacement per paragraph in each update.",
          );
        seen.add(pi);
        expected[pi] = one.changes[0].expected_paragraph_after;
      } else if (op.type === "insert_figure") {
        const index = ps.findIndex(
          (p: any) => p.start === this.rawJob(j).operations[0].expected_start,
        );
        if (index < 0)
          throw new AppError("STALE_ANCHOR", "Refresh the figure destination.");
        expected.splice(index + 1, 0, op.caption + "\n", "\uFFFC\n");
      } else if (op.type === "replace_figure") {
        const resolved = this.rawJob(j).operations[0],
          index = ps.findIndex(
            (p: any) => p.start === resolved.expected_caption_start,
          );
        if (index < 0)
          throw new AppError(
            "STALE_FIGURE",
            "The figure changed. Refresh its inventory.",
          );
        expected[index] = op.caption + "\n";
      }
    return expected;
  }
  private verifyPreservation(raw: any, saved: any) {
    const tab = Engine.normalize(raw).tabs.find(
        (t: any) => t.tabId === this.target.tab_id,
      ),
      added = Object.keys(tab.inlineObjects || {}).filter(
        (id) => !(saved.inlineObjectIds || []).includes(id),
      );
    const expectedFigures = saved.plan.changes.filter(
      (c: any) => c.type === "insert_figure" || c.type === "replace_figure",
    ).length;
    if (expectedFigures && added.length !== expectedFigures) return false;
    return (
      preservation(raw, expectedFigures ? added : []) === saved.preservation &&
      (!saved.formattingSignature ||
        formattingSignature(raw, saved.plan, true) ===
          saved.formattingSignature)
    );
  }
  checkSources(j: Job) {
    this.assertTarget(j);
    for (const sid of j.sourceIds) {
      const s = this.store.get<Source>("source", sid);
      if (!s || (j.sourceReviewMode !== "proposal_review" && ((!s.anchorId && !s.sectionId) || !s.evidenceReviewed)))
        throw new AppError(
          "EVIDENCE_REVIEW_REQUIRED",
          "Map each selected source and confirm evidence review before previewing.",
        );
      sourceBytes(this.store, s);
      if (isTabularSource(s)) {
        if (!s.rowSelection)
          throw new AppError(
            "ROW_SELECTION_REQUIRED",
            "Select and review eligible table records before previewing or applying a source-based change.",
            409,
          );
        selectedTableText(s, sourceBytes(this.store, s).toString("utf8"));
      }
      if (
        j.sourceReviewMode !== "proposal_review" && ((s.anchorId &&
          !this.outline().some((a) => a.id === s.anchorId && !a.protected)) ||
        (s.sectionId &&
          !this.sections().some(
            (section) => section.id === s.sectionId && !section.readOnly,
          )))
      )
        throw new AppError(
          "STALE_SOURCE_MAPPING",
          "Refresh and remap this source to a current section before using it.",
        );
    }
    assertSourceBindings(this.store, j.sourceIds, j.sourceBindings);
  }
  async dryRun(key: string) {
    this.assertTarget(this.get(key));
    if (this.get(key).status === "rejected")
      throw new AppError(
        "REJECTED_JOB",
        "This proposal was rejected. Create a new proposal if the request changes.",
        409,
      );
    if (this.applying)
      throw new AppError("BUSY", "An update or preview is in progress.", 409);
    this.applying = true;
    try {
      return await this.dryRunLocked(key);
    } catch (e) {
      const j = this.get(key);
      if (!["complete", "needs_layout_review"].includes(j.status)) {
        j.status = "blocked";
        j.blockers = [(e as Error).message];
        this.save(j);
      }
      throw e;
    } finally {
      this.applying = false;
    }
  }
  private async dryRunLocked(key: string) {
    const j = this.get(key);
    if (["complete", "needs_layout_review"].includes(j.status)) return j;
    const raw = await this.refreshRaw();
    const plan = Engine.plan(raw, this.rawJob(j), this.target);
    if (plan.status === "already_applied") {
      // Marker recovers a lost write response only if the durable prewrite plan and protection signature exist.
      const saved = this.store.get("plan", j.id);
      if (
        !saved ||
        !Engine.verify(raw, saved.plan, this.target) ||
        !this.verifyPreservation(raw, saved) ||
        JSON.stringify(this.texts(raw)) !== JSON.stringify(saved.expectedTexts)
      ) {
        j.status = "blocked";
        j.blockers = [
          "An application marker exists, but full preservation verification requires reconciliation.",
        ];
      } else {
        j.status = "needs_layout_review";
        j.verification = {
          native: true,
          layout: "pending",
          revision: Engine.normalize(raw).revisionId,
        };
        j.blockers = [];
      }
      return this.save(j);
    }
    try {
      this.checkSources(j);
    } catch (e) {
      j.status = "blocked";
      j.blockers = [(e as Error).message];
      this.save(j);
      throw e;
    }
    j.status = "dry_run_ready";
    j.baseRevision = plan.write_control.requiredRevisionId;
    j.proposedChanges = plan.changes;
    j.blockers = [];
    j.review = previewReview(raw, j, plan, this.outline());
    const expectedTexts = this.expectedTexts(raw, j);
    this.store.put("plan", {
      id: j.id,
      plan,
      preservation: preservation(
        raw,
        plan.changes
          .filter((c: any) => c.type === "replace_figure")
          .map((c: any) => c.old_image_id),
      ),
      formattingSignature: formattingSignature(raw, plan),
      expectedTexts,
      inlineObjectIds: Object.keys(
        Engine.normalize(raw).tabs.find(
          (t: any) => t.tabId === this.target.tab_id,
        ).inlineObjects || {},
      ),
    });
    this.save(j);
    this.store.activity(
      "preview_ready",
      "Validated a current preview; manuscript unchanged.",
      j.id,
    );
    return j;
  }
  async apply(key: string, baseRevision: string, idem: string) {
    const j = this.get(key);
    this.assertTarget(j);
    const prior = this.store.get("idempotency", key);
    if (prior && prior.key !== idem)
      throw new AppError(
        "IDEMPOTENCY_CONFLICT",
        "Retry this update with its original idempotency key.",
        409,
      );
    if (j.status === "complete" || j.status === "needs_layout_review") return j;
    if (this.applying)
      throw new AppError("BUSY", "Another write is in progress.", 409);
    if (j.status !== "dry_run_ready")
      throw new AppError(
        "PREVIEW_REQUIRED",
        "Create a successful current preview first.",
        409,
      );
    if (!baseRevision || baseRevision !== j.baseRevision)
      throw new AppError(
        "REVISION_CONFLICT",
        "The supplied revision does not match this preview.",
        409,
      );
    if (
      j.operations.some(
        (op) => op.type === "insert_figure" || op.type === "replace_figure",
      ) &&
      !this.google.privateImages
    )
      throw new AppError(
        "PRIVATE_IMAGE_ADAPTER_REQUIRED",
        "This deployment has not enabled a verified private-image adapter. No backup or manuscript write was sent.",
        409,
      );
    const approval = this.store.get(
      "approval",
      j.id + ":" + (this.store.actor()?.id || "service"),
    );
    if (
      !j.review ||
      !approval ||
      approval.previewHash !== j.review.hash ||
      approval.revision !== j.baseRevision
    )
      throw new AppError(
        "REVIEW_REQUIRED",
        "Read and acknowledge each proposed change before applying it. Important wording changes also require review notes.",
        409,
      );
    this.applying = true;
    let sent = false;
    let transfer: ReturnType<typeof issueTransfer> | undefined;
    try {
      this.checkSources(j);
      const beforeRaw = await this.refreshRaw();
      this.checkSources(j);
      if (Engine.normalize(beforeRaw).revisionId !== baseRevision)
        throw new AppError(
          "REVISION_CONFLICT",
          "The document changed after preview. Generate a fresh preview.",
          409,
        );
      const plan = Engine.plan(beforeRaw, this.rawJob(j), this.target),
        before = preservation(
          beforeRaw,
          plan.changes
            .filter((c: any) => c.type === "replace_figure")
            .map((c: any) => c.old_image_id),
        );
      if (plan.status !== "ready")
        throw new AppError(
          "RECONCILE_REQUIRED",
          "This update may already exist; run a fresh dry run.",
          409,
        );
      const expectedTexts = this.expectedTexts(beforeRaw, j);
      const copy = await this.google.tool("copy_file", {
        url: `https://docs.google.com/document/d/${this.target.document_id}/edit`,
        new_title: `SOLAIR app ${this.mode === "maintained" ? "manuscript" : "trial"} backup ${j.id} ${now()}`,
        parent_folder: BACKUPS,
      });
      const backupId =
        copy.id || copy.file?.id || copy.file_id || copy.metadata?.id;
      if (!backupId)
        throw new AppError(
          "BACKUP_FAILED",
          "No native backup ID returned. Nothing was written.",
          502,
        );
      j.backup = {
        id: backupId,
        url: `https://docs.google.com/document/d/${backupId}/edit`,
      };
      this.store.put("backup", {
        id: backupId,
        jobId: j.id,
        createdAt: now(),
        url: j.backup.url,
      });
      this.store.put("plan", {
        id: j.id,
        plan,
        preservation: before,
        formattingSignature: formattingSignature(beforeRaw, plan),
        expectedTexts,
        inlineObjectIds: Object.keys(
          Engine.normalize(beforeRaw).tabs.find(
            (t: any) => t.tabId === this.target.tab_id,
          ).inlineObjects || {},
        ),
      });
      this.checkSources(j);
      this.store.put("idempotency", { id: j.id, key: idem });
      j.status = "applying";
      if (j.review) {
        j.review.status = "approved";
        j.review.approvedAt = approval.at;
        j.review.notes = approval.notes;
      }
      j.approvedBy = approval.actor;
      j.appliedBy = this.store.actor();
      this.save(j);
      const nativeJob = this.rawJob(j);
      if (
        (j.operations[0].type === "insert_figure" ||
          j.operations[0].type === "replace_figure") &&
        this.google.privateImageOrigin
      ) {
        transfer = issueTransfer(
          this.store,
          j,
          this.store.get<Source>("source", j.operations[0].sourceId)!,
          this.google.privateImageOrigin,
        );
        nativeJob.operations[0].uri = transfer.url;
        plan.requests.find(
          (r: any) => r.insertInlineImage,
        ).insertInlineImage.uri = transfer.url;
      }
      // Persist intent before sending; a lost response can be reconciled from the atomic native marker.
      sent = true;
      if (this.google.applyJob)
        await this.google.applyJob(nativeJob, baseRevision);
      else
        await this.google.tool("batch_update_document", {
          document_id: this.target.document_id,
          requests: plan.requests,
          write_control: plan.write_control,
          ...(!this.google.privateImageOrigin &&
          (j.operations[0].type === "insert_figure" ||
            j.operations[0].type === "replace_figure")
            ? { image_uris: this.rawJob(j).operations[0].uri }
            : {}),
        });
      const afterRaw = await this.refreshRaw();
      const d = Engine.normalize(afterRaw);
      const passed =
        Engine.verify(afterRaw, plan, this.target) &&
        this.verifyPreservation(afterRaw, this.store.get("plan", j.id)) &&
        JSON.stringify(this.texts(afterRaw)) ===
          JSON.stringify(expectedTexts) &&
        Engine.plan(afterRaw, this.rawJob(j), this.target).status ===
          "already_applied";
      j.verification = {
        native: passed,
        layout: "pending",
        revision: d.revisionId,
      };
      j.status = passed ? "needs_layout_review" : "blocked";
      j.blockers = passed
        ? []
        : [
            "The write returned but preservation verification failed. Review the backup and document; do not retry the update.",
          ];
      this.save(j);
      this.store.activity(
        passed ? "native_verified" : "verification_blocked",
        passed
          ? `Applied to ${this.mode === "maintained" ? "the adviser-review manuscript" : "the trial"} and verified native content. PDF review is pending.`
          : "Write needs investigation.",
        j.id,
      );
      return j;
    } catch (e) {
      if (sent) {
        j.status = "blocked";
        j.blockers = [
          "Write outcome is uncertain. Run dry run to reconcile the native marker before any retry.",
        ];
        this.save(j);
        this.store.activity("write_uncertain", j.blockers[0], j.id);
      } else if (j.status === "applying") {
        j.status = "blocked";
        j.blockers = [
          "Preparation failed before the native write was sent. Generate a fresh preview.",
        ];
        this.save(j);
      }
      throw e;
    } finally {
      transfer?.revoke();
      this.applying = false;
    }
  }
  approveReview(
    key: string,
    previewHash: string,
    changeIds: string[],
    notes: string,
  ) {
    if (this.applying)
      throw new AppError(
        "BUSY",
        "Wait for the current preview or write before reviewing a proposal.",
        409,
      );
    const j = this.get(key),
      review = j.review;
    this.checkSources(j);
    if (j.status !== "dry_run_ready" || !review || review.hash !== previewHash)
      throw new AppError(
        "PREVIEW_CHANGED",
        "Validate and read the current proposal before approving it.",
        409,
      );
    const expected = new Set(review.changes.map((c) => c.id)),
      received = new Set(changeIds);
    if (
      expected.size !== received.size ||
      [...expected].some((id) => !received.has(id))
    )
      throw new AppError(
        "CHANGES_NOT_REVIEWED",
        "Acknowledge every changed passage or formatting change before approving.",
        409,
      );
    if (j.sourceReviewMode !== "proposal_review" && review.requiresNotes && notes.trim().length < 30)
      throw new AppError(
        "REVIEW_NOTES_REQUIRED",
        "Explain why these wording/removal changes are acceptable (at least 30 characters).",
        409,
      );
    const actor = this.store.actor(),
      at = now();
    this.store.put("approval", {
      id: j.id + ":" + (actor?.id || "service"),
      previewHash,
      revision: j.baseRevision,
      changeIds: [...received],
      notes: notes.trim(),
      actor,
      at,
    });
    j.review = {
      ...review,
      status: "approved",
      approvedAt: at,
      notes: notes.trim(),
    };
    j.approvedBy = actor;
    this.save(j);
    this.store.activity(
      "proposal_reviewed",
      "Recorded deliberate review of every change in the current proposal.",
      j.id,
    );
    return j;
  }
  reject(key: string, reason: string) {
    if (this.applying)
      throw new AppError(
        "BUSY",
        "Wait for the current preview or write before rejecting a proposal.",
        409,
      );
    const j = this.get(key);
    if (j.status === "blocked" && this.store.get("idempotency", j.id))
      throw new AppError(
        "RECONCILE_REQUIRED",
        "This write may already have reached Google Docs. Reconcile its native marker before rejecting or retrying it.",
        409,
      );
    if (["applying", "needs_layout_review", "complete"].includes(j.status))
      throw new AppError(
        "ALREADY_APPLIED",
        "An applied update cannot be rejected. Review its native backup instead.",
        409,
      );
    j.status = "rejected";
    j.blockers = [reason.trim()];
    if (j.review) j.review.status = "rejected";
    this.save(j);
    this.store.activity(
      "proposal_rejected",
      "Rejected this proposal without changing the manuscript.",
      j.id,
    );
    return j;
  }
  async exportPdf(jobId: string) {
    const j = this.get(jobId);
    this.assertTarget(j);
    if (!j.verification?.native)
      throw new AppError(
        "NATIVE_CHECK_REQUIRED",
        "Verify the native write before requesting its PDF.",
      );
    if (
      Engine.normalize(await this.refreshRaw()).revisionId !==
      j.verification.revision
    )
      throw new AppError(
        "REVISION_CONFLICT",
        "The manuscript changed after this update. Its current PDF cannot verify the older revision.",
        409,
      );
    const bytes = await downloadPdf(this.google, this.target.document_id);
    if (
      Engine.normalize(await this.refreshRaw()).revisionId !==
      j.verification.revision
    )
      throw new AppError(
        "REVISION_CONFLICT",
        "The manuscript changed during PDF export. Review is blocked for this update.",
        409,
      );
    const dir = join(this.store.dir, "pdf");
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileSync(join(dir, jobId + ".pdf"), bytes, { mode: 0o600 });
    this.store.put("pdf", {
      id: jobId,
      revision: j.verification.revision,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      createdAt: now(),
    });
    return {
      url: `/api/v1/jobs/${jobId}/pdf`,
      revision: j.verification.revision,
    };
  }
  printing() {
    return new Printing(
      this.store,
      this.google,
      this.target,
      async () => Engine.normalize(await this.refreshRaw()).revisionId,
    );
  }
  printReadiness(): PrintReadiness {
    const revisionId = Engine.normalize(this.snapshot).revisionId || "unknown",
      frozen = this.printing().current(),
      profile = this.layoutProfile();
    return {
      submissionCutoff:
        "2026-10-17T13:30:00+08:00 (October 17, 2026 before 1:30 PM Manila)",
      requiredPhysicalCopies: 4,
      baselinePagesPerCopy: 157,
      totalPrintedPagesEstimate: (frozen?.pageCount || 157) * 4,
      currentRevisionId: revisionId,
      formattingRules: {
        paperSize: "Letter, sampled from THESIS LAYOUT",
        margins:
          "Left 1.5 in; top, right and bottom 1 in, sampled from THESIS LAYOUT",
        bodyTypography: "Arial 11 pt; preserve role-specific indent exceptions",
        lineSpacing:
          "Body and figure captions use sampled double spacing (200%).",
        captions:
          "Figure captions follow the actual school sample: Arial 11, double spacing, above the image; keep caption and image together.",
        headings:
          "Use sampled school heading styles; ambiguous title/table/equation exceptions require PDF inspection.",
      },
      scheduleTimeline: [],
      verificationChecklist: [
        {
          category: "Final PDF review",
          items: PRINT_CHECKS.map((c) => ({
            task: c.label,
            status:
              frozen?.revisionId === revisionId
                ? ("verified" as const)
                : ("pending_manual_review" as const),
            details:
              frozen?.revisionId === revisionId
                ? "Explicitly acknowledged in the recorded PDF review; not an automatic scientific validation."
                : "Review the exported PDF and underlying evidence; a cached snapshot or test result is not print approval.",
          })),
        },
      ],
      frozenPrintPdf: frozen
        ? {
            revisionId: frozen.revisionId,
            sha256: frozen.sha256,
            pageCount: frozen.pageCount,
            exportedAt: frozen.exportedAt,
            fileSizeBytes: frozen.fileSizeBytes,
            url: "/api/v1/manuscript/print-pdf",
            stale: frozen.revisionId !== revisionId,
            reviewedAt: frozen.reviewedAt,
          }
        : undefined,
      requiredChecks: PRINT_CHECKS,
      referenceProfile: profile,
      estimateNotice:
        "157 pages is a historical duplicate estimate, not a verified final manuscript page count. Prepare a fresh PDF and check its scope; exports may include other document tabs. Four copies count printed pages, not necessarily paper sheets.",
    };
  }
  async preparePrintPdf() {
    if (this.applying)
      throw new AppError(
        "BUSY",
        "Wait for the current preview or update.",
        409,
      );
    this.applying = true;
    try {
      return await this.printing().prepare();
    } finally {
      this.applying = false;
    }
  }
  async freezePrintPdf(
    candidateId: string,
    revision: string,
    checks: string[],
    notes: string,
  ) {
    if (this.applying)
      throw new AppError(
        "BUSY",
        "Wait for the current preview or update.",
        409,
      );
    this.applying = true;
    try {
      return await this.printing().freeze(candidateId, revision, checks, notes);
    } finally {
      this.applying = false;
    }
  }
}
