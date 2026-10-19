import { z } from "zod";
import type {
  ManuscriptWorkbench,
  SectionNode,
  Source,
} from "../../../packages/contracts/index.ts";
import { AppError } from "./errors.ts";
import type { Store } from "./store.ts";
import { sourceBytes, sourceContentFingerprint } from "./source-snapshots.ts";
const label = z.string().trim().min(1).max(3000);
const key = z.string().regex(/^[a-f0-9]{20}$/);
export const workbenchSchema = z
  .object({
    findings: z
      .array(
        z
          .object({
            statement: label,
            kind: z.enum([
              "team_report",
              "measurement_report",
              "seller_rating",
              "calculation",
              "proposal",
              "conflict",
              "unresolved",
            ]),
            references: z
              .array(
                z
                  .object({
                    sourceId: z.string().uuid(),
                    quote: z.string().trim().min(5).max(1500),
                  })
                  .strict(),
              )
              .min(1)
              .max(8),
            sectionIds: z.array(key).max(8),
            disposition: z.enum([
              "use_with_attribution",
              "hold",
              "superseded",
              "needs_confirmation",
            ]),
            rationale: label,
          })
          .strict(),
      )
      .max(40),
    figures: z
      .array(
        z
          .object({
            title: label,
            kind: z.enum(["source_visual", "human_edit"]),
            sectionId: key.nullable(),
            anchorId: key.nullable(),
            figureId: key.nullable(),
            sourceId: z.string().uuid().nullable(),
            pageUrl: z.string().max(2000).nullable(),
            imageUrl: z.string().max(2000).nullable(),
            locator: label,
            caption: label,
            attribution: label,
            reuse: label,
            instructions: z.array(label).max(16),
            checks: z.array(label).max(16),
          })
          .strict(),
      )
      .max(12),
    nextSteps: z.array(label).max(12),
  })
  .strict();

const whitespace = (s: string) => s.replace(/\s+/g, " ").trim();
export function assertWorkbenchBindings(
  store: Store,
  plan: ManuscriptWorkbench,
) {
  for (const [id, hash] of Object.entries(plan.sourceBindings)) {
    const source = store.get<Source>("source", id);
    if (!source || sourceContentFingerprint(source) !== hash)
      throw new AppError(
        "SOURCE_PLAN_STALE",
        "Source content or its description changed. Consolidate again before using this plan.",
        409,
      );
    sourceBytes(store, source);
  }
}
export function httpsPublicUrl(value: string) {
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    throw new AppError(
      "INVALID_PUBLIC_URL",
      "Use a complete public HTTPS source URL.",
    );
  }
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    (u.port && u.port !== "443") ||
    /(^|\.)(localhost|local|internal|trycloudflare\.com)$/.test(u.hostname) ||
    /^\[|^\d+(\.\d+)*$/.test(u.hostname)
  )
    throw new AppError(
      "INVALID_PUBLIC_URL",
      "Use an ordinary public HTTPS source, without credentials or private hostnames.",
    );
  u.hash = "";
  return u.href;
}

/** A quotation must occur in the actual excerpt supplied to this model turn. */
export function validateWorkbench(
  input: unknown,
  supplied: Map<string, string>,
  sources: Source[],
  sections: SectionNode[],
  anchors: { id: string }[],
  figures: { id: string }[],
  openedPages: string[],
  bindings: Record<string, string>,
  revision: string,
): ManuscriptWorkbench {
  const result = workbenchSchema.parse(input);
  const sectionExists = (s: string) => sections.some((v) => v.id === s);
  for (const finding of result.findings) {
    if (finding.sectionIds.some((s) => !sectionExists(s)))
      throw new AppError(
        "INVALID_SOURCE_PLAN",
        "A suggested section is stale. Refresh and ask for a new source consolidation.",
        409,
      );
    for (const ref of finding.references) {
      if (
        !supplied.has(ref.sourceId) ||
        !whitespace(supplied.get(ref.sourceId)!).includes(whitespace(ref.quote))
      )
        throw new AppError(
          "UNSUPPORTED_SOURCE_QUOTE",
          "The assistant cited text outside the supplied source excerpts. No proposal was created; ask for a corrected consolidation.",
          409,
        );
    }
  }
  const normal = (s: string) => {
    try {
      return httpsPublicUrl(s);
    } catch {
      return "";
    }
  };
  const observed = new Set(openedPages.map(normal).filter(Boolean));
  const safeFigures = result.figures.map((f) => {
    if (
      (f.sectionId && !sectionExists(f.sectionId)) ||
      (f.anchorId && !anchors.some((a) => a.id === f.anchorId)) ||
      (f.figureId && !figures.some((a) => a.id === f.figureId)) ||
      (f.sourceId && !sources.some((s) => s.id === f.sourceId))
    )
      throw new AppError(
        "INVALID_FIGURE_BRIEF",
        "The figure brief references an unavailable source or manuscript location. Ask for a fresh brief.",
        409,
      );
    if (f.pageUrl) f.pageUrl = httpsPublicUrl(f.pageUrl);
    if (f.imageUrl) f.imageUrl = httpsPublicUrl(f.imageUrl);
    return {
      ...f,
      pageObserved: Boolean(
        f.pageUrl &&
          (observed.has(f.pageUrl) ||
            sources.some(
              (s) => normal(s.provenance?.pageUrl || "") === f.pageUrl,
            )),
      ),
    };
  });
  return {
    ...result,
    figures: safeFigures,
    sourceBindings: bindings,
    manuscriptRevision: revision,
  };
}

