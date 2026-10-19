/** Explicit user-authorized developer trial. Fixed duplicate only; restores the formatting change. */
import { Store } from "../apps/server/src/store.ts";
import { Codex } from "../apps/server/src/codex.ts";
import {
  Manuscript,
  Engine,
  TARGET,
  MAINTAINED,
  preservation,
} from "../apps/server/src/manuscript.ts";
import { formattingSignature } from "../apps/server/src/format-preservation.ts";
import { compactOperation } from "../apps/server/src/ai-schema.ts";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import assert from "node:assert/strict";
if (!["--authorized-trial-test", "--verify-existing"].includes(process.argv[2]))
  throw Error("Requires explicit duplicate-only trial flag.");
assert.notEqual(TARGET.document_id, MAINTAINED);
const dir = resolve(".local/acceptance/research-upgrade/manuscript-trial");
mkdirSync(dir, { recursive: true, mode: 0o700 });
const store = new Store(join(dir, "state")),
  c = new Codex(process.cwd()),
  m = new Manuscript(store, c, resolve(".."));
const save = (name: string, value: any) =>
  writeFileSync(
    join(dir, name),
    Buffer.isBuffer(value) ? value : JSON.stringify(value, null, 2),
    { mode: 0o600 },
  );
const actor = {
  id: "codex-developer-acceptance",
  name: "Codex automated duplicate acceptance",
  username: "developer-test",
  role: "editor" as const,
  slot: 1,
};
let needsRestore = false,
  anchor: any,
  before: number,
  baseline: any,
  applied: any,
  restored: any;
