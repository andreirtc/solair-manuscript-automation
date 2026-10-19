import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { PDFDocument } from "pdf-lib";
import { Manuscript } from "../src/manuscript.ts";
import { Store } from "../src/store.ts";
import { PRINT_CHECKS } from "../src/printing.ts";
const fixture = JSON.parse(
  readFileSync(
    resolve("../work/manuscript-automation/trial-before/document-result.json"),
    "utf8",
  ),
).structuredContent;
async function setup() {
  const dir = mkdtempSync(join(tmpdir(), "solair-print-")),
    store = new Store(dir),
    doc = structuredClone(fixture),
    pdf = await PDFDocument.create();
  pdf.addPage([612, 792]);
  pdf.addPage([612, 792]);
  const bytes = Buffer.from(await pdf.save({ useObjectStreams: true }));
  let fail = false,
    race = false;
  const m = new Manuscript(
    store,
    {
      tool: async (name) => {
        if (name === "get_document") return structuredClone(doc);
        if (name === "fetch") {
          if (fail) throw new Error("export failed");
          if (race) doc.revisionId += "changed";
          return { base64: bytes.toString("base64") };
        }
        throw new Error("Unexpected tool");
      },
    },
    resolve(".."),
  );
  m.snapshot = doc;
  return {
    dir,
    store,
    m,
    doc,
    bytes,
    setFail: () => (fail = true),
    setRace: () => (race = true),
    close: () => {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
const checks = PRINT_CHECKS.map((c) => c.id),
  notes = "Inspected all exact test PDF pages and every print checklist item.";
test("Print review uses school reference and does not certify scientific constants or an unexported page count", async () => {
  const s = await setup();
  try {
    const p = s.m.printReadiness();
    assert.equal(p.requiredPhysicalCopies, 4);
    assert(p.formattingRules.captions.includes("above the image"));
    assert(p.formattingRules.captions.includes("Arial 11"));
    assert(
      !p.verificationChecklist
        .flatMap((c) => c.items)
        .some((i) => i.status === "verified"),
    );
    assert.match(p.estimateNotice!, /historical/);
  } finally {
    s.close();
  }
});
test("An export failure cannot freeze a cached PDF or manufacture a current revision", async () => {
  const s = await setup();
  try {
    s.setFail();
    await assert.rejects(s.m.preparePrintPdf(), /export failed/);
    assert.equal(s.store.list("print_candidate").length, 0);
    assert.equal(s.store.get("frozen_print_pdf", "current"), undefined);
  } finally {
    s.close();
  }
});
test("Print candidates use parsed compressed page counts; freezing needs exact review and preserves immutable bytes", async () => {
  const s = await setup();
  try {
    const c = await s.m.preparePrintPdf();
    assert.equal(c.pageCount, 2);
    assert.equal(c.letterPages, 2);
    await assert.rejects(
      s.m.freezePrintPdf(c.id, c.revisionId, [], "short"),
      /acknowledge every/,
    );
    const frozen = await s.m.freezePrintPdf(c.id, c.revisionId, checks, notes);
    assert.equal(frozen.pageCount, 2);
    assert(s.m.printing().frozenBytes().equals(s.bytes));
    assert.equal(s.m.printReadiness().totalPrintedPagesEstimate, 8);
    s.doc.revisionId += "later";
    await s.m.refresh();
    assert(s.m.printing().frozenBytes().equals(s.bytes));
    assert.equal(s.m.printReadiness().frozenPrintPdf?.stale, true);
    writeFileSync(join(s.dir, "pdf", "print-" + c.id + ".pdf"), "changed");
    assert.throws(() => s.m.printing().frozenBytes(), /PDF changed/);
  } finally {
    s.close();
  }
});
test("Revision changes during export or before review block print approval; legacy freezes are untrusted", async () => {
  const s = await setup();
  try {
    s.store.put("frozen_print_pdf", {
      id: "current",
      revisionId: s.doc.revisionId,
      sha256: "old",
    });
    assert.equal(s.m.printReadiness().frozenPrintPdf, undefined);
    assert.throws(() => s.m.printing().frozenBytes(), /No reviewed/);
    const c = await s.m.preparePrintPdf();
    s.doc.revisionId += "external";
    await assert.rejects(
      s.m.freezePrintPdf(c.id, c.revisionId, checks, notes),
      /changed after/,
    );
    s.setRace();
    await assert.rejects(s.m.preparePrintPdf(), /changed during/);
  } finally {
    s.close();
  }
});

test("Explicit manuscript page extraction preserves the original candidate and cannot select outside its range", async () => {
  const s = await setup();
  try {
    const original = await s.m.preparePrintPdf();
    await assert.rejects(
      s.m.printing().extract(original.id, 0, 2),
      /valid inclusive range/,
    );
    const selected = await s.m.printing().extract(original.id, 2, 2);
    assert.equal(selected.pageCount, 1);
    assert.equal(selected.sourceCandidateId, original.id);
    assert.deepEqual(selected.sourcePageRange, { from: 2, to: 2 });
    assert(s.m.printing().bytes(original).equals(s.bytes));
    assert.equal(
      (
        await s.m.freezePrintPdf(
          selected.id,
          selected.revisionId,
          checks,
          notes,
        )
      ).pageCount,
      1,
    );
  } finally {
    s.close();
  }
});
