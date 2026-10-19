import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import type {
  Job,
  Anchor,
  ReviewPreview,
} from "../../../packages/contracts/index.ts";
const Engine = createRequire(import.meta.url)(
  "../../../packages/engine/Core.cjs",
);
export function digest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function removed(before: string, after: string) {
  let start = 0,
    end = 0;
  while (
    start < Math.min(before.length, after.length) &&
    before[start] === after[start]
  )
    start++;
  while (
    end < Math.min(before.length - start, after.length - start) &&
    before[before.length - 1 - end] === after[after.length - 1 - end]
  )
    end++;
  return before.slice(start, before.length - end);
}
export function previewReview(
  raw: any,
  job: Job,
  plan: any,
  anchors: Anchor[],
): ReviewPreview {
  const d = Engine.normalize(raw),
    tab = d.tabs.find((t: any) => t.tabId === "t.rf2v4q59t7sc"),
    ps = Engine.paragraphs(tab);
  const changes = plan.changes.map((change: any, index: number) => {
    const text =
      change.type === "replace_text"
        ? change.before
        : change.text || change.caption || "";
    const matches = ps.filter((p: any) =>
      change.type === "replace_text"
        ? p.text.includes(change.before)
        : p.text.trim() === text,
    );
    const p =
        change.paragraph_start !== undefined
          ? ps.find((p: any) => p.start === change.paragraph_start)
          : matches.length === 1
            ? matches[0]
            : undefined,
      anchor = anchors.find((a) => a.start === p?.start);
    const figure =
      change.type === "insert_figure" || change.type === "replace_figure";
    const riskFlags: string[] = [],
      before =
        change.type === "replace_text"
          ? p?.text.trim() || change.before
          : change.type === "insert_figure"
            ? p?.text.trim() || change.anchor
            : change.type === "replace_figure"
              ? change.before_caption +
                `\n[Existing figure ${change.old_image_id} will be replaced]`
              : change.text || "",
      after =
        change.type === "replace_text"
          ? change.expected_paragraph_after?.trim() || change.after
          : figure
            ? (change.type === "insert_figure" ? before + "\n" : "") +
              change.caption +
              `\n[Private figure ${change.asset_id}; ${change.width_pt.toFixed(1)} × ${change.height_pt.toFixed(1)} pt, caption above image]`
            : before;
    if (change.type === "replace_text") {
      riskFlags.push("wording_revision");
      if (!change.after.trim() || after.length < before.length)
        riskFlags.push("removes_text");
      if (
        Math.abs(after.length - before.length) >
        Math.max(40, before.length * 0.3)
      )
        riskFlags.push("substantial_revision");
      if (
        /problem|scope|hypothesis|method|instrument|statistic|result|finding/i.test(
          anchor?.section || "",
        )
      )
        riskFlags.push("research_scope_or_method");
    }
    if (/figure/.test(change.type)) riskFlags.push("figure_material");
    if (change.type === "replace_figure")
      riskFlags.push("removes_existing_figure");
    const formattingBefore: Record<string, unknown> = {};
    if (change.paragraph_style)
      for (const key of Object.keys(change.paragraph_style))
        formattingBefore[key] =
          p?.paragraph.paragraphStyle?.[key] ??
          tab.namedStyles?.styles?.find(
            (s: any) =>
              s.namedStyleType === p?.paragraph.paragraphStyle?.namedStyleType,
          )?.paragraphStyle?.[key] ??
          null;
    if (change.text_style) {
      formattingBefore.textRuns =
        p?.paragraph.elements
          .filter((e: any) => e.textRun?.content.trim())
          .map((e: any) => ({
            text: e.textRun.content,
            style: e.textRun.textStyle,
          })) || [];
    }
    return {
      id: digest({ index, change }).slice(0, 20),
      type: change.type,
      sectionPath: anchor?.sectionPath || [],
      before,
      after,
      removedText: change.type === "replace_text" ? removed(before, after) : "",
      formattingBefore: change.paragraph_style ? formattingBefore : undefined,
      formattingAfter: change.text_style
        ? { ...change.paragraph_style, textStyle: change.text_style }
        : change.paragraph_style,
      evidence: change.evidence,
      riskFlags,
      sourceId: figure ? change.asset_id : undefined,
      beforeFigureId: change.old_image_id
        ? createHash("sha256")
            .update(change.old_image_id)
            .digest("hex")
            .slice(0, 20)
        : undefined,
    };
  });
  const riskFlags = [
    ...new Set(changes.flatMap((c: any) => c.riskFlags)),
  ] as string[];
  const hash = digest({
    jobId: job.id,
    revision: job.baseRevision,
    operations: job.operations,
    sourceBindings: job.sourceBindings,
    changes,
  });
  return {
    hash,
    revision: job.baseRevision!,
    changes,
    riskFlags,
    requiresNotes: job.sourceReviewMode !== "proposal_review" && riskFlags.length > 0,
    status: "needs_review",
  };
}
