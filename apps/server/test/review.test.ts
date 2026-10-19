import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { Store } from "../src/store.ts";
import { Manuscript, Engine, TARGET } from "../src/manuscript.ts";
import type { Actor } from "../../../packages/contracts/index.ts";
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
const format = {
  type: "format_paragraph" as const,
  expected_text: "Introduction",
  paragraph_style: { keepWithNext: true },
  evidence: "Explicit test-fixture request",
};
function setup() {
  const dir = mkdtempSync(join(tmpdir(), "solair-review-")),
    store = new Store(dir),
    doc = structuredClone(fixture),
    calls: string[] = [];
  const m = new Manuscript(
    store,
    {
      tool: async (name) => {
        calls.push(name);
        if (name === "get_document") return structuredClone(doc);
        throw new Error("No writes are allowed in this review-gate test.");
      },
    },
    project,
  );
  return {
    m,
    store,
    doc,
    calls,
    close: () => {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
test("Apply cannot bypass review; every change must be acknowledged; changed revision invalidates prior approval", async () => {
  const s = setup();
  try {
    const j = s.m.create("Test heading formatting", [format]),
      p = await s.m.dryRun(j.id);
    await assert.rejects(
      s.m.apply(j.id, p.baseRevision!, j.id),
      /acknowledge each/,
    );
    assert(!s.calls.includes("copy_file"));
    assert.throws(
      () => s.m.approveReview(j.id, p.review!.hash, [], ""),
      /Acknowledge every/,
    );
    s.m.approveReview(
      j.id,
      p.review!.hash,
      p.review!.changes.map((c) => c.id),
      "",
    );
    s.doc.revisionId += "external";
    const fresh = await s.m.dryRun(j.id);
    assert.notEqual(fresh.review!.hash, p.review!.hash);
    assert.throws(
      () =>
        s.m.approveReview(
          j.id,
          p.review!.hash,
          p.review!.changes.map((c) => c.id),
          "",
        ),
      /current proposal/,
    );
    await assert.rejects(
      s.m.apply(j.id, fresh.baseRevision!, j.id),
      /acknowledge each/,
    );
    assert(!s.calls.includes("copy_file"));
  } finally {
    s.close();
  }
});
test("Removals expose full before/after and removed text, require meaningful review notes, and can be rejected without a write", async () => {
  const s = setup();
  try {
    const tab = fixture.tabs.find((t: any) => t.tabId === TARGET.tab_id),
      ps = Engine.paragraphs(tab),
      sop = Engine.protectedSection(ps);
    const p = ps.find(
      (p: any) =>
        p.start < sop.start &&
        p.text.trim().length > 80 &&
        p.paragraph.elements.every((e: any) => e.textRun) &&
        new Set(
          p.paragraph.elements.map((e: any) =>
            JSON.stringify(e.textRun.textStyle || {}),
          ),
        ).size === 1 &&
        ps.filter((q: any) => q.text === p.text).length === 1,
    );
    assert(p);
    const j = s.m.create("Shorten a test-fixture passage", [
        {
          type: "replace_text",
          before: p.text.trim(),
          after: "Shortened test-fixture passage.",
          evidence: "Test fixture only; no live research edit",
        },
      ]),
      preview = await s.m.dryRun(j.id),
      review = preview.review!;
    assert(review.requiresNotes);
    assert(review.riskFlags.includes("removes_text"));
    assert.equal(review.changes[0].before, p.text.trim());
    assert(review.changes[0].removedText.length > 0);
    assert.throws(
      () =>
        s.m.approveReview(
          j.id,
          review.hash,
          review.changes.map((c) => c.id),
          "Looks good",
        ),
      /Explain why/,
    );
    const rejected = s.m.reject(j.id, "The removed wording is still needed.");
    assert.equal(rejected.status, "rejected");
    await assert.rejects(s.m.dryRun(j.id), /proposal was rejected/);
    assert(!s.calls.includes("copy_file"));
  } finally {
    s.close();
  }
});
test("Another teammate must record their own review before applying a shared proposal", async () => {
  const s = setup(),
    a: Actor = {
      id: "member-a",
      name: "A",
      username: "aaa",
      role: "editor",
      slot: 2,
    },
    b: Actor = {
      id: "member-b",
      name: "B",
      username: "bbb",
      role: "editor",
      slot: 3,
    };
  try {
    const j = s.m.create("Format heading", [format]),
      p = await s.m.dryRun(j.id);
    s.store.context.run(a, () =>
      s.m.approveReview(
        j.id,
        p.review!.hash,
        p.review!.changes.map((c) => c.id),
        "",
      ),
    );
    await assert.rejects(
      s.store.context.run(b, () => s.m.apply(j.id, p.baseRevision!, j.id)),
      /acknowledge each/,
    );
    assert(!s.calls.includes("copy_file"));
    assert.equal(s.m.get(j.id).approvedBy?.id, a.id);
  } finally {
    s.close();
  }
});
