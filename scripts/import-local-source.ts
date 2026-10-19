import { readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { basename, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Store, id, now } from "../apps/server/src/store.ts";
import {
  attachmentKind,
  extractDocument,
  readableText,
} from "../apps/server/src/attachments.ts";
import { sourceHash } from "../apps/server/src/source-snapshots.ts";
import type { Source } from "../packages/contracts/index.ts";
// Explicit local CLI invocation only: there is no HTTP endpoint for reading arbitrary host paths.
const root = resolve(fileURLToPath(new URL("../", import.meta.url))),
  files = process.argv.slice(2);
if (!files.length)
  throw new Error(
    "Specify the local source files explicitly; no folder is scanned automatically.",
  );
const store = new Store(join(root, ".local"));
try {
  for (const file of files) {
    const path = resolve(file);
    if (!statSync(path).isFile() || statSync(path).size > 20 * 1024 * 1024)
      throw new Error("Use a file no larger than 20 MB.");
    const bytes = readFileSync(path),
      hash = sourceHash(bytes),
      existing = store
        .list<Source>("source")
        .find((s) => s.uploadSha256 === hash && s.preparedKind === "text");
    if (existing) {
      console.log(
        JSON.stringify({
          name: existing.name,
          id: existing.id,
          reused: true,
          reviewed: existing.evidenceReviewed,
        }),
      );
      continue;
    }
    const kind = attachmentKind(path),
      prepared = kind
        ? await extractDocument(bytes, kind)
        : /\.(md|txt|csv|json)$/i.test(path)
          ? {
              text: readableText(bytes),
              notice:
                "User-supplied UTF-8 source; evidence review remains pending.",
            }
          : undefined;
    if (!prepared)
      throw new Error("Use PDF, DOCX, XLSX, MD, TXT, CSV or JSON.");
    const source: Source = {
      id: id(),
      name: basename(path),
      mime:
        kind === "pdf"
          ? "application/pdf"
          : kind === "docx"
            ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            : kind === "xlsx"
              ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              : "text/plain",
      origin: "upload",
      uploadSha256: hash,
      originalSize: bytes.length,
      sha256: sourceHash(prepared.text),
      size: Buffer.byteLength(prepared.text),
      preparedKind: "text",
      preparedAt: now(),
      extractionNotice: prepared.notice,
      evidenceReviewed: false,
      status: "needs_mapping",
      createdAt: now(),
    };
    mkdirSync(join(store.dir, "sources"), { recursive: true, mode: 0o700 });
    writeFileSync(join(store.dir, "sources", source.id), prepared.text, {
      mode: 0o600,
    });
    writeFileSync(join(store.dir, "sources", source.id + ".original"), bytes, {
      mode: 0o600,
    });
    store.put("source", source);
    store.activity(
      "local_source_imported",
      `Imported ${source.name} at the user's request. Original bytes retained; mapping and human evidence review pending.`,
      undefined,
      "host_assisted_local_import",
    );
    console.log(
      JSON.stringify({
        name: source.name,
        id: source.id,
        characters: prepared.text.length,
        notice: prepared.notice,
        reviewed: false,
      }),
    );
  }
} finally {
  store.close();
}
