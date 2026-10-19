/** Explicit developer test on the fixed native duplicate. No human review is impersonated. */
import { Codex } from "../apps/server/src/codex.ts";
import { Store, id } from "../apps/server/src/store.ts";
import { Manuscript, TARGET, Engine } from "../apps/server/src/manuscript.ts";
import { imageInfo } from "../apps/server/src/images.ts";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import type { Actor, Source } from "../packages/contracts/index.ts";
if (process.argv[2] !== "--authorized-trial-test")
  throw new Error(
    "This harness requires --authorized-trial-test. It creates one clearly labeled synthetic figure on the duplicate only.",
  );
const actor: Actor = {
  id: "codex-developer-acceptance",
  name: "Codex developer acceptance (synthetic test)",
  username: "developer-test",
  role: "editor",
  slot: 1,
};
const store = new Store(resolve(".local")),
  codex = new Codex(process.cwd()),
  m = new Manuscript(store, codex, resolve("..")),
  dir = resolve(".local/acceptance/figure-school-layout");
mkdirSync(dir, { recursive: true, mode: 0o700 });
const save = (name: string, v: any) =>
  writeFileSync(
    join(dir, name),
    typeof v === "string" || Buffer.isBuffer(v)
      ? v
      : JSON.stringify(v, null, 2),
    { mode: 0o600 },
  );
async function pdf(name: string) {
  const result = await codex.tool("fetch", {
    url: `https://docs.google.com/document/d/${TARGET.document_id}/edit`,
    download_raw_file: true,
    include_base64: false,
    raw_export_mime_type: "application/pdf",
  });
  function locate(v: any): string | undefined {
    if (!v || typeof v !== "object") return;
    if (v.download_url) return v.download_url;
    for (const x of Object.values(v)) {
      const url = locate(x);
      if (url) return url;
    }
  }
  const url = locate(result);
  if (!url) throw Error("No private PDF export stream returned.");
  const r = await fetch(url);
  if (!r.ok) throw Error("Private PDF fetch failed.");
  const bytes = Buffer.from(await r.arrayBuffer());
  if (bytes.subarray(0, 5).toString() !== "%PDF-")
    throw Error("Export was not PDF.");
  save(name, bytes);
}
try {
  await store.context.run(actor, async () => {
    await m.refresh();
    const before = structuredClone(m.snapshot);
    save("before.json", before);
    await pdf("before.pdf");
    const section = m.sections().find((s) => s.title === "Introduction")!,
      anchor = m
        .outline()
        .find(
          (a) =>
            a.start > section.start &&
            a.start < section.end &&
            a.text.length > 300 &&
            !a.text.includes("\uFFFC"),
        )!;
    if (!anchor) throw Error("No safe introduction paragraph.");
    const bytes = readFileSync(
        resolve("../work/manuscript-automation/trial-image.png"),
      ),
      image = imageInfo(bytes)!;
    const sid = id();
    mkdirSync(join(store.dir, "sources"), { recursive: true, mode: 0o700 });
    writeFileSync(join(store.dir, "sources", sid + ".png"), bytes, {
      mode: 0o600,
    });
    store.put<Source>("source", {
      id: sid,
      name: "Synthetic automation test graphic — not research evidence.png",
      mime: image.mime,
      image,
      origin: "upload",
      sectionId: section.id,
      evidenceReviewed: true,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      size: bytes.length,
      status: "mapped_reviewed",
      createdAt: new Date().toISOString(),
      uploadedBy: actor,
      mappedBy: actor,
    });
    const j = m.create(
      "Developer acceptance only: privately insert the existing synthetic graphic with sampled double-spaced school caption",
      [
        {
          type: "insert_figure",
          sourceId: sid,
          anchorId: anchor.id,
          after_paragraph: anchor.text,
          caption:
            "Figure 900. AUTOMATION TEST ONLY — private placement and school spacing; no research finding.",
          evidence:
            "User-authorized reversible developer trial on the duplicate; synthetic graphic, no research claim",
        },
      ],
      [sid],
      "developer_acceptance",
    );
    const p = await m.dryRun(j.id);
    save("preview.json", p);
    console.log("Preview", p.status, "job", j.id, "source", sid);
    if (p.status !== "dry_run_ready" || !p.review)
      throw Error("Trial preview failed.");
    m.approveReview(
      j.id,
      p.review.hash,
      p.review.changes.map((c) => c.id),
      "Developer reviewed this synthetic acceptance fixture, full caption, private source, aspect ratio and explicit school spacing. This is not approval of a research manuscript revision by a human.",
    );
    const applied = await m.apply(j.id, p.baseRevision!, j.id);
    save("receipt.json", applied);
    save("after.json", m.snapshot);
    console.log(
      "Native result",
      applied.status,
      "verified",
      applied.verification?.native,
      "backup",
      applied.backup?.id,
    );
    if (!applied.verification?.native)
      throw Error("Native preservation check did not pass.");
    await pdf("after.pdf");
    console.log(
      "Private before/after native snapshots and PDFs saved for visual QA; no layout completion claimed.",
    );
  });
} catch (e) {
  console.error(
    (e as Error).message.replace(/https?:\/\/\S+/g, "[private URL omitted]"),
  );
  process.exitCode = 1;
} finally {
  codex.stop();
  store.close();
}
