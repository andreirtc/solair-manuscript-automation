/** Prepare, but do not send, one private-image replacement through Orca's supported upload adapter. */
import { Store, id } from "../apps/server/src/store.ts";
import { Manuscript, TARGET } from "../apps/server/src/manuscript.ts";
import { Codex } from "../apps/server/src/codex.ts";
import { imageInfo } from "../apps/server/src/images.ts";
import { resolve, join } from "node:path";
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { createHash } from "node:crypto";
if (process.argv[2] !== "--authorized-trial-test")
  throw Error("Explicit synthetic duplicate test flag required.");
const store = new Store(resolve(".local")),
  c = new Codex(process.cwd()),
  m = new Manuscript(store, c, resolve("..")),
  dir = resolve(".local/acceptance/figure-replacement");
mkdirSync(dir, { recursive: true, mode: 0o700 });
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
      const f = m.figures().find((f) => /^Figure 900\./.test(f.caption));
      if (!f || f.readOnly)
        throw Error("Synthetic Figure 900 not uniquely editable.");
      writeFileSync(join(dir, "before.json"), JSON.stringify(m.snapshot), {
        mode: 0o600,
      });
      copyFileSync(
        ".local/acceptance/caption-flow/after.pdf",
        join(dir, "before.pdf"),
      );
      await m.figureImage(f.id);
      const bytes = readFileSync(
          resolve("../work/manuscript-automation/trial-image.png"),
        ),
        image = imageInfo(bytes)!,
        sid = id();
      writeFileSync(join(store.dir, "sources", sid + ".png"), bytes, {
        mode: 0o600,
      });
      store.put("source", {
        id: sid,
        name: "Synthetic replacement fixture — no research evidence.png",
        mime: image.mime,
        image,
        origin: "upload",
        sectionId: f.sectionId,
        evidenceReviewed: true,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        size: bytes.length,
        status: "mapped_reviewed",
        createdAt: new Date().toISOString(),
        uploadedBy: store.actor(),
        mappedBy: store.actor(),
      });
      const j = m.create(
        "Developer duplicate acceptance: replace only synthetic Figure 900 and its test caption",
        [
          {
            type: "replace_figure",
            figureId: f.id,
            sourceId: sid,
            caption:
              "Figure 900. AUTOMATION TEST ONLY — replacement, aspect ratio and private placement; no research finding.",
            evidence:
              "Synthetic developer trial only, replacing the prior synthetic fixture rather than a research image",
          },
        ],
        [sid],
        "developer_acceptance",
      );
      const p = await m.dryRun(j.id);
      writeFileSync(join(dir, "preview.json"), JSON.stringify(p, null, 2), {
        mode: 0o600,
      });
      if (p.status !== "dry_run_ready") throw Error("No replacement preview.");
      m.approveReview(
        j.id,
        p.review!.hash,
        p.review!.changes.map((c) => c.id),
        "Developer inspected the old synthetic fixture, new private source, exact before/after caption and uncropped dimensions. Only the prior automation test image is removed; this does not approve changes to research findings.",
      );
      const copy = await c.tool("copy_file", {
          url: `https://docs.google.com/document/d/${TARGET.document_id}/edit`,
          new_title: `SOLAIR app trial backup ${j.id} replacement acceptance`,
          parent_folder: "1l5dhhIfh3SWs3lUQHQguPvrKZOChUJhX",
        }),
        bid = copy.id || copy.file?.id || copy.file_id || copy.metadata?.id;
      if (!bid) throw Error("No backup");
      const job = m.get(j.id);
      job.backup = {
        id: bid,
        url: `https://docs.google.com/document/d/${bid}/edit`,
      };
      job.status = "applying";
      job.approvedBy = store.actor();
      job.appliedBy = store.actor();
      m.save(job);
      store.put("backup", {
        id: bid,
        jobId: j.id,
        createdAt: new Date().toISOString(),
        url: job.backup.url,
      });
      store.put("idempotency", { id: j.id, key: j.id });
      const plan = store.get("plan", j.id).plan,
        raw = m.rawJob(job);
      writeFileSync(join(dir, "job-id.txt"), j.id, { mode: 0o600 });
      console.log(
        JSON.stringify({
          document_id: TARGET.document_id,
          requests: plan.requests,
          write_control: plan.write_control,
          image_uris: raw.operations[0].uri,
        }),
      );
    },
  );
} finally {
  c.stop();
  store.close();
}
