import test from "node:test";
import assert from "node:assert/strict";
import {
  readFileSync,
  writeFileSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { Manuscript, Engine, TARGET, preservation } from "../src/manuscript.ts";
import { Store } from "../src/store.ts";
import { imageInfo } from "../src/images.ts";
import { issueTransfer, readTransfer } from "../src/transfers.ts";
const fixture = JSON.parse(
  readFileSync(
    resolve("../work/manuscript-automation/trial-before/document-result.json"),
    "utf8",
  ),
).structuredContent;
const bytes = readFileSync(
  resolve("../work/manuscript-automation/trial-image.png"),
);
function setup() {
  const dir = mkdtempSync(join(tmpdir(), "solair-figures-")),
    store = new Store(dir),
    doc = structuredClone(fixture),
    calls: string[] = [];
  const m = new Manuscript(
    store,
    {
      privateImages: true,
      tool: async (name) => {
        calls.push(name);
        if (name === "get_document") return structuredClone(doc);
        throw new Error("Read-only fixture adapter");
      },
    },
    resolve(".."),
  );
  m.snapshot = doc;
  const section = m.sections().find((s) => s.title === "Introduction")!,
    anchor = m
      .outline()
      .find(
        (a) =>
          a.start > section.start &&
          a.start < section.end &&
          a.text.length > 200 &&
          !a.text.includes("\uFFFC"),
      )!,
    sid = randomUUID(),
    image = imageInfo(bytes)!;
  mkdirSync(join(dir, "sources"));
  writeFileSync(join(dir, "sources", sid + ".png"), bytes);
  store.put("source", {
    id: sid,
    name: "Private fixture.png",
    origin: "upload",
    mime: image.mime,
    image,
    sectionId: section.id,
    evidenceReviewed: true,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
  const op = {
    type: "insert_figure" as const,
    sourceId: sid,
    anchorId: anchor.id,
    after_paragraph: anchor.text,
    caption:
      "Figure 900. Automation acceptance test only; no research finding.",
    evidence: "Authorized developer fixture test",
  };
  return {
    dir,
    store,
    doc,
    m,
    calls,
    section,
    anchor,
    sid,
    op,
    close() {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
test("Private figure preview uses mapped section, source hash, aspect ratio and double-spaced school captions; no write occurs", async () => {
  const s = setup();
  try {
    const j = s.m.create("Insert private fixture", [s.op]),
      preview = await s.m.dryRun(j.id);
    assert.equal(preview.status, "dry_run_ready");
    assert.deepEqual(preview.sourceIds, [s.sid]);
    assert(preview.review!.requiresNotes);
    assert(preview.review!.changes[0].after.includes(s.op.caption));
    assert.deepEqual(
      preview.review!.changes[0].sectionPath,
      s.anchor.sectionPath,
    );
    const raw = s.m.rawJob(j),
      one = raw.operations[0],
      plan = Engine.plan(s.doc, raw, TARGET);
    assert.equal(
      one.width_pt / one.height_pt,
      imageInfo(bytes)!.width / imageInfo(bytes)!.height,
    );
    assert(one.width_pt <= 373.5);
    assert.equal(
      plan.requests.find((r: any) => r.updateParagraphStyle)
        ?.updateParagraphStyle.paragraphStyle.lineSpacing,
      200,
    );
    assert.equal(one.caption_style.alignment, "JUSTIFIED");
    assert.equal(
      s.m.expectedTexts(s.doc, j).length,
      s.m.texts(s.doc).length + 2,
    );
    assert(!JSON.stringify(preview).includes(s.dir));
    assert(!s.calls.includes("copy_file"));
    const source = s.store.get("source", s.sid);
    source.sectionId = s.m
      .sections()
      .find((x) => x.title === "Research Design")!.id;
    s.store.put("source", source);
    assert.throws(() => s.m.rawJob(j), /mapped section/);
    source.sectionId = s.section.id;
    s.store.put("source", source);
    writeFileSync(
      join(s.dir, "sources", s.sid + ".png"),
      Buffer.concat([bytes, Buffer.from("changed")]),
    );
    assert.throws(() => s.m.rawJob(j), /bytes changed/);
  } finally {
    s.close();
  }
});
test("Figure readback requires actual adjacent image, correct size/style and marker bound to its exact range", async () => {
  const s = setup();
  try {
    const j = s.m.create("Figure", [s.op]),
      raw = s.m.rawJob(j),
      plan = Engine.plan(s.doc, raw, TARGET),
      change = plan.changes[0],
      doc = structuredClone(s.doc),
      tab = doc.tabs.find((t: any) => t.tabId === TARGET.tab_id),
      start = s.anchor.end,
      cstart = start + change.caption.length + 1,
      delta = change.caption.length + 3;
    function shift(v: any) {
      if (!v || typeof v !== "object") return;
      for (const [k, x] of Object.entries(v)) {
        if (
          (k === "startIndex" || k === "endIndex") &&
          typeof x === "number" &&
          x >= start
        )
          v[k] = x + delta;
        else if (typeof x === "object") shift(x);
      }
    }
    for (const node of tab.body.content.filter(
      (e: any) => e.startIndex >= start,
    ))
      shift(node);
    const objectId = "test-new-image";
    const caption = {
      startIndex: start,
      endIndex: cstart,
      paragraph: {
        paragraphStyle: change.caption_style,
        elements: [
          {
            startIndex: start,
            endIndex: cstart,
            textRun: {
              content: change.caption + "\n",
              textStyle: change.caption_text_style,
            },
          },
        ],
      },
    };
    const image = {
      startIndex: cstart,
      endIndex: cstart + 2,
      paragraph: {
        paragraphStyle: change.image_style,
        elements: [
          {
            startIndex: cstart,
            endIndex: cstart + 1,
            inlineObjectElement: { inlineObjectId: objectId },
          },
          {
            startIndex: cstart + 1,
            endIndex: cstart + 2,
            textRun: { content: "\n", textStyle: {} },
          },
        ],
      },
    };
    tab.body.content.push(caption, image);
    tab.body.content.sort((a: any, b: any) => a.startIndex - b.startIndex);
    tab.inlineObjects[objectId] = {
      inlineObjectProperties: {
        embeddedObject: {
          size: {
            width: { magnitude: change.width_pt, unit: "PT" },
            height: { magnitude: change.height_pt, unit: "PT" },
          },
        },
      },
    };
    tab.namedRanges = {
      ...tab.namedRanges,
      asset: {
        name: "SOLAIR_ASSET_" + s.sid,
        ranges: [
          { startIndex: cstart, endIndex: cstart + 1, tabId: TARGET.tab_id },
        ],
      },
    };
    assert(Engine.verify(doc, plan, TARGET));
    assert.equal(preservation(doc, [objectId]), preservation(s.doc));
    assert.deepEqual(s.m.texts(doc), s.m.expectedTexts(s.doc, j));
    tab.inlineObjects[
      objectId
    ].inlineObjectProperties.embeddedObject.size.width.magnitude -= 30;
    assert(!Engine.verify(doc, plan, TARGET));
    tab.inlineObjects[
      objectId
    ].inlineObjectProperties.embeddedObject.size.width.magnitude =
      change.width_pt;
    tab.namedRanges.asset.ranges[0].startIndex--;
    assert(!Engine.verify(doc, plan, TARGET));
  } finally {
    s.close();
  }
});
test("Cloud deployment without private image transport rejects before backup and does not expose a public image", async () => {
  const s = setup();
  try {
    const j = s.m.create("Figure", [s.op]),
      p = await s.m.dryRun(j.id);
    s.m.approveReview(
      j.id,
      p.review!.hash,
      p.review!.changes.map((c) => c.id),
      "Reviewed this synthetic figure, its caption and placement for the fixture test.",
    );
    s.m.google.privateImages = false;
    await assert.rejects(
      s.m.apply(j.id, p.baseRevision!, j.id),
      /private-image adapter/,
    );
    assert(!s.calls.includes("copy_file"));
  } finally {
    s.close();
  }
});
test("Private transfer is restricted to a reviewed backed-up write, exact bytes and preview, five reads and a short lifetime", async () => {
  const s = setup();
  try {
    const j = s.m.create("Figure", [s.op]),
      p = await s.m.dryRun(j.id),
      source = s.store.get("source", s.sid);
    assert.throws(
      () => issueTransfer(s.store, p, source, "https://team.example"),
      /backed-up/,
    );
    s.m.approveReview(
      j.id,
      p.review!.hash,
      p.review!.changes.map((c) => c.id),
      "Reviewed synthetic private transfer fixture and placement.",
    );
    const job = s.m.get(j.id);
    job.status = "applying";
    job.backup = {
      id: "fixture-backup",
      url: "https://docs.google.com/document/d/fixture-backup/edit",
    };
    s.m.save(job);
    const grant = issueTransfer(s.store, job, source, "https://team.example"),
      token = grant.url.split("/").at(-1)!;
    assert.equal(token.length, 64);
    assert(!JSON.stringify(s.store.list("private_transfer")).includes(token));
    assert(!readTransfer(s.store, "0".repeat(64)));
    for (let i = 0; i < 5; i++)
      assert(readTransfer(s.store, token)?.bytes.equals(bytes));
    assert(!readTransfer(s.store, token));
    grant.revoke();
    assert.equal(s.store.list("private_transfer").length, 0);
    const expiring = issueTransfer(
        s.store,
        job,
        source,
        "https://team.example",
      ),
      record = s.store.list("private_transfer")[0];
    record.expires = Date.now() - 1;
    s.store.put("private_transfer", record);
    assert(!readTransfer(s.store, expiring.url.split("/").at(-1)!));
    expiring.revoke();
    const stale = issueTransfer(s.store, job, source, "https://team.example");
    job.review!.hash = "changed";
    s.m.save(job);
    assert(!readTransfer(s.store, stale.url.split("/").at(-1)!));
    stale.revoke();
  } finally {
    s.close();
  }
});
test("Replacement inventory targets one captioned image, preserves aspect ratio without cropping, and exposes removal review", async () => {
  const s = setup();
  try {
    const f = s.m.figures().find((f) => !f.readOnly && f.sectionId);
    assert(f);
    const source = s.store.get("source", s.sid);
    source.sectionId = f.sectionId;
    s.store.put("source", source);
    const j = s.m.create("Replace one figure", [
      {
        type: "replace_figure",
        sourceId: s.sid,
        figureId: f.id,
        caption: f.caption,
        evidence: "Fixture-only reviewed replacement",
      },
    ]);
    const p = await s.m.dryRun(j.id);
    assert.equal(p.status, "dry_run_ready");
    assert(p.review!.riskFlags.includes("removes_existing_figure"));
    assert(p.review!.changes[0].before.includes("will be replaced"));
    const raw = s.m.rawJob(j),
      op = raw.operations[0],
      plan = Engine.plan(s.doc, raw, TARGET);
    assert.equal(
      plan.requests.filter((r: any) => r.insertInlineImage).length,
      1,
    );
    assert.equal(
      plan.requests.filter((r: any) => r.deleteContentRange).length,
      1,
    );
    assert(!plan.requests.some((r: any) => r.replaceImage));
    assert.equal(
      op.width_pt / op.height_pt,
      imageInfo(bytes)!.width / imageInfo(bytes)!.height,
    );
    assert(op.width_pt <= f.widthPt);
    assert(op.height_pt <= f.heightPt);
    assert.deepEqual(s.m.expectedTexts(s.doc, j), s.m.texts(s.doc));
    assert(plan.changes[0].old_image_id === f.nativeObjectId);
  } finally {
    s.close();
  }
});
