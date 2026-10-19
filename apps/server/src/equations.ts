import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import type {
  Anchor,
  EquationItem,
  EquationsSummary,
} from "../../../packages/contracts/index.ts";
const Engine = createRequire(import.meta.url)(
  "../../../packages/engine/Core.cjs",
);
/** Inventory is document evidence. Topic guesses and nominal hardware values are never verified facts. */
export function manuscriptEquations(
  raw: any,
  anchors: Anchor[],
  tabId = "t.rf2v4q59t7sc",
): EquationsSummary {
  const capabilities = {
    nativeEquationEditing: "unsupported_by_google_docs_api" as const,
    preservation: "enforced_by_readback_and_preservation_hash" as const,
    supportedOperations: [
      "preserve_native",
      "edit_exact_narrative_runs_around_equations",
      "manual_docs_equation_edit_with_review",
    ],
  };
  const result: EquationsSummary = {
    totalCount: 0,
    nativeCount: 0,
    standaloneCount: 0,
    inlineCount: 0,
    capabilities,
    equations: [],
  };
  if (!raw) return result;
  const doc = Engine.normalize(raw),
    tab = doc.tabs.find((t: any) => t.tabId === tabId);
  if (!tab) return result;
  const ps = Engine.paragraphs(tab),
    sop = Engine.protectedSection(ps);
  const readable = (p: any) =>
    p?.paragraph.elements
      .map((e: any) =>
        e.textRun
          ? e.textRun.content
          : e.equation
            ? " [native equation] "
            : e.inlineObjectElement
              ? " [image] "
              : " [native object] ",
      )
      .join("")
      .trim() || "";
  ps.forEach((p: any, i: number) => {
    const count = p.paragraph.elements.filter((e: any) => e.equation).length;
    if (!count) return;
    const standalone = p.paragraph.elements.every(
        (e: any) => e.equation || (e.textRun && !e.textRun.content.trim()),
      ),
      anchor = anchors.find((a) => a.start === p.start),
      readOnly = p.start < sop.end && p.end > sop.start;
    result.nativeCount += count;
    result.totalCount += count;
    if (standalone) result.standaloneCount += count;
    else result.inlineCount += count;
    const surroundingText = [
      readable(ps[i - 1]),
      readable(p),
      readable(ps[i + 1]),
    ]
      .filter(Boolean)
      .join("\n");
    result.equations.push({
      id: createHash("sha256")
        .update(p.start + ":" + readable(p))
        .digest("hex")
        .slice(0, 20),
      sectionId: anchor?.sectionId,
      sectionPath: anchor?.sectionPath,
      anchorId: anchor?.id,
      paragraphStart: p.start,
      paragraphEnd: p.end,
      equationType: "native",
      isStandalone: standalone,
      surroundingText,
      label: standalone ? "Display equation" : "Equation within text",
      symbolsAndVariables: [],
      verifiedConstants: [],
      missingOrPendingParameters: [
        "Read the original formula and verify every variable, unit, constant and numerical substitution against reviewed sources. The inventory does not validate scientific correctness.",
      ],
      readOnly,
      manualEditGuidance: readOnly
        ? "This item overlaps the finalized protected SOP. It cannot be changed through automation."
        : "Native formula editing is not supported by the Google Docs update API. Open the manuscript tab and edit the equation in Google Docs, then refresh and review the changed PDF. The app can propose edits within an exact narrative text run around equations, while protecting the formula and other native objects.",
    } satisfies EquationItem);
  });
  return result;
}
