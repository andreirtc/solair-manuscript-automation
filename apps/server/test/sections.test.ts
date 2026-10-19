import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { buildSections } from "../src/sections.ts";
import { resolveScope } from "../src/scope.ts";
import { Store } from "../src/store.ts";
import { Manuscript } from "../src/manuscript.ts";
const project = resolve(".."),
  raw = JSON.parse(
    readFileSync(
      resolve(
        project,
        "work/manuscript-automation/trial-before/document-result.json",
      ),
      "utf8",
    ),
  );
test("Native manuscript becomes chapters, sections and real instrument subsections with protected SOP", () => {
  const sections = buildSections(raw),
    instrument = sections.find(
      (s) => s.title === "Description of Research Instrument Used",
    )!;
  assert(instrument);
  assert.equal(sections.filter((s) => s.kind === "chapter").length, 3);
  for (const title of [
    "ISO/IEC 25010 Evaluation Questionnaire",
    "Structured Operational Assessment Questionnaire for TODA End-Users",
    "Experimental Testing and Observation Logs",
  ]) {
    const node = sections.find((s) => s.title === title)!;
    assert(node, title);
    assert.equal(node.parentId, instrument.id);
    assert.equal(node.kind, "subsection");
    assert(node.start >= instrument.start && node.end <= instrument.end);
  }
  assert.equal(
    sections.find((s) => s.title === "Statement of the Problem")?.readOnly,
    true,
  );
  assert(!sections.some((s) => /^Figure\s+\d|^Where:/.test(s.title)));
});
test("Section identities survive index shifts instead of requiring users to reselect moving paragraph positions", () => {
  const before = buildSections(raw),
    copy = structuredClone(raw);
  function shift(x: any) {
    if (!x || typeof x !== "object") return;
    for (const [k, v] of Object.entries(x))
      if ((k === "startIndex" || k === "endIndex") && typeof v === "number")
        x[k] = v + 25;
      else shift(v);
  }
  shift(copy);
  assert.deepEqual(
    buildSections(copy).map((s) => s.id),
    before.map((s) => s.id),
  );
});
test("No selection routes automatically; explicit subsection bypasses routing and confines the supplied content", async () => {
  const dir = mkdtempSync(join(tmpdir(), "solair-scope-")),
    store = new Store(dir),
    m = new Manuscript(store, { tool: async () => raw }, project);
  m.snapshot = raw;
  const target = m
    .sections()
    .find((s) => s.title === "ISO/IEC 25010 Evaluation Questionnaire")!;
  let calls = 0;
  const client: any = {
    propose: async (
      _provider: any,
      prompt: string,
      _delta: any,
      onProvider: any,
    ) => {
      calls++;
      assert(prompt.includes("SOLAIR_SCOPE_ROUTING"));
      assert(prompt.includes(target.title));
      onProvider("personal-thread");
      return JSON.stringify({
        sectionIds: [target.id],
        answer: "Located the evaluation instrument subsection.",
      });
    },
  };
  try {
    const result = await resolveScope(
      m,
      {
        text: "Revise the ISO questionnaire description",
        sectionIds: [],
        anchorIds: [],
      },
      client,
      () => undefined,
      () => {},
      [],
    );
    assert.equal(result.mode, "general");
    assert(result.anchors.length > 0);
    assert(
      result.anchors.every(
        (a) => a.start >= target.start && a.start < target.end,
      ),
    );
    assert.equal(calls, 1);
    const explicit = await resolveScope(
      m,
      { text: "Improve clarity", sectionIds: [target.id], anchorIds: [] },
      client,
      () => undefined,
      () => {},
      [],
    );
    assert.equal(explicit.mode, "sections");
    assert.equal(calls, 1);
    await assert.rejects(
      resolveScope(
        m,
        { text: "x", sectionIds: ["0".repeat(20)], anchorIds: [] },
        client,
        () => undefined,
        () => {},
        [],
      ),
      /section list changed/,
    );
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
