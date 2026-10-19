import { createRequire } from "node:module";
import type {
  Anchor,
  Operation,
  SectionNode,
} from "../../../packages/contracts/index.ts";
import { manuscriptFigures } from "./figures.ts";
const Engine = createRequire(import.meta.url)(
  "../../../packages/engine/Core.cjs",
);
const paragraphFields = [
  "alignment",
  "lineSpacing",
  "spaceAbove",
  "spaceBelow",
  "indentFirstLine",
  "indentStart",
  "indentEnd",
];
const fontFields = ["weightedFontFamily", "fontSize"];
function normal(tab: any, p: any) {
  return (
    tab.namedStyles?.styles?.find(
      (s: any) =>
        s.namedStyleType ===
        (p.paragraph.paragraphStyle?.namedStyleType || "NORMAL_TEXT"),
    ) || {}
  );
}
function properties(value: any, fields: string[]) {
  return Object.fromEntries(
    fields.filter((k) => value[k] !== undefined).map((k) => [k, value[k]]),
  );
}
function sample(tab: any, p: any) {
  const n = normal(tab, p),
    run = p.paragraph.elements.find((e: any) => e.textRun?.content.trim());
  const textStyle = properties(
    { ...n.textStyle, ...run?.textRun.textStyle },
    fontFields,
  );
  if (textStyle.weightedFontFamily)
    textStyle.weightedFontFamily = {
      fontFamily: textStyle.weightedFontFamily.fontFamily,
    };
  return {
    referenceText: p.text.trim(),
    paragraphStyle: properties(
      { ...n.paragraphStyle, ...p.paragraph.paragraphStyle },
      paragraphFields,
    ),
    textStyle,
  };
}
/** Role samples are taken from the protected school tab, never guessed from NORMAL_TEXT. */
export function layoutProfile(raw: any) {
  const d = Engine.normalize(raw),
    tab = d.tabs.find((t: any) => t.tabId === "t.xmpxojg07hrf");
  if (!tab || tab.title !== "THESIS LAYOUT")
    throw new Error("The school reference tab is missing.");
  const ps = Engine.paragraphs(tab),
    intro = ps.find(
      (p: any) => !p.location && p.text.trim().toLowerCase() === "introduction",
    );
  const body = ps.find(
    (p: any) =>
      !p.location &&
      p.start > (intro?.start || 0) &&
      /^Insert Text/.test(p.text.trim()) &&
      p.paragraph.paragraphStyle?.alignment === "JUSTIFIED" &&
      !/\uFFFC/.test(p.text),
  );
  const caption = ps.find(
    (p: any) => !p.location && /^Figure 1\. Title/.test(p.text.trim()),
  );
  if (!body || !caption)
    throw new Error(
      "Cannot uniquely establish school body and figure-caption samples.",
    );
  const image = ps.find(
    (p: any) =>
      p.start > caption.start &&
      p.paragraph.elements.some((e: any) => e.inlineObjectElement),
  );
  const style = tab.documentStyle || d.documentStyle;
  const instructions = ps
    .filter((p: any) =>
      /spacing|spaced|spaces|font|point|margin|inch|Arial|caption|heading|subheading|block diagram/i.test(
        p.text,
      ),
    )
    .map((p: any) => ({
      start: p.start,
      text: p.text.trim().replace(/\v/g, "\n"),
    }));
  const bodySample = sample(tab, body),
    captionSample = sample(tab, caption),
    writtenBody = /It should be Arial,\s*11,?\s*and double spaced/i.test(
      body.text,
    ),
    writtenCaption = /It should be Arial,\s*11,?\s*and double spaced/i.test(
      caption.text,
    );
  const resolveWritten = (role: ReturnType<typeof sample>, written: boolean) =>
    written
      ? {
          ...role,
          paragraphStyle: { ...role.paragraphStyle, lineSpacing: 200 },
          textStyle: {
            ...role.textStyle,
            weightedFontFamily: { fontFamily: "Arial" },
            fontSize: { magnitude: 11, unit: "PT" },
          },
        }
      : role;
  const writtenConflicts = [
    ...[
      { name: "body", role: bodySample, written: writtenBody },
      { name: "figure_caption", role: captionSample, written: writtenCaption },
    ]
      .filter(
        (v) =>
          v.written &&
          (v.role.paragraphStyle.lineSpacing !== 200 ||
            v.role.textStyle.fontSize?.magnitude !== 11 ||
            v.role.textStyle.weightedFontFamily?.fontFamily !== "Arial"),
      )
      .map((v) => ({
        role: v.name,
        instruction: "Arial 11, double spaced",
        sample: v.role,
        resolution:
          "Use the explicit written instruction for these supported properties; preserve other sampled fields.",
      })),
  ];
  return {
    referenceTabId: tab.tabId,
    revision: d.revisionId,
    writtenInstructions: instructions,
    writtenConflicts,
    manualChecks: [
      "Title: inverted pyramid, 14-point Arial/all caps; other title-page entries 12-point Arial, where the native written instruction states it.",
      "Interpret literal title/heading SPACE instructions in the rendered layout; do not convert a line count into guessed paragraph points.",
      "The reference requires two full text lines with a subheading at a page bottom; inspect actual PDF pagination.",
      "Tables, native equations, headers/borders, contents/figure-list numbers and caption-image flow require role-specific native/PDF review.",
    ],
    page: properties(style, [
      "pageSize",
      "marginTop",
      "marginBottom",
      "marginLeft",
      "marginRight",
    ]),
    roles: {
      body: resolveWritten(bodySample, writtenBody),
      figureCaption: resolveWritten(captionSample, writtenCaption),
      figureImage: image ? sample(tab, image) : undefined,
      sectionHeading: intro ? sample(tab, intro) : undefined,
    },
    captionPlacement: "above_image",
    notes: [
      "Page metadata and native style audit cannot establish printed pagination; PDF review is required.",
      "Title pages, tables, equations, numbered lists and ambiguous short paragraphs are excluded from body repair.",
      "Body indents have template exceptions. Automatic body repair uses font, alignment and spacing only; indent changes require a specific request.",
    ],
  };
}
function equivalent(a: any, b: any): boolean {
  if (b && typeof b === "object")
    return Object.keys(b).every((k) =>
      equivalent(a?.[k] ?? (k === "magnitude" ? 0 : undefined), b[k]),
    );
  return a === b;
}
export function auditLayout(
  raw: any,
  anchors: Anchor[],
  sections: SectionNode[],
  sectionIds: string[] = [],
) {
  const profile = layoutProfile(raw),
    d = Engine.normalize(raw),
    tab = d.tabs.find((t: any) => t.tabId === "t.rf2v4q59t7sc"),
    ps = Engine.paragraphs(tab);
  if (sectionIds.some((id) => !sections.some((s) => s.id === id)))
    throw new Error("A selected section is stale.");
  const scopes = sections.filter((s) => sectionIds.includes(s.id)),
    headings = new Set(sections.map((s) => s.start));
  const captions = new Set(
    manuscriptFigures(raw, anchors)
      .filter((f) => !f.readOnly)
      .map((f) => f.captionStart),
  );
  const issues: any[] = [],
    excluded: Record<string, number> = {};
  const skip = (reason: string) => {
    excluded[reason] = (excluded[reason] || 0) + 1;
  };
  for (const p of ps) {
    const a = anchors.find((a) => a.start === p.start);
    if (!a) continue;
    if (
      scopes.length &&
      !scopes.some((s) => p.start >= s.start && p.start < s.end)
    )
      continue;
    if (a.protected) {
      skip("protected_sop");
      continue;
    }
    if (p.location) {
      skip("table_cell");
      continue;
    }
    if (
      p.paragraph.elements.some((e: any) => !e.textRun) ||
      /[\uE000-\uF8FF\v]/.test(p.text)
    ) {
      skip("native_object_or_control");
      continue;
    }
    if (
      p.paragraph.elements.some(
        (e: any) =>
          e.suggestedInsertionIds ||
          e.suggestedDeletionIds ||
          e.textRun?.suggestedTextStyleChanges,
      )
    ) {
      skip("suggestion");
      continue;
    }
    const section = sections.find((s) => s.id === a.sectionId),
      text = p.text.trim();
    const isCaption = captions.has(p.start);
    if (
      !isCaption &&
      (section?.kind === "front_matter" ||
        headings.has(p.start) ||
        p.paragraph.bullet ||
        text.length < 140 ||
        /^(?:Figure|Table|Where|References|Bibliography|Appendix)\b/i.test(
          text,
        ) ||
        section?.path.some((s) =>
          /^(?:References|Bibliography|Appendices)$/i.test(s),
        ))
    ) {
      skip("role_exception");
      continue;
    }
    const n = normal(tab, p),
      current = { ...n.paragraphStyle, ...p.paragraph.paragraphStyle };
    const role = isCaption ? profile.roles.figureCaption : profile.roles.body;
    const desired = isCaption
      ? { ...role.paragraphStyle, keepWithNext: true, keepLinesTogether: true }
      : properties(role.paragraphStyle, [
          "alignment",
          "lineSpacing",
          "spaceAbove",
          "spaceBelow",
        ]);
    const delta = Object.fromEntries(
      Object.entries(desired).filter(([k, v]) => !equivalent(current[k], v)),
    );
    const fonts = role.textStyle;
    const fontMismatch = p.paragraph.elements.some(
      (e: any) =>
        e.textRun?.content.trim() &&
        !equivalent({ ...n.textStyle, ...e.textRun.textStyle }, fonts),
    );
    if (Object.keys(delta).length || fontMismatch)
      issues.push({
        anchorId: a.id,
        sectionPath: a.sectionPath,
        text,
        role: isCaption ? "figure_caption" : "body",
        paragraphStyle: delta,
        textStyle: fontMismatch ? fonts : undefined,
      });
  }
  const pageIssues = Object.entries(profile.page)
    .filter(
      ([k, v]) => !equivalent((tab.documentStyle || d.documentStyle)?.[k], v),
    )
    .map(([property, expected]) => ({
      property,
      expected,
      actual: (tab.documentStyle || d.documentStyle)?.[property],
      repair: "manual_review_required",
    }));
  return {
    profile,
    revision: d.revisionId,
    issues,
    pageIssues,
    excluded,
    readOnly: true,
  };
}
export function layoutOperations(
  audit: ReturnType<typeof auditLayout>,
): Operation[] {
  return audit.issues.slice(0, 25).map((issue) => ({
    type: "format_paragraph" as const,
    anchorId: issue.anchorId,
    expected_text: issue.text,
    paragraph_style: Object.keys(issue.paragraphStyle).length
      ? issue.paragraphStyle
      : { lineSpacing: audit.profile.roles.body.paragraphStyle.lineSpacing },
    text_style: issue.textStyle,
    evidence:
      issue.role === "figure_caption"
        ? "User-requested school-layout caption repair: sampled caption style and keep-with-next to prevent separation from its image."
        : "User-requested school-layout repair, sampled from protected THESIS LAYOUT body example; font/alignment/spacing only.",
  }));
}