async function reviewedApply(operations: any[], label: string) {
  const job = m.create(label, operations, [], "developer_acceptance");
  const preview = await m.dryRun(job.id);
  save(
    label.includes("Restore") ? "restore-preview.json" : "preview.json",
    preview,
  );
  assert.equal(preview.status, "dry_run_ready");
  await assert.rejects(
    m.apply(job.id, preview.baseRevision!, job.id + "-unreviewed"),
    /review/i,
  );
  m.approveReview(
    job.id,
    preview.review!.hash,
    preview.review!.changes.map((change) => change.id),
    "Developer acceptance: inspected the exact synthetic formatting operation, expected anchor and preservation guards. This is automated test approval, not human approval of a thesis revision.",
  );
  if (!label.includes("Restore")) needsRestore = true;
  const result = await m.apply(job.id, preview.baseRevision!, job.id);
  assert(result.backup?.id);
  assert.equal(result.verification?.native, true);
  return result;
}
async function restore() {
  await m.refresh();
  const current = m
    .outline()
    .find((a) => a.text === anchor.text && !a.location && !a.protected);
  assert(current, "Restore anchor no longer unique/available");
  restored = await reviewedApply(
    [
      {
        type: "format_paragraph",
        anchorId: current.id,
        expected_text: current.text,
        paragraph_style: { lineSpacing: before },
        evidence:
          "Restore the exact original spacing after the user-authorized synthetic acceptance test.",
      },
    ],
    "Restore automated duplicate formatting trial",
  );
  needsRestore = false;
  save("restored-receipt.json", restored);
  await m.exportPdf(restored.id);
  save(
    "restored.pdf",
    readFileSync(join(store.dir, "pdf", restored.id + ".pdf")),
  );
  save("restored.json", m.snapshot);
  assert.deepEqual(preservation(m.snapshot), preservation(baseline));
  assert.deepEqual(
    formattingSignature(m.snapshot, { changes: [] }),
    formattingSignature(baseline, { changes: [] }),
  );
}
try {
  await store.context.run(actor, async () => {
    if (process.argv[2] === "--verify-existing") {
      baseline = JSON.parse(readFileSync(join(dir, "before.json"), "utf8"));
      await m.refresh();
      assert.deepEqual(preservation(m.snapshot), preservation(baseline));
      assert.deepEqual(
        formattingSignature(m.snapshot, { changes: [] }),
        formattingSignature(baseline, { changes: [] }),
      );
      const proposal = JSON.parse(
          readFileSync(join(dir, "model-proposal.json"), "utf8"),
        ),
        a = JSON.parse(readFileSync(join(dir, "applied-receipt.json"), "utf8")),
        r = JSON.parse(
          readFileSync(join(dir, "restored-receipt.json"), "utf8"),
        );
      save("result.json", {
        at: new Date().toISOString(),
        scope:
          "User-authorized synthetic duplicate acceptance; no maintained/original write or human-review impersonation.",
        target: TARGET.document_id,
        model: proposal.model,
        effort: proposal.effort,
        reviewGate: true,
        backup: a.backup?.id,
        native: a.verification,
        restoreBackup: r.backup?.id,
        restoredNative: r.verification,
        fullPreservationRestored: true,
        pdfInspection: "pending",
      });
      console.log(
        "Verified saved native trial and complete restoration without any additional write.",
      );
      return;
    }
    await m.refresh();
    baseline = structuredClone(m.snapshot);
    save("before.json", baseline);
    const tab = Engine.normalize(baseline).tabs.find(
        (t: any) => t.tabId === TARGET.tab_id,
      ),
      paragraphs = Engine.paragraphs(tab);
    anchor = m
      .outline()
      .find(
        (a) =>
          !a.location &&
          !a.protected &&
          a.text.length > 120 &&
          !/\[(?:EQUATION|IMAGE|NATIVE)/.test(a.text) &&
          Number.isFinite(
            paragraphs.find((p: any) => p.start === a.start)?.paragraph
              .paragraphStyle?.lineSpacing,
          ),
      );
    assert(anchor, "Need an unprotected body paragraph with explicit spacing");
    before = paragraphs.find((p: any) => p.start === anchor.start).paragraph
      .paragraphStyle.lineSpacing;
    const next = before + 10;
    const models = await c.models(),
      model = models.find((model) => model.model === "gpt-6.1-sol");
    assert(model);
    const effort = ["max", "xhigh", "high"].find((e) =>
      model.efforts.includes(e),
    )!;
    const raw = await c.propose(
      undefined,
      `Developer acceptance on the authorized TEST DUPLICATE only. Return JSON answer and operations. Produce exactly one format_paragraph operation for anchor ${anchor.id}, expected_text exactly ${JSON.stringify(anchor.text)}, paragraph_style only {lineSpacing:${next}}, text_style:null, evidence:"User-authorized automated duplicate acceptance trial; temporary spacing only, restored after verification." Do not change any wording, facts, other formatting or native objects. No web search is needed. This synthetic test is approved for developer review and will be restored to lineSpacing ${before}.`,
      () => {},
      () => {},
      { model: model.model, effort },
      false,
    );
    const response = JSON.parse(raw),
      ops = response.operations.map(compactOperation);
    save("model-proposal.json", { model: model.model, effort, response });
    assert.equal(ops.length, 1);
    assert.equal(ops[0].type, "format_paragraph");
    assert.equal(ops[0].anchorId, anchor.id);
    assert.equal(ops[0].expected_text, anchor.text);
    assert.deepEqual(ops[0].paragraph_style, { lineSpacing: next });
    assert(!ops[0].text_style);
    console.log("Managed-model draft passed exact temporary-operation checks.");
    applied = await reviewedApply(
      ops,
      "Automated duplicate formatting acceptance trial",
    );
    needsRestore = true;
    save("applied-receipt.json", applied);
    save("after.json", m.snapshot);
    await m.exportPdf(applied.id);
    save(
      "after.pdf",
      readFileSync(join(store.dir, "pdf", applied.id + ".pdf")),
    );
    console.log(
      "Backup, approval gate, native readback and PDF export passed. Restoring.",
    );
    await restore();
    save("result.json", {
      at: new Date().toISOString(),
      scope:
        "User-authorized synthetic developer acceptance on guarded duplicate; no maintained/original write and no human review impersonation.",
      target: TARGET.document_id,
      model: model.model,
      effort,
      anchorId: anchor.id,
      paragraph: anchor.text.slice(0, 180),
      spacingBefore: before,
      spacingDuringTrial: next,
      reviewGate: true,
      backup: applied.backup?.id,
      native: applied.verification,
      restoreBackup: restored.backup?.id,
      restoredNative: restored.verification,
      fullPreservationRestored: true,
      pdfInspection: "pending",
    });
    console.log(
      "Original text/native structures/formatting restored; PDFs ready for automated and visual inspection.",
    );
  });
} catch (error) {
  save("failure.json", {
    at: new Date().toISOString(),
    message: (error as Error).message,
    needsRestore,
    appliedJob: applied?.id,
  });
  if (needsRestore)
    try {
      await store.context.run(actor, restore);
    } catch (restoreError) {
      save("restore-failure.json", {
        message: (restoreError as Error).message,
      });
    }
  console.error(
    (error as Error).message.replace(/https?:\/\/\S+/g, "[private URL]"),
  );
  process.exitCode = 1;
} finally {
  c.stop();
  store.close();
}
