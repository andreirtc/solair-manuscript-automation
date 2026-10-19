import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import type { SectionNode, Anchor } from "../../../packages/contracts/index.ts";
const Engine = createRequire(import.meta.url)(
  "../../../packages/engine/Core.cjs",
);
const normalized = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const excluded =
  /^(?:figure|table)\s+\d|^(?:insert text|where|member\s+\d|\(|page$)|[.!?;:]$/i;
function plain(p: any) {
  return (
    !p.location &&
    p.text.trim() &&
    p.text.trim().length <= 140 &&
    !/[\uFFFC\uE000-\uF8FF\v]/.test(p.text) &&
    !p.paragraph.bullet &&
    !excluded.test(p.text.trim())
  );
}
const major =
  /^(?:Introduction|Theoretical Framework|Conceptual Framework|Statement of the Problem|Hypothesis|Scope and Limitations(?: of the Study)?|Significance of the Study|Definition of Terms|Research Design|Description of Research Instrument Used|Statistical Treatment|Design Project Flow|Hardware Component Requirements|Software Component Requirements|Review of Related Literature|Related Studies|Synthesis|References|Bibliography|Appendices)$/i;
export function buildSections(
  raw: any,
  tabId = "t.rf2v4q59t7sc",
): SectionNode[] {
  if (!raw) return [];
  const d = Engine.normalize(raw),
    tab = d.tabs.find((t: any) => t.tabId === tabId);
  if (!tab) return [];
  const ps = Engine.paragraphs(tab),
    sop = Engine.protectedSection(ps),
    reference = d.tabs.find((t: any) => t.tabId === "t.xmpxojg07hrf");
  const rp = reference ? Engine.paragraphs(reference) : [],
    firstReferenceChapter = rp.findIndex((p: any) =>
      /^chapter\s+\d+$/i.test(p.text.trim()),
    );
  const templateTitles = new Set(
    rp
      .slice(Math.max(0, firstReferenceChapter))
      .filter(
        (p: any) =>
          plain(p) &&
          !/^chapter\s+\d+$/i.test(p.text.trim()) &&
          !/^[A-Z\s]+$/.test(p.text.trim()),
      )
      .map((p: any) => normalized(p.text)),
  );
  const nodes: SectionNode[] = [],
    stack: SectionNode[] = [],
    occurrences = new Map<string, number>();
  const end = ps.at(-1)?.end || 0;
  function add(
    title: string,
    level: number,
    start: number,
    kind: SectionNode["kind"],
  ) {
    while (stack.length && stack.at(-1)!.level >= level) stack.pop();
    const parent = stack.at(-1),
      key = (parent?.id || "root") + ":" + normalized(title),
      n = (occurrences.get(key) || 0) + 1;
    occurrences.set(key, n);
    const node: SectionNode = {
      id: createHash("sha256")
        .update(key + ":" + n)
        .digest("hex")
        .slice(0, 20),
      title,
      level,
      kind,
      parentId: parent?.id,
      path: [...(parent?.path || []), title],
      start,
      end,
      readOnly: false,
      containsProtected: false,
      paragraphCount: 0,
      children: [],
    };
    if (parent) parent.children.push(node.id);
    nodes.push(node);
    stack.push(node);
  }
  add("Front matter", 1, ps[0]?.start || 0, "front_matter");
  let inChapter = false,
    skipTitleAt = -1;
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i],
      text = p.text.trim();
    if (p.location || !text) continue;
    if (/^chapter\s+\d+$/i.test(text)) {
      const next = ps.slice(i + 1).find((q: any) => q.text.trim());
      const nextText = next?.text.trim() || "";
      const chapterTitle =
        nextText.length < 100 && /^[A-Z\s&-]+$/.test(nextText) ? nextText : "";
      skipTitleAt = chapterTitle ? next.start : -1;
      add(
        chapterTitle ? text + " — " + chapterTitle : text,
        1,
        p.start,
        "chapter",
      );
      inChapter = true;
      continue;
    }
    if (!inChapter || p.start === skipTitleAt || !plain(p)) continue;
    const runs = p.paragraph.elements.filter((e: any) =>
      e.textRun?.content.trim(),
    );
    const bold =
      runs.length > 0 &&
      runs.every((e: any) => e.textRun.textStyle?.bold === true);
    const semantic = String(
      p.paragraph.paragraphStyle?.namedStyleType || "",
    ).match(/^HEADING_([1-6])$/);
    if (major.test(text) || templateTitles.has(normalized(text)))
      add(text, 2, p.start, "section");
    else if (semantic || bold) {
      const numbering = text.match(/^(\d+(?:\.\d+)+)[.\s]/),
        depth = numbering ? numbering[1].split(".").length : 0;
      const level = semantic
        ? Math.max(2, Math.min(6, Number(semantic[1]) + 1))
        : depth
          ? Math.min(6, depth + 1)
          : 3;
      add(text, level, p.start, level === 2 ? "section" : "subsection");
    }
  }
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    node.end =
      nodes.slice(i + 1).find((n) => n.level <= node.level)?.start || end;
    node.readOnly = node.start >= sop.start && node.end <= sop.end;
    node.containsProtected = node.start < sop.end && node.end > sop.start;
    node.paragraphCount = ps.filter(
      (p: any) => p.text.trim() && p.start >= node.start && p.start < node.end,
    ).length;
  }
  return nodes.filter((n) => n.paragraphCount > 0);
}
export function annotateAnchors(
  anchors: Anchor[],
  sections: SectionNode[],
): Anchor[] {
  return anchors.map((a) => {
    const s = sections
      .filter((s) => a.start >= s.start && a.start < s.end)
      .sort((a, b) => b.level - a.level)[0];
    return {
      ...a,
      section: s?.path.join(" › ") || a.section,
      sectionId: s?.id,
      sectionPath: s?.path,
    };
  });
}
export function sectionAnchors(
  anchors: Anchor[],
  sections: SectionNode[],
  ids: string[],
): Anchor[] {
  const chosen = ids.map((id) => sections.find((s) => s.id === id));
  if (chosen.some((s) => !s))
    throw new Error("A selected section changed. Refresh the section list.");
  return anchors.filter((a) =>
    chosen.some((s) => a.start >= s!.start && a.start < s!.end),
  );
}
