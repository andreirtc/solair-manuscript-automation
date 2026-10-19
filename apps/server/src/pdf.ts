import { PDFDocument } from "pdf-lib";
import { AppError } from "./errors.ts";
import type { Google } from "./manuscript.ts";
const MAX = 40 * 1024 * 1024;
export async function inspectPdf(bytes: Buffer) {
  if (bytes.length > MAX || bytes.subarray(0, 5).toString() !== "%PDF-")
    throw new AppError(
      "EXPORT_INVALID",
      "The export is not a supported PDF.",
      502,
    );
  try {
    const pdf = await PDFDocument.load(bytes, {
      updateMetadata: false,
      throwOnInvalidObject: true,
    });
    if (pdf.isEncrypted || pdf.getPageCount() < 1)
      throw new Error("Invalid PDF");
    const pages = pdf.getPages().map((p) => p.getSize());
    return {
      pageCount: pdf.getPageCount(),
      letterPages: pages.filter(
        (p) => Math.abs(p.width - 612) < 1 && Math.abs(p.height - 792) < 1,
      ).length,
    };
  } catch {
    throw new AppError(
      "EXPORT_INVALID",
      "The exported PDF could not be parsed. No print approval was recorded.",
      502,
    );
  }
}
export async function downloadPdf(google: Google, documentId: string) {
  const result = await google.tool("fetch", {
    url: `https://docs.google.com/document/d/${documentId}/edit`,
    download_raw_file: true,
    include_base64: false,
    raw_export_mime_type: "application/pdf",
  });
  function locate(v: any): string | undefined {
    if (!v || typeof v !== "object") return;
    if (typeof v.download_url === "string") return v.download_url;
    for (const item of Object.values(v)) {
      const found = locate(item);
      if (found) return found;
    }
  }
  if (typeof result.base64 === "string") {
    if (result.base64.length > MAX * 1.4)
      throw new AppError(
        "EXPORT_INVALID",
        "The PDF exceeds the supported size.",
        502,
      );
    const bytes = Buffer.from(result.base64, "base64");
    await inspectPdf(bytes);
    return bytes;
  }
  const uri = locate(result);
  if (!uri || new URL(uri).protocol !== "https:")
    throw new AppError(
      "EXPORT_UNAVAILABLE",
      "Google did not return a supported private PDF stream. Retry the export; an older PDF will not be substituted.",
      502,
    );
  const response = await fetch(uri, { signal: AbortSignal.timeout(120000) });
  if (
    !response.ok ||
    !response.body ||
    Number(response.headers.get("content-length")) > MAX
  )
    throw new AppError(
      "EXPORT_UNAVAILABLE",
      "Private PDF download failed or exceeded the size limit.",
      502,
    );
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX)
        throw new AppError(
          "EXPORT_INVALID",
          "The PDF exceeds the supported size.",
          502,
        );
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const bytes = Buffer.concat(chunks);
  await inspectPdf(bytes);
  return bytes;
}
