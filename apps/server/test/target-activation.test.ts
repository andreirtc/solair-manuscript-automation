import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Store } from "../src/store.ts";
import { Manuscript, TARGET, MAINTAINED, Engine } from "../src/manuscript.ts";
const project = resolve(".."),
  fixture = JSON.parse(
    readFileSync(
      resolve(
        project,
        "work/manuscript-automation/trial-before/document-result.json",
      ),
      "utf8",
    ),
  ).structuredContent;
const operation = {
  type: "format_paragraph" as const,
  expected_text: "Introduction",
  paragraph_style: { keepWithNext: true },
  evidence: "Developer target-binding fixture, not a human approval.",
};
function setup() {
  const dir = mkdtempSync(join(tmpdir(), "solair-target-activation-")),
    store = new Store(dir),
    trial = structuredClone(fixture),
    maintained = structuredClone(fixture),
    calls: { name: string; args: any }[] = [];
  maintained.documentId = MAINTAINED;
  for (const tab of maintained.tabs) tab.documentId = MAINTAINED;
  let wrong = false;
  const google = {
    tool: async (name: string, args: any) => {
      calls.push({ name, args });
      assert.equal(
        name,
        "get_document",
        "Writes forbidden in target activation test",
      );
      return structuredClone(
        wrong ? trial : args.document_id === MAINTAINED ? maintained : trial,
      );
    },
  };
  return {
    store,
    trial,
    maintained,
    calls,
    google,
    setWrong: () => {
      wrong = true;
    },
    close() {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
test("Adviser activation is explicit, has no trial snapshot fallback, and validates actual native document before use", async () => {
  const s = setup();
  try {
    const trial = new Manuscript(s.store, s.google, project);
    await trial.refresh();
    assert.equal(trial.info().writeMode, "trial_only");
    const m = new Manuscript(s.store, s.google, project, "maintained");
    assert.equal(m.snapshot, undefined);
    assert.equal(m.info().documentId, MAINTAINED);
    await m.refresh();
    assert.equal(m.info().productionWrites, true);
    assert.equal(m.info().originalWrites, false);
    assert.equal(m.info().writeMode, "maintained_reviewed");
    assert.equal(m.layoutProfile().roles.body.textStyle.fontSize.magnitude, 11);
    assert.equal(
      s.store.get("snapshot", "trial").raw.documentId,
      TARGET.document_id,
    );
    assert.equal(
      s.store.get("snapshot", MAINTAINED).raw.documentId,
      MAINTAINED,
    );
    s.setWrong();
    await assert.rejects(m.refresh(), /configured manuscript/);
    assert.throws(
      () => new Manuscript(s.store, s.google, project, "arbitrary" as any),
      /explicitly configured/,
    );
  } finally {
    s.close();
  }
});
test("Old trial jobs and approvals cannot preview, approve, apply or export against the adviser manuscript", async () => {
  const s = setup();
  try {
    const trial = new Manuscript(s.store, s.google, project);
    await trial.refresh();
    const old = trial.create("Trial job", [operation]);
    delete old.documentId;
    s.store.put("job", old);
    const m = new Manuscript(s.store, s.google, project, "maintained");
    await m.refresh();
    const calls = s.calls.length;
    await assert.rejects(m.dryRun(old.id), /different manuscript/);
    assert.throws(
      () =>
        m.approveReview(
          old.id,
          "a".repeat(64),
          [],
          "Do not transfer approvals",
        ),
      /different manuscript/,
    );
    await assert.rejects(
      m.apply(old.id, "r1", "old-key"),
      /different manuscript/,
    );
    await assert.rejects(m.exportPdf(old.id), /different manuscript/);
    assert.equal(s.calls.length, calls, "No Google request for old jobs");
    assert.equal(s.store.get("job", old.id).target, "trial");
  } finally {
    s.close();
  }
});
test("Fresh maintained proposals bind the exact document, retain approval gates and use its own native planner", async () => {
  const s = setup();
  try {
    const m = new Manuscript(s.store, s.google, project, "maintained");
    await m.refresh();
    const j = m.create("Fresh adviser request", [operation]);
    assert.equal(j.target, "maintained");
    assert.equal(j.documentId, MAINTAINED);
    assert.equal(m.rawJob(j).document_id, MAINTAINED);
    const p = await m.dryRun(j.id);
    assert.equal(p.status, "dry_run_ready");
    await assert.rejects(
      m.apply(j.id, p.baseRevision!, j.id),
      /acknowledge each/,
    );
    assert(
      s.calls.every(
        (c) => c.name === "get_document" && c.args.document_id === MAINTAINED,
      ),
    );
    const raw = m.rawJob(j);
    assert.equal(Engine.plan(s.maintained, raw, m.target).status, "ready");
    const trial = new Manuscript(s.store, s.google, project);
    assert.throws(() => trial.rawJob(j), /different manuscript/);
  } finally {
    s.close();
  }
});
test("A contaminated maintained cache fails closed instead of presenting trial content as adviser content", () => {
  const s = setup();
  try {
    s.store.put("snapshot", {
      id: MAINTAINED,
      raw: s.trial,
      fetchedAt: new Date().toISOString(),
    });
    assert.throws(
      () => new Manuscript(s.store, s.google, project, "maintained"),
      /Cached manuscript target mismatch/,
    );
  } finally {
    s.close();
  }
});
