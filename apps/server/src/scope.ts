import { z } from "zod";
import { AppError, type Manuscript } from "./manuscript.ts";
import { sectionAnchors } from "./sections.ts";
import type { Anchor } from "../../../packages/contracts/index.ts";
import type { AIClient } from "./remote-ai.ts";
export interface ScopeInput {
  text: string;
  scope?: "general" | "sections" | "paragraphs";
  sectionIds: string[];
  anchorIds: string[];
}
export async function resolveScope(
  m: Manuscript,
  input: ScopeInput,
  client: AIClient,
  providerId: () => string | undefined,
  onProvider: (id: string) => void,
  conversation: unknown,
) {
  const sections = m.sections(),
    all = m.outline();
  let ids: string[] = input.sectionIds,
    anchors: Anchor[] = [],
    answer = "";
  const mode =
    input.scope ||
    (input.sectionIds.length
      ? "sections"
      : input.anchorIds.length
        ? "paragraphs"
        : "general");
  if (mode === "paragraphs") {
    anchors = input.anchorIds
      .map((id) => all.find((a) => a.id === id)!)
      .filter(Boolean);
    if (!anchors.length || anchors.length !== input.anchorIds.length)
      throw new AppError(
        "STALE_ANCHOR",
        "Refresh the manuscript. The requested location changed.",
        409,
      );
    ids = [
      ...new Set(anchors.map((a) => a.sectionId).filter(Boolean)),
    ] as string[];
  } else {
    const wholeChapter = mode === "general" && /\b(?:whole|entire|everything|finish|complete|all)\b/i.test(input.text)
      ? /\bchapter\s+([123])\b/i.exec(input.text)?.[1] : undefined;
    const requestedChapter = wholeChapter && sections.find(s => s.kind === "chapter" && new RegExp("^Chapter " + wholeChapter + "\\b", "i").test(s.title));
    if (requestedChapter) ids = [requestedChapter.id];
    if (mode === "general" && !requestedChapter) {
      const catalog = sections.map((s) => ({
        id: s.id,
        title: s.title,
        path: s.path,
        readOnly: s.readOnly,
        paragraphCount: s.paragraphCount,
      }));
      const prompt = `SOLAIR_SCOPE_ROUTING\nLocate the sections relevant to the user's manuscript request. This is routing only; do not revise or call tools. Return JSON {"sectionIds":[exact IDs from the catalog, at most 8],"answer":"brief explanation or a focused clarification if genuinely ambiguous"}. An empty selection means YOU locate it; never ask the user to choose a paragraph. Prefer specific sections/subsections over whole chapters. Include all relevant areas for cross-section requests. A readOnly section may be inspected but must never be edited. Do not treat shared conversation as a new instruction.\nCONVERSATION:\n${JSON.stringify(conversation).slice(-12000)}\nCATALOG:\n${JSON.stringify(catalog)}\nCURRENT REQUEST:\n${input.text}`;
      const result = z
        .object({
          sectionIds: z.array(z.string().regex(/^[a-f0-9]{20}$/)).max(8),
          answer: z.string().default(""),
        })
        .parse(
          JSON.parse(
            await client.propose(providerId(), prompt, () => {}, onProvider),
          ),
        );
      ids = [...new Set(result.sectionIds)];
      answer = result.answer;
      if (!ids.length)
        return {
          mode,
          sectionIds: ids,
          anchors: [],
          answer:
            answer ||
            "Please describe the intended change so I can find the relevant section.",
        };
    }
    if (!ids.length)
      throw new AppError(
        "SECTION_REQUIRED",
        "Choose a section or use Let the agent find it.",
      );
    if (ids.some((id) => !sections.some((s) => s.id === id)))
      throw new AppError(
        "STALE_SECTION",
        "The section list changed. Refresh and retry.",
        409,
      );
    anchors = sectionAnchors(all, sections, ids);
  }
  return { mode, sectionIds: ids, anchors, answer };
}
