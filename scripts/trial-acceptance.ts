/** Explicit developer acceptance harness: fixed authorized trial target only. */
import { Codex } from "../apps/server/src/codex.ts";
import { TARGET } from "../apps/server/src/manuscript.ts";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const jobId = process.argv[2];
if (!jobId || !/^[\da-f-]{36}$/.test(jobId))
  throw new Error("Supply the known trial job UUID.");
const dir = ".local/acceptance";
mkdirSync(dir, { recursive: true, mode: 0o700 });
const c = new Codex(process.cwd());
const base = "http://127.0.0.1:4781/api/v1";
async function request(path: string, body?: any, headers: any = {}) {
  const r = await fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: body
      ? {
          "Content-Type": "application/json",
          "X-SOLAIR-Client": "web",
          ...headers,
        }
      : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await r.json();
  if (!r.ok) throw new Error(result.error.message);
  return result.data;
}
async function beforePdf() {
  const result = await c.tool("fetch", {
    url: `https://docs.google.com/document/d/${TARGET.document_id}/edit`,
    download_raw_file: true,
    include_base64: false,
    raw_export_mime_type: "application/pdf",
  });
  function locate(v: any): string | undefined {
    if (!v || typeof v !== "object") return;
    if (v.download_url) return v.download_url;
    for (const x of Object.values(v)) {
      const r = locate(x);
      if (r) return r;
    }
  }
  const url = locate(result);
  if (!url) {
    writeFileSync(join(dir, "export-shape.json"), JSON.stringify(result), {
      mode: 0o600,
    });
    throw new Error("No PDF stream; see private export shape.");
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error("PDF download failed");
  const bytes = Buffer.from(await r.arrayBuffer());
  if (bytes.subarray(0, 5).toString() !== "%PDF-") throw new Error("Not PDF");
  writeFileSync(join(dir, "before.pdf"), bytes, { mode: 0o600 });
}
try {
  const preview = await request(`/jobs/${jobId}/dry-run`, {});
  console.log("preview", preview.status);
  const before = await c.tool("get_document", {
    document_id: TARGET.document_id,
  });
  writeFileSync(join(dir, "before.json"), JSON.stringify(before), {
    mode: 0o600,
  });
  await beforePdf();
  const applied = await request(
    `/jobs/${jobId}/apply`,
    { baseRevision: preview.baseRevision },
    { "Idempotency-Key": jobId },
  );
  console.log(
    "apply",
    applied.status,
    "native",
    applied.verification?.native,
    "backup",
    applied.backup?.id,
  );
  writeFileSync(join(dir, "receipt.json"), JSON.stringify(applied, null, 2), {
    mode: 0o600,
  });
  const after = await c.tool("get_document", {
    document_id: TARGET.document_id,
  });
  writeFileSync(join(dir, "after.json"), JSON.stringify(after), {
    mode: 0o600,
  });
  console.log("export", await request(`/jobs/${jobId}/export-pdf`, {}));
} catch (e) {
  console.error(
    (e as Error).message.replace(/https?:\/\/\S+/g, "[private URL omitted]"),
  );
  process.exitCode = 1;
} finally {
  c.stop();
}
