import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { AppError } from "./errors.ts";
export const ATTACHMENT_CHARS = 200000;
const messages: Record<string, string> = {
  TEXT_TOO_LARGE:
    "The extracted text exceeds 200,000 characters. Upload a smaller section instead.",
  NO_READABLE_TEXT:
    "This document has no readable text. For a scanned PDF, copy an OCR transcription into Pasted text and check it against the original.",
  DOCUMENT_COMPLEXITY_LIMIT:
    "This document is too large or complex to extract safely (250 PDF pages maximum). Upload a smaller section.",
  INVALID_DOCUMENT:
    "The document could not be read. Use an unencrypted PDF, DOCX or XLSX, or export its text as TXT.",
};
let active = 0;
export function attachmentKind(name: string) {
  return /\.(pdf|docx|xlsx)$/i.exec(name)?.[1].toLowerCase();
}
export function readableText(bytes: Buffer) {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new AppError(
      "INVALID_TEXT",
      "Save this text file as UTF-8, then upload it again.",
    );
  }
  if (text.includes("\0"))
    throw new AppError(
      "INVALID_TEXT",
      "This file contains binary data. Upload PDF, DOCX or UTF-8 text.",
    );
  if (!text.trim())
    throw new AppError("NO_READABLE_TEXT", "The attachment is empty.");
  if (text.length > ATTACHMENT_CHARS)
    throw new AppError("TEXT_TOO_LARGE", messages.TEXT_TOO_LARGE);
  return text;
}
export async function extractDocument(
  bytes: Buffer,
  kind: string,
): Promise<{ text: string; notice: string }> {
  if (active >= 2)
    throw new AppError(
      "EXTRACTION_BUSY",
      "Two documents are being read. Wait a moment, then upload again.",
      429,
    );
  active++;
  try {
    return await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          "--max-old-space-size=128",
          fileURLToPath(new URL("./document-reader.mjs", import.meta.url)),
          kind,
        ],
        { stdio: ["pipe", "pipe", "ignore"] },
      );
      let output = "",
        settled = false;
      const finish = (
        error?: Error,
        result?: { text: string; notice: string },
      ) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        child.kill("SIGKILL");
        if (error) reject(error);
        else resolve(result!);
      };
      const timer = setTimeout(
        () =>
          finish(
            new AppError(
              "EXTRACTION_TIMEOUT",
              "Reading this document took too long. Upload a smaller section or use Pasted text.",
            ),
          ),
        25000,
      );
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        output += chunk.toString();
        if (output.length > 1250000)
          finish(new AppError("TEXT_TOO_LARGE", messages.TEXT_TOO_LARGE));
      });
      child.stdin.on("error", () => {});
      child.on("error", () =>
        finish(new AppError("EXTRACTION_FAILED", messages.INVALID_DOCUMENT)),
      );
      child.on("close", () => {
        try {
          const result = JSON.parse(output);
          if (result.error)
            return finish(
              new AppError(
                result.error,
                messages[result.error] || messages.INVALID_DOCUMENT,
              ),
            );
          const text = readableText(Buffer.from(result.text, "utf8"));
          finish(undefined, { text, notice: String(result.notice) });
        } catch (error) {
          finish(
            error instanceof AppError
              ? error
              : new AppError("EXTRACTION_FAILED", messages.INVALID_DOCUMENT),
          );
        }
      });
      child.stdin.end(bytes);
    });
  } finally {
    active--;
  }
}
