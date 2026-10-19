import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { AppError } from "./errors.ts";
import type { Store } from "./store.ts";
import type { Source } from "../../../packages/contracts/index.ts";
const Engine = createRequire(import.meta.url)(
  "../../../packages/engine/Core.cjs",
);
export const sourceHash = (bytes: Buffer | string) =>
  createHash("sha256").update(bytes).digest("hex");
export function sourceFingerprint(s: Source) {
  return sourceHash(
    JSON.stringify({
      id: s.id,
      name: s.name,
      sha256: s.sha256 || null,
      mime: s.mime,
      origin: s.origin,
      driveId: s.driveId || null,
      anchorId: s.anchorId || null,
      sectionId: s.sectionId || null,
      image: s.image || null,
      evidenceReviewed: s.evidenceReviewed,
      reviewVersion: s.reviewVersion || null,
      preparedKind: s.preparedKind || null,
      description: s.description || null,
      provenance: s.provenance || null,
      rowSelection: s.rowSelection || null,
    }),
  );
}
export function sourceContentFingerprint(s: Source) {
  return sourceFingerprint({
    ...s,
    anchorId: undefined,
    sectionId: undefined,
    reviewVersion: undefined,
    evidenceReviewed: false,
  });
}
export function sourceBytes(store: Store, s: Source) {
  if (!s.sha256)
    throw new AppError(
      "SOURCE_PREPARATION_REQUIRED",
      `Prepare and review ${s.name || "this source"} before using it.`,
      409,
    );
  let bytes: Buffer;
  try {
    bytes = readFileSync(
      join(
        store.dir,
        "sources",
        s.id +
          (s.image ? (s.image.mime === "image/png" ? ".png" : ".jpg") : ""),
      ),
    );
  } catch {
    throw new AppError(
      "SOURCE_PREPARATION_REQUIRED",
      `Prepare or upload ${s.name || "this source"} again; its frozen evidence is unavailable.`,
      409,
    );
  }
  if (sourceHash(bytes) !== s.sha256)
    throw new AppError(
      "SOURCE_CHANGED",
      "Source bytes changed. Prepare and review the evidence again, then create a fresh proposal.",
      409,
    );
  return bytes;
}
export function sourceBindings(
  store: Store,
  ids: string[],
  verifyFiles = false,
): Record<string, string> {
  return Object.fromEntries(
    ids.map((id) => {
      const s = store.get<Source>("source", id);
      if (!s)
        throw new AppError(
          "SOURCE_NOT_FOUND",
          "A selected source no longer exists.",
          404,
        );
      if (verifyFiles) sourceBytes(store, s);
      return [id, sourceFingerprint(s)];
    }),
  );
}
export function assertSourceBindings(
  store: Store,
  ids: string[],
  expected: Record<string, string> | undefined,
  verifyFiles = true,
) {
  const current = sourceBindings(store, ids, verifyFiles);
  if (ids.some((id) => current[id] !== expected?.[id]))
    throw new AppError(
      "SOURCE_CHANGED",
      "Source content, mapping or review changed after this proposal. Read the current evidence and create a fresh proposal.",
      409,
    );
  return current;
}
/** Strip connector metadata and private URLs; only actual frozen research text is supplied to the model. */
export function driveSourceText(result: any): {
  text: string;
  upstreamRevision?: string;
} {
  const value = result.structuredContent || result;
  if (value.documentId && Array.isArray(value.tabs)) {
    const doc = Engine.normalize(value);
    return {
      text: doc.tabs
        .map(
          (tab: any) =>
            `TAB: ${tab.title}\n` +
            Engine.paragraphs(tab)
              .map(
                (p: any) =>
                  (p.location
                    ? `[TABLE ${p.location.tableStart}, ROW ${p.location.row + 1}, COLUMN ${p.location.column + 1}] `
                    : "") +
                  p.text.replace(
                    /\uFFFC/g,
                    "[native object: inspect original]",
                  ),
              )
              .join(""),
        )
        .join("\n"),
      upstreamRevision: doc.revisionId,
    };
  }
  if (typeof value.text === "string")
    return {
      text: value.text,
      upstreamRevision: value.revision || value.modifiedTime,
    };
  if (typeof value.content === "string")
    return { text: value.content, upstreamRevision: value.modified_time };
  const nested = value.structuredContent;
  if (nested) return driveSourceText(nested);
  throw new AppError(
    "SOURCE_EXTRACTION_REQUIRED",
    "This source needs text extraction or transcription before it can be reviewed.",
    409,
  );
}
