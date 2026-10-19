import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { Manuscript, Engine, TARGET } from "../src/manuscript.ts";
import { Store } from "../src/store.ts";

const fixture = JSON.parse(
  readFileSync(
    resolve("../work/manuscript-automation/trial-before/document-result.json"),
    "utf8",
  ),
).structuredContent;

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "solair-eq-")),
    store = new Store(dir),
    doc = structuredClone(fixture);
  const m = new Manuscript(
    store,
    {
      privateImages: false,
      tool: async (name) => {
        if (name === "get_document") return structuredClone(doc);
        throw new Error("Read-only fixture adapter");
      },
    },
    resolve(".."),
  );
  m.snapshot = doc;
  return { dir, store, m, doc };
}

test("Manuscript equations inventories native equations, classifies types, and preserves formulas", () => {
  const { dir, m } = setup();
  try {
    const summary = m.equations();

    assert.equal(
      summary.capabilities.nativeEquationEditing,
      "unsupported_by_google_docs_api",
    );
    assert.equal(
      summary.capabilities.preservation,
      "enforced_by_readback_and_preservation_hash",
    );
    assert.ok(
      summary.totalCount >= 180,
      `Expected >= 180 native equations, got ${summary.totalCount}`,
    );
    assert.equal(summary.totalCount, summary.nativeCount);
    assert.ok(summary.standaloneCount > 0, "Expected standalone equations");
    assert.ok(summary.inlineCount > 0, "Expected inline equations");
    assert.equal(
      summary.standaloneCount + summary.inlineCount,
      summary.nativeCount,
    );

    assert(summary.equations.every((e) => e.verifiedConstants?.length === 0));
    assert(summary.equations.every((e) => e.symbolsAndVariables.length === 0));
    assert(
      summary.equations.every(
        (e) => e.manualEditGuidance.includes("Google Docs") || e.readOnly,
      ),
    );
    assert(
      summary.equations.every((e) =>
        e.missingOrPendingParameters?.some((x) =>
          x.includes("reviewed sources"),
        ),
      ),
    );
    assert(
      !summary.capabilities.supportedOperations.includes(
        "figure_equation_replacement",
      ),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Core engine blocks text replacement across native equations to prevent formula corruption", () => {
  const { dir, m, doc } = setup();
  try {
    const tab = Engine.normalize(doc).tabs.find(
      (t: any) => t.tabId === TARGET.tab_id,
    );
    const ps = Engine.paragraphs(tab);

    // Find a paragraph with a native equation
    const pWithEq = ps.find((p: any) =>
      p.paragraph.elements.some((el: any) => el.equation),
    );
    assert.ok(pWithEq, "Should find paragraph with native equation");

    const eqEl = pWithEq.paragraph.elements.find((el: any) => el.equation);
    assert.ok(eqEl, "Equation element exists");

    // 1. Attempting to replace text containing \uFFFC (the native equation) must fail
    const j1 = m.create("corrupt equation", [
      {
        type: "replace_text",
        before: pWithEq.text.trim(),
        after: "Substituted plain text equation",
        evidence: "User request",
      },
    ]);
    assert.throws(() => {
      Engine.plan(doc, m.rawJob(j1), TARGET);
    }, /Text updates must stay inside one plain paragraph/);

    // Narrative in one exact native text run can change while equation ranges remain untouched.
    const pWithInlineEq = ps.find((p: any) =>
      p.text.includes("is air density and"),
    );
    assert(pWithInlineEq);
    const j2 = m.create("Clarify equation explanation", [
      {
        type: "replace_text",
        before: "is air density and",
        after: "represents ambient air density and",
        evidence: "User request",
      },
    ]);
    const inlinePlan = Engine.plan(doc, m.rawJob(j2), TARGET);
    assert.equal(inlinePlan.status, "ready");
    const deletion = inlinePlan.requests.find((r: any) => r.deleteContentRange)
      ?.deleteContentRange.range;
    assert(deletion);
    for (const e of pWithInlineEq.paragraph.elements.filter(
      (e: any) => e.equation,
    ))
      assert(
        !(e.startIndex < deletion.endIndex && e.endIndex > deletion.startIndex),
        "Narrative deletion must not overlap a native formula",
      );
    // 3. Plain surrounding narrative paragraphs outside the equation paragraph CAN be updated
    const pPlain = ps.find((p: any) =>
      p.text.includes("Similarly, the aerodynamic contribution"),
    );
    assert.ok(pPlain, "Should find plain narrative paragraph");
    assert.ok(
      !pPlain.paragraph.elements.some((el: any) => el.equation),
      "Plain paragraph has no native equation",
    );

    const j3 = m.create("revise surrounding narrative", [
      {
        type: "replace_text",
        before: "Similarly, the aerodynamic contribution",
        after: "Additionally, the aerodynamic contribution",
        evidence: "User request",
      },
    ]);
    const plan = Engine.plan(doc, m.rawJob(j3), TARGET);
    assert.equal(plan.status, "ready");
    assert.equal(plan.changes.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Narrative ranges use the actual text-run indexes after an opaque formula span, not flattened placeholder offsets", () => {
  const { dir, store, m, doc } = setup();
  try {
    const tab = Engine.normalize(doc).tabs.find(
        (t: any) => t.tabId === TARGET.tab_id,
      ),
      p = Engine.paragraphs(tab).find((p: any) =>
        p.text.includes("is air density and"),
      );
    const run = p.paragraph.elements.find((e: any) =>
        e.textRun?.content.includes("is air density and"),
      ),
      boundary = run.startIndex;
    function shift(v: any) {
      if (!v || typeof v !== "object") return;
      for (const [k, value] of Object.entries(v)) {
        if (
          (k === "startIndex" || k === "endIndex") &&
          typeof value === "number" &&
          value >= boundary
        )
          v[k] = value + 12;
        else shift(value);
      }
    }
    shift(doc);
    const j = m.create("Clarify adjacent explanation", [
      {
        type: "replace_text",
        before: "is air density and",
        after: "represents air density and",
        evidence: "Synthetic index-mapping regression",
      },
    ]);
    const plan = Engine.plan(doc, m.rawJob(j), TARGET),
      deletion = plan.requests.find((r: any) => r.deleteContentRange)
        .deleteContentRange.range;
    assert.equal(
      deletion.startIndex,
      run.startIndex + run.textRun.content.indexOf("is air density and"),
    );
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
