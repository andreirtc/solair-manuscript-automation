import { createRequire } from "node:module";
const Engine = createRequire(import.meta.url)(
  "../../../packages/engine/Core.cjs",
);
function stable(v: any): any {
  if (Array.isArray(v)) return v.map(stable);
  if (v && typeof v === "object")
    return Object.fromEntries(
      Object.keys(v)
        .sort()
        .filter((k) => v[k] !== undefined)
        .map((k) => [k, k === "magnitude" ? v[k] || 0 : stable(v[k])]),
    );
  return v;
}
/** Compare all unrequested paragraph/run formatting, including emphasis around a minimal text edit. */
export function formattingSignature(raw: any, plan: any, after = false) {
  const tab = Engine.normalize(raw).tabs.find(
      (t: any) => t.tabId === "t.rf2v4q59t7sc",
    ),
    ps = Engine.paragraphs(tab);
  const inserted = new Set<number>();
  if (after)
    for (const c of plan.changes.filter(
      (c: any) => c.type === "insert_figure",
    )) {
      const p = ps.find((p: any) => p.text.trim() === c.caption);
      if (p) {
        inserted.add(p.start);
        inserted.add(p.end);
      }
    }
  for (const c of plan.changes.filter(
    (c: any) => c.type === "replace_figure",
  )) {
    if (after) {
      const p = ps.find((p: any) => p.text.trim() === c.caption);
      if (p) {
        inserted.add(p.start);
        inserted.add(p.end);
      }
    } else {
      inserted.add(c.paragraph_start);
      inserted.add(c.image_start);
    }
  }
  const result = ps
    .filter((p: any) => !inserted.has(p.start))
    .map((p: any) => {
      const change = plan.changes.find(
          (c: any) =>
            (after ? c.final_start : c.paragraph_start) === p.start &&
            c.type !== "insert_figure",
        ),
        normal =
          tab.namedStyles?.styles?.find(
            (s: any) =>
              s.namedStyleType === p.paragraph.paragraphStyle?.namedStyleType,
          ) || {};
      const paragraphStyle = {
        ...normal.paragraphStyle,
        ...p.paragraph.paragraphStyle,
      };
      if (change?.paragraph_style)
        for (const k of Object.keys(change.paragraph_style))
          delete paragraphStyle[k];
      let omitStart = -1,
        omitEnd = -1;
      if (change?.type === "replace_text") {
        const before = change.before,
          following = change.after;
        let prefix = 0,
          suffix = 0;
        while (
          prefix < Math.min(before.length, following.length) &&
          before[prefix] === following[prefix]
        )
          prefix++;
        while (
          suffix <
            Math.min(before.length - prefix, following.length - prefix) &&
          before[before.length - 1 - suffix] ===
            following[following.length - 1 - suffix]
        )
          suffix++;
        const target = after ? following : before;
        omitStart = p.text.indexOf(target) + prefix;
        omitEnd = omitStart + target.length - prefix - suffix;
        if (change.changed_offset !== undefined) {
          omitStart = change.changed_offset;
          omitEnd =
            omitStart +
            (after ? change.inserted_length : change.removed_length);
        }
      }
      const runs: { text: string; style: any; suggestions: any }[] = [];
      for (const e of p.paragraph.elements.filter((e: any) => e.textRun)) {
        const style = { ...normal.textStyle, ...e.textRun.textStyle };
        if (change?.text_style)
          for (const k of Object.keys(change.text_style)) delete style[k];
        const begin = e.startIndex - p.start,
          text = e.textRun.content,
          parts =
            omitStart < 0
              ? [text]
              : [
                  text.slice(
                    0,
                    Math.max(0, Math.min(text.length, omitStart - begin)),
                  ),
                  text.slice(
                    Math.max(0, Math.min(text.length, omitEnd - begin)),
                  ),
                ];
        const value = stable(style),
          suggestions = stable({
            insert: e.suggestedInsertionIds,
            delete: e.suggestedDeletionIds,
            textStyle: e.textRun.suggestedTextStyleChanges,
          });
        for (const text of parts.filter(Boolean)) {
          const last = runs.at(-1);
          if (
            last &&
            JSON.stringify(last.style) === JSON.stringify(value) &&
            JSON.stringify(last.suggestions) === JSON.stringify(suggestions)
          )
            last.text += text;
          else runs.push({ text, style: value, suggestions });
        }
      }
      return {
        paragraphStyle: stable(paragraphStyle),
        bullet: stable(p.paragraph.bullet),
        suggestedParagraphStyleChanges: stable(
          p.paragraph.suggestedParagraphStyleChanges,
        ),
        runs,
      };
    });
  return JSON.stringify(stable(result));
}
