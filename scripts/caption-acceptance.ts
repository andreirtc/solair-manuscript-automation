/** Synthetic duplicate-only regression: keep an existing caption with the image after insertion changed pagination. */
import { Store } from "../apps/server/src/store.ts";
import { Manuscript } from "../apps/server/src/manuscript.ts";
import { Codex } from "../apps/server/src/codex.ts";
import { resolve, join } from "node:path";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
if (process.argv[2] !== "--authorized-trial-test")
  throw Error("Requires explicit synthetic trial-test flag.");
const store = new Store(resolve(".local")),
  c = new Codex(process.cwd()),
  m = new Manuscript(store, c, resolve("..")),
  dir = resolve(".local/acceptance/caption-flow");
mkdirSync(dir, { recursive: true, mode: 0o700 });
const save = (name: string, v: any) =>
  writeFileSync(
    join(dir, name),
    Buffer.isBuffer(v) ? v : JSON.stringify(v, null, 2),
    { mode: 0o600 },
  );
try {
  await store.context.run(
    {
      id: "codex-developer-acceptance",
      name: "Codex developer acceptance (synthetic test)",
      username: "developer-test",
      role: "editor",
      slot: 1,
    },
    async () => {
      await m.refresh();
      save("before.json", m.snapshot);
      const anchor = m
        .outline()
        .find(
          (a) => !a.location && /^Figure 1\. Characteristic I-V/.test(a.text),
        );
      if (!anchor) throw Error("Cannot uniquely find the existing caption.");
      const j = m.create(
        "Developer trial regression: keep Figure 1 caption with its image after the synthetic insertion changed pagination",
        [
          {
            type: "format_paragraph",
            anchorId: anchor.id,
            expected_text: anchor.text,
            paragraph_style: { keepWithNext: true, keepLinesTogether: true },
            evidence:
              "Synthetic duplicate acceptance PDF showed a detached existing caption; formatting-only regression repair",
          },
        ],
        [],
        "developer_acceptance",
      );
      const p = await m.dryRun(j.id);
      save("preview.json", p);
      m.approveReview(
        j.id,
        p.review!.hash,
        p.review!.changes.map((c) => c.id),
        "Developer reviewed the exact existing Figure 1 caption and requested only keep-with-next/keep-lines-together to repair the synthetic trial pagination.",
      );
      const applied = await m.apply(j.id, p.baseRevision!, j.id);
      save("receipt.json", applied);
      save("after.json", m.snapshot);
      console.log(
        "Caption regression",
        applied.status,
        "native",
        applied.verification?.native,
        "job",
        j.id,
      );
      if (!applied.verification?.native)
        throw Error("Native preservation did not pass.");
      await m.exportPdf(j.id);
      save("after.pdf", readFileSync(resolve(".local/pdf", j.id + ".pdf")));
      console.log("Caption-regression PDF saved for visual QA.");
    },
  );
} catch (e) {
  console.error(
    (e as Error).message.replace(/https?:\/\/\S+/g, "[private URL omitted]"),
  );
  process.exitCode = 1;
} finally {
  c.stop();
  store.close();
}