/** Diverse excerpts, with line coordinates, rather than silently taking only the beginning. */
export function sourceExcerpt(text: string, query: string, cap: number) {
  if (text.length <= cap)
    return {
      text,
      coverage: `${text.length} of ${text.length} characters; complete text snapshot`,
    };
  const lines = text.split("\n"),
    terms = [
      ...new Set(
        (query.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []).filter(
          (t) =>
            ![
              "the",
              "and",
              "with",
              "from",
              "this",
              "that",
              "manuscript",
              "source",
              "sources",
              "please",
            ].includes(t),
        ),
      ),
    ];
  const offsets: number[] = [];
  let offset = 0;
  for (const line of lines) {
    offsets.push(offset);
    offset += line.length + 1;
  }
  const ranked = lines
    .map((line, i) => ({
      i,
      score: terms.reduce(
        (n, t) => n + (line.toLowerCase().includes(t) ? 1 : 0),
        0,
      ),
    }))
    .filter((v) => v.score)
    .sort((a, b) => b.score - a.score || a.i - b.i);
  const picked = new Set<number>();
  let budget = cap;
  const add = (i: number) => {
    if (
      i >= 0 &&
      i < lines.length &&
      !picked.has(i) &&
      lines[i].length + 45 <= budget
    ) {
      picked.add(i);
      budget -= lines[i].length + 45;
    }
  };
  for (let i = 0; i < Math.min(10, lines.length); i++) add(i);
  for (const { i } of ranked) for (let j = i - 1; j <= i + 2; j++) add(j);
  // Retain dispersed coverage even for a generic "consolidate everything" request.
  for (
    let i = 0;
    i < lines.length;
    i += Math.max(1, Math.floor(lines.length / 20))
  )
    for (let j = i; j < i + 3; j++) add(j);
  let result = [...picked]
    .sort((a, b) => a - b)
    .map((i) => `[Line ${i + 1}; character ${offsets[i]}] ${lines[i]}`)
    .join("\n");
  if (!result)
    result = `[Characters 0–${cap - 50}]\n${text.slice(0, cap - 50)}`;
  return {
    text: result,
    coverage: `Partial relevant/dispersed excerpts from ${text.length} characters; ${picked.size} of ${lines.length} lines. Omitted material is NOT reviewed. Request a focused follow-up for missing coverage.`,
  };
}

export const editorialPolicy = `MANUSCRIPT CONSOLIDATION: Work with the team through back-and-forth Q&A. Consolidate their Chapter 1 draft and Chapter 3 changes before proposing final wording; Chapter 2 needs literature-supported visuals. Retained sources are context across follow-ups, never proof of human review. Compare conflicting dates/numbers/status, identify superseded claims, separate reported measurements, seller/nameplate ratings, calculations with explicit inputs, proposals and unresolved decisions. A team's "confirmed" heading is still a supplied report unless original evidence was inspected. Latest wind correction: 300 W SELLER-LISTED; turbine/controller UNLABELLED; earlier 400 W wind claim superseded. Solar is separately 2 × 200 W. Do not finalize wind integration, SOP4.2 or charging parameters. Preserve finalized SOP.
For source consolidation return workbench findings with exact short quotations from supplied SOURCE/CHAT ATTACHMENT excerpts and their source IDs, suggested real section IDs, disposition and rationale. Mark conflicts/unknowns hold or needs_confirmation. Ask only the decision needed, continue independent work and propose a manageable next batch. Never silently settle contradictory evidence or describe a plan as completed testing.
VISUAL POLICY: Research visuals only from original public sources or supplied team originals. Never generate/reconstruct a research image or data, draw an invented diagram, manufacture a graph or infer image contents from a filename. Chapter 2 visuals must explain the reviewed literature, be relevant beside a specific passage and carry an original source URL, page/figure locator, proposed caption, attribution and reuse/permission status (unknown unless supported). Use workbench.figures for candidates, not Google write operations. Open the original source page; collect its exact linked PNG/JPEG URL if available. An image search thumbnail alone is insufficient. If only PDF/SVG/scan is available, give exact page/figure extraction or upload instructions; do not fabricate a raster URL. Do not search private manuscript quotations; use generic public technical topics.
For Chapter 3 human edits, return kind human_edit with actual supplied figureId when available; list exact existing/proposed blocks, directional arrows, power/data legend, wording, values ONLY supported by evidence, caption/cross-reference changes, unresolved placeholders and final export/upload checks. Do not claim to have inspected image pixels: the agent receives inventory/captions, not the image. Ask for a description or annotate uncertainty about existing geometry. Block diagrams are conceptual proposals until the team confirms the design, not approved electrical wiring. The human edits the original, uploads PNG/JPEG and follows the normal reviewed replacement flow.
FORMATTING AUTHORITY: Use the current native protected THESIS LAYOUT tab, including its supplied written instructions and role-specific samples. Written requirements take precedence over a conflicting placeholder's incidental style. Surface unresolved text/style conflicts; never guess table/title/equation exceptions. Preserve headers, borders, native objects and unrequested styles. No global rebuild or blanket spacing reset. Native verification and affected-page PDF review are distinct from content approval; never promise perfect pagination from metadata alone.
Return workbench null when no useful structured consolidation/figure brief is requested; otherwise {findings,figures,nextSteps}. These are drafts, never source approval or successful manuscript writes.`;
