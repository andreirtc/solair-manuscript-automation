import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { Manuscript, Engine, TARGET } from "../src/manuscript.ts";
import { Store } from "../src/store.ts";
import { layoutProfile, auditLayout, layoutOperations } from "../src/layout.ts";
const fixture = JSON.parse(
  readFileSync(
    resolve("../work/manuscript-automation/trial-before/document-result.json"),
    "utf8",
  ),
).structuredContent;
test("Explicit school-tab typography overrides conflicting sample formatting and retains written spacing exceptions", () => {
  const doc = structuredClone(fixture),
    tab = Engine.normalize(doc).tabs.find(
      (t: any) => t.tabId === "t.xmpxojg07hrf",
    ),
    ps = Engine.paragraphs(tab),
    body = ps.find(
      (p: any) =>
        /^Insert Text/.test(p.text.trim()) &&
        p.paragraph.paragraphStyle?.alignment === "JUSTIFIED",
    );
  body.paragraph.paragraphStyle.lineSpacing = 115;
  const run = body.paragraph.elements.find((e: any) =>
    e.textRun?.content.trim(),
  );
  run.textRun.textStyle.fontSize = { magnitude: 12, unit: "PT" };
  const profile = layoutProfile(doc);
  assert.equal(profile.roles.body.paragraphStyle.lineSpacing, 200);
  assert.equal(profile.roles.body.textStyle.fontSize.magnitude, 11);
  assert(profile.writtenConflicts.some((v) => v.role === "body"));
  assert(
    profile.writtenInstructions.some((v: any) => /two full lines/.test(v.text)),
  );
  assert(
    profile.writtenInstructions.some((v: any) =>
      /6 SPACES BEFORE THE TITLE/.test(v.text),
    ),
  );
});
function setup() {
  const dir = mkdtempSync(join(tmpdir(), "solair-layout-")),
    store = new Store(dir),
    doc = structuredClone(fixture),
    google = {
      tool: async (name: string) => {
        assert.equal(name, "get_document");
        return doc;
      },
    },
    m = new Manuscript(store, google, resolve(".."));
  m.snapshot = doc;
  return {
    doc,
    m,
    store,
    close() {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
test("School profile uses actual paragraph overrides, not the 115% named style; exceptions remain excluded", () => {
  const s = setup();
  try {
    const p = layoutProfile(s.doc);
    assert.equal(p.roles.body.paragraphStyle.lineSpacing, 200);
    assert.equal(p.roles.figureCaption.paragraphStyle.lineSpacing, 200);
    assert.equal(p.roles.figureCaption.paragraphStyle.alignment, "JUSTIFIED");
    assert.equal(p.roles.body.textStyle.fontSize.magnitude, 11);
    assert.equal(p.page.marginLeft.magnitude, 108);
    const tab = Engine.normalize(s.doc).tabs.find(
        (t: any) => t.tabId === TARGET.tab_id,
      ),
      ps = Engine.paragraphs(tab),
      section = s.m.sections().find((s) => s.title === "Introduction")!;
    const body = ps.find(
      (p: any) =>
        p.start > section.start &&
        p.start < section.end &&
        p.text.trim().length > 180 &&
        !p.paragraph.elements.some((e: any) => !e.textRun),
    );
    assert(body);
    body.paragraph.paragraphStyle.lineSpacing = 100;
    body.paragraph.elements.find(
      (e: any) => e.textRun,
    ).textRun.textStyle.fontSize = { magnitude: 12, unit: "PT" };
    const audit = auditLayout(s.doc, s.m.outline(), s.m.sections(), [
      section.id,
    ]);
    const issue = audit.issues.find((i) => i.text === body.text.trim());
    assert(issue);
    assert.equal(issue.paragraphStyle.lineSpacing, 200);
    assert.equal(issue.textStyle.fontSize.magnitude, 11);
    assert(!("indentFirstLine" in issue.paragraphStyle));
    assert(audit.issues.every((i) => i.sectionPath.includes("Introduction")));
    const all = auditLayout(s.doc, s.m.outline(), s.m.sections());
    assert(all.excluded.protected_sop > 0);
    assert(all.excluded.table_cell > 0);
    assert(all.excluded.native_object_or_control > 0);
    const ops = layoutOperations(audit);
    assert(ops.length <= 25);
    const j = s.m.create("School layout", ops);
    const plan = Engine.plan(s.doc, s.m.rawJob(j), TARGET);
    assert.equal(plan.status, "ready");
    assert(plan.requests.some((r: any) => r.updateTextStyle));
    assert(
      plan.requests
        .filter((r: any) => r.updateTextStyle)
        .every((r: any) => !r.updateTextStyle.fields.includes("bold")),
    );
  } finally {
    s.close();
  }
});
test("Hidden anchor resolves repeated wording safely and refuses a stale anchor", async () => {
  const s = setup();
  try {
    const anchors = s.m.outline(),
      pairs = new Map<string, any[]>();
    for (const a of anchors.filter(
      (a) => !a.protected && a.text.length > 4 && !a.text.includes("\uFFFC"),
    )) {
      const list = pairs.get(a.text) || [];
      list.push(a);
      pairs.set(a.text, list);
    }
    const repeated = [...pairs.values()].find(
      (v) => v.length > 1 && v.every((a) => !a.location),
    );
    assert(repeated);
    const a = repeated[0];
    const op = {
      type: "replace_text" as const,
      before: a.text,
      after: a.text + " [TEST]",
      evidence: "Fixture-only target test",
      anchorId: a.id,
    };
    const j = s.m.create("Repeated paragraph", [op]);
    const preview = await s.m.dryRun(j.id);
    assert.equal(preview.status, "dry_run_ready");
    assert.equal(preview.review!.changes[0].before, a.text);
    assert.equal(preview.review!.changes[0].after, a.text + " [TEST]");
    const bad = s.m.create("Stale anchor", [
      { ...op, anchorId: "0".repeat(20) },
    ]);
    await assert.rejects(s.m.dryRun(bad.id), /missing or ambiguous/);
  } finally {
    s.close();
  }
});
test("Native Docs named-range groups recover an already committed job without replay", () => {
  const s = setup();
  try {
    const job = {
      schema_version: 1,
      job_id: "native-recovery",
      document_id: TARGET.document_id,
      tab_id: TARGET.tab_id,
      operations: [],
    };
    const doc = structuredClone(s.doc);
    doc.tabs = doc.tabs.map((t: any) => ({
      tabProperties: { tabId: t.tabId, title: t.title },
      documentTab: {
        ...t,
        namedRanges:
          t.tabId === TARGET.tab_id
            ? {
                SOLAIR_JOB_native: {
                  namedRanges: [
                    {
                      name: "SOLAIR_JOB_native-recovery",
                      namedRangeId: "range-id",
                      ranges: [
                        { startIndex: 1, endIndex: 2, tabId: TARGET.tab_id },
                      ],
                    },
                  ],
                },
              }
            : {},
      },
    }));
    assert.equal(Engine.plan(doc, job, TARGET).status, "already_applied");
  } finally {
    s.close();
  }
});
