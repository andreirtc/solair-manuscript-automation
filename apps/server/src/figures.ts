import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import type { Anchor } from "../../../packages/contracts/index.ts";
const Engine = createRequire(import.meta.url)(
  "../../../packages/engine/Core.cjs",
);
export function manuscriptFigures(raw: any, anchors: Anchor[]) {
  if (!raw) return [];
  const tab = Engine.normalize(raw).tabs.find(
      (t: any) => t.tabId === "t.rf2v4q59t7sc",
    ),
    ps = Engine.paragraphs(tab),
    result: any[] = [];
  for (const [i, p] of ps.entries()) {
    if (p.location || p.text !== "\uFFFC\n") continue;
    const elements = p.paragraph.elements.filter(
      (e: any) => e.inlineObjectElement,
    );
    if (elements.length !== 1) continue;
    const caption = ps[i - 1];
    if (
      !caption ||
      caption.location ||
      caption.end !== p.start ||
      !/^Figure\s+\d+[A-Za-z]?\.\s+/.test(caption.text.trim())
    )
      continue;
    const imageId = elements[0].inlineObjectElement.inlineObjectId,
      object =
        tab.inlineObjects?.[imageId]?.inlineObjectProperties?.embeddedObject,
      anchor = anchors.find((a) => a.start === p.start),
      capAnchor = anchors.find((a) => a.start === caption.start);
    if (!object?.imageProperties) continue;
    result.push({
      id: createHash("sha256").update(imageId).digest("hex").slice(0, 20),
      caption: caption.text.trim(),
      captionAnchorId: capAnchor?.id,
      imageAnchorId: anchor?.id,
      sectionId: anchor?.sectionId,
      sectionPath: anchor?.sectionPath,
      widthPt: object.size?.width?.magnitude,
      heightPt: object.size?.height?.magnitude,
      readOnly:
        !anchor || !capAnchor || anchor.protected || capAnchor.protected,
      nativeObjectId: imageId,
      captionStart: caption.start,
      imageStart: p.start,
    });
  }
  return result;
}
