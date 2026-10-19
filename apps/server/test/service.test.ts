import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { request as httpRequest } from "node:http";
import { join, resolve } from "node:path";
import { Store } from "../src/store.ts";
import { Engine, Manuscript, TARGET, preservation } from "../src/manuscript.ts";
import { Codex } from "../src/codex.ts";
import { createApp } from "../src/app.ts";
import { Team } from "../src/team.ts";
import { sourceHash, driveSourceText } from "../src/source-snapshots.ts";
const project = resolve("..");
const fixture = JSON.parse(
  readFileSync(
    join(
      project,
      "work/manuscript-automation/trial-before/document-result.json",
    ),
    "utf8",
  ),
).structuredContent;
const format = {
  type: "format_paragraph" as const,
  expected_text: "Introduction",
  paragraph_style: { keepWithNext: true, keepLinesTogether: true },
  evidence: "User-requested trial heading flow",
};
class Google {
  doc = structuredClone(fixture);
  calls: string[] = [];
  failBackup = false;
  loseResponse = false;
  async tool(name: string, args: any) {
    this.calls.push(name);
    if (name === "get_document") return structuredClone(this.doc);
    if (name === "copy_file") {
      if (this.failBackup) return {};
      return { id: "test-backup" };
    }
    if (name === "batch_update_document") {
      assert.equal(args.document_id, TARGET.document_id);
      assert.equal(args.write_control.requiredRevisionId, this.doc.revisionId);
      const tab = this.doc.tabs.find((t: any) => t.tabId === TARGET.tab_id);
      for (const r of args.requests) {
        if (r.updateParagraphStyle) {
          const p = Engine.paragraphs(tab).find(
            (p: any) => p.start === r.updateParagraphStyle.range.startIndex,
          );
          Object.assign(
            p.paragraph.paragraphStyle,
            r.updateParagraphStyle.paragraphStyle,
          );
        }
        if (r.createNamedRange) {
          tab.namedRanges ||= {};
          tab.namedRanges[r.createNamedRange.name] = {
            name: r.createNamedRange.name,
          };
        }
      }
      this.doc.revisionId += "updated";
      if (this.loseResponse) throw new Error("lost response");
      return {};
    }
    throw new Error("Unexpected tool " + name);
  }
}
function setup() {
  const dir = mkdtempSync(join(tmpdir(), "solair-test-")),
    store = new Store(dir),
    google = new Google(),
    m = new Manuscript(store, google, project);
  return {
    dir,
    store,
    google,
    m,
    close() {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
async function approvedPreview(s: ReturnType<typeof setup>, key: string) {
  const p = await s.m.dryRun(key);
  if (p.status === "dry_run_ready")
    s.m.approveReview(
      key,
      p.review!.hash,
      p.review!.changes.map((c) => c.id),
      "Reviewed each test-fixture change for this explicit acceptance test.",
    );
  return p;
}
test("SQLite records persist and local directory is private", () => {
  const s = setup();
  s.store.activity("test", "Saved");
  s.store.close();
  const again = new Store(s.dir);
  assert.equal(again.list("activity")[0].message, "Saved");
  assert.equal(statSync(s.dir).mode & 0o777, 0o700);
  again.close();
  rmSync(s.dir, { recursive: true, force: true });
});
test("Preview is read-only; apply backs up and verifies; repeat does not write twice", async () => {
  const s = setup();
  try {
    const before = preservation(s.google.doc),
      j = s.m.create("Keep introduction with its text", [format]);
    const preview = await approvedPreview(s, j.id);
    assert.equal(preview.status, "dry_run_ready");
    assert(!s.google.calls.includes("batch_update_document"));
    const applied = await s.m.apply(j.id, preview.baseRevision!, j.id);
    assert.equal(applied.status, "needs_layout_review");
    assert.equal(applied.verification?.native, true);
    assert.equal(preservation(s.google.doc), before);
    assert(
      s.google.calls.indexOf("copy_file") <
        s.google.calls.indexOf("batch_update_document"),
    );
    await s.m.apply(j.id, preview.baseRevision!, j.id);
    assert.equal(
      s.google.calls.filter((c) => c === "batch_update_document").length,
      1,
    );
    await assert.rejects(
      s.m.apply(j.id, preview.baseRevision!, "different-key"),
      /original idempotency/,
    );
  } finally {
    s.close();
  }
});
test("Revision conflict and missing backup prevent writes", async () => {
  const s = setup();
  try {
    const j = s.m.create("Heading", [format]);
    const preview = await approvedPreview(s, j.id);
    s.google.doc.revisionId += "manual";
    await assert.rejects(
      s.m.apply(j.id, preview.baseRevision!, j.id),
      /changed after preview/,
    );
    assert(!s.google.calls.includes("copy_file"));
    await approvedPreview(s, j.id);
    s.google.failBackup = true;
    await assert.rejects(
      s.m.apply(j.id, s.m.get(j.id).baseRevision!, j.id),
      /backup ID/,
    );
    assert(!s.google.calls.includes("batch_update_document"));
  } finally {
    s.close();
  }
});
test("Finalized SOP and evidence without mapping are blocked", async () => {
  const s = setup();
  try {
    const j = s.m.create("SOP edit", [
      { ...format, expected_text: "Statement of the Problem" },
    ]);
    await assert.rejects(approvedPreview(s, j.id), /SOP/);
    s.store.put("source", { id: "source", evidenceReviewed: false });
    const other = s.m.create("Heading", [format], ["source"]);
    await assert.rejects(
      approvedPreview(s, other.id),
      /Map each selected source/,
    );
    assert(!s.google.calls.includes("batch_update_document"));
  } finally {
    s.close();
  }
});
test("Lost write response reconciles atomic marker without replaying batch", async () => {
  const s = setup();
  try {
    const j = s.m.create("Heading", [format]);
    await approvedPreview(s, j.id);
    s.google.loseResponse = true;
    await assert.rejects(
      s.m.apply(j.id, s.m.get(j.id).baseRevision!, j.id),
      /lost response/,
    );
    assert.equal(s.m.get(j.id).status, "blocked");
    assert.throws(
      () => s.m.reject(j.id, "Cancel this uncertain update"),
      /Reconcile its native marker/,
    );
    assert.equal(s.m.get(j.id).status, "blocked");
    const recovered = await approvedPreview(s, j.id);
    assert.equal(recovered.status, "needs_layout_review");
    assert.equal(recovered.verification?.native, true);
    assert.equal(
      s.google.calls.filter((c) => c === "batch_update_document").length,
      1,
    );
  } finally {
    s.close();
  }
});
function reviewedSource(s: ReturnType<typeof setup>) {
  s.m.snapshot = structuredClone(s.google.doc);
  const section = s.m.sections().find((x) => x.title === "Introduction")!;
  mkdirSync(join(s.dir, "sources"), { recursive: true });
  const source = {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    name: "Reviewed notes.txt",
    origin: "upload",
    mime: "text/plain",
    sha256: sourceHash("Original reviewed evidence"),
    sectionId: section.id,
    evidenceReviewed: true,
    reviewVersion: "review-1",
  };
  writeFileSync(
    join(s.dir, "sources", source.id),
    "Original reviewed evidence",
  );
  s.store.put("source", source);
  return source;
}
test("Changed source metadata or bytes invalidate review and prevent a Google write", async () => {
  const s = setup();
  try {
    const source = reviewedSource(s),
      j = s.m.create("Heading", [format], [source.id]);
    const preview = await approvedPreview(s, j.id);
    s.store.put("source", { ...source, reviewVersion: "review-2" });
    assert.throws(
      () =>
        s.m.approveReview(
          j.id,
          preview.review!.hash,
          preview.review!.changes.map((c) => c.id),
          "Read again",
        ),
      /Source content, mapping or review changed/,
    );
    await assert.rejects(
      s.m.apply(j.id, preview.baseRevision!, j.id),
      /Source content, mapping or review changed/,
    );
    assert(!s.google.calls.includes("copy_file"));
    assert(!s.google.calls.includes("batch_update_document"));
    s.store.put("source", source);
    const next = s.m.create("Heading", [format], [source.id]),
      p = await approvedPreview(s, next.id);
    writeFileSync(
      join(s.dir, "sources", source.id),
      "Unreviewed replacement bytes",
    );
    await assert.rejects(
      s.m.apply(next.id, p.baseRevision!, next.id),
      /Source bytes changed/,
    );
    assert(!s.google.calls.includes("batch_update_document"));
  } finally {
    s.close();
  }
});
test("A source changed while the native backup is in flight cannot reach the write", async () => {
  const s = setup();
  try {
    const source = reviewedSource(s),
      j = s.m.create("Heading", [format], [source.id]),
      p = await approvedPreview(s, j.id),
      original = s.google.tool.bind(s.google);
    s.google.tool = async (name, args) => {
      const r = await original(name, args);
      if (name === "copy_file")
        s.store.put("source", {
          ...source,
          reviewVersion: "concurrent-change",
        });
      return r;
    };
    await assert.rejects(
      s.m.apply(j.id, p.baseRevision!, j.id),
      /Source content, mapping or review changed/,
    );
    assert(s.google.calls.includes("copy_file"));
    assert(!s.google.calls.includes("batch_update_document"));
  } finally {
    s.close();
  }
});
test("Drive extraction sends actual research text without connector private URLs", () => {
  const extracted = driveSourceText({
    structuredContent: {
      text: "Research evidence",
      revision: "r1",
      download_url: "https://private.invalid/bearer-secret",
      metadata: { owner: "not manuscript text" },
    },
  });
  assert.deepEqual(extracted, {
    text: "Research evidence",
    upstreamRevision: "r1",
  });
  const native = driveSourceText(fixture);
  assert(native.text.includes("Introduction"));
  assert(native.text.includes("[TABLE "));
  assert(!native.text.includes("contentUri"));
  assert.throws(
    () => driveSourceText({ download_url: "https://private.invalid/secret" }),
    /text extraction/,
  );
});
test("Drive text is frozen for review; refreshing it invalidates old proposals and in-flight AI work", async () => {
  const s = setup(),
    local = new Codex(process.cwd());
  local.models = async () => [
    { model: "gpt-6.1-sol", label: "Fixture Sol", efforts: ["high", "max"] },
  ];
  let promptSeen = "",
    release: (() => void) | undefined,
    started: (() => void) | undefined,
    upstream = "Original reviewed evidence";
  const ai: any = {
    forActor: () => ({
      propose: async (_pid: any, prompt: string) => {
        promptSeen = prompt;
        started?.();
        if (release !== undefined)
          await new Promise<void>((r) => {
            release = r;
          });
        return JSON.stringify({
          answer: "Proposed heading formatting.",
          operations: [format],
        });
      },
    }),
  };
  const original = s.google.tool.bind(s.google);
  s.google.tool = async (name, args) =>
    name === "get_source_document"
      ? {
          documentId: args.document_id,
          revisionId: "upstream-version",
          tabs: [
            {
              tabId: "source-tab",
              title: "Research notes",
              body: {
                content: [
                  {
                    startIndex: 1,
                    endIndex: upstream.length + 2,
                    paragraph: {
                      elements: [{ textRun: { content: upstream + "\n" } }],
                    },
                  },
                ],
              },
            },
          ],
          download_url: "https://private.invalid/never-forward",
        }
      : original(name, args);
  const server = createApp(s.store, local, s.m, project, undefined, ai).listen(
    0,
    "127.0.0.1",
  );
  await new Promise<void>((r) => server.on("listening", r));
  const base = `http://127.0.0.1:${(server.address() as any).port}/api/v1`,
    headers = { "Content-Type": "application/json", "X-SOLAIR-Client": "web" },
    request = async (path: string, body: any = {}, method = "POST") =>
      fetch(base + path, { method, headers, body: JSON.stringify(body) });
  try {
    await fetch(base + "/manuscript/sections");
    const section = s.m.sections().find((x) => x.title === "Introduction")!,
      sid = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    s.store.put("source", {
      id: sid,
      origin: "drive",
      driveId: "native-source",
      mime: "application/vnd.google-apps.document",
      name: "Research notes",
      sectionId: section.id,
      evidenceReviewed: false,
    });
    assert.equal(
      (
        await request(
          "/sources/" + sid,
          { sectionId: section.id, evidenceReviewed: true },
          "PATCH",
        )
      ).status,
      409,
    );
    assert.equal(
      (await request("/sources/" + sid + "/prepare-text")).status,
      200,
    );
    const snapshot = (
      await (await fetch(base + "/sources/" + sid + "/text")).json()
    ).data;
    assert.equal(snapshot.text, "TAB: Research notes\n" + upstream + "\n");
    assert(!JSON.stringify(snapshot).includes("private.invalid"));
    assert.equal(
      (
        await request(
          "/sources/" + sid,
          { sectionId: section.id, evidenceReviewed: true },
          "PATCH",
        )
      ).status,
      200,
    );
    const j = s.m.create("Heading", [format], [sid]),
      preview = await approvedPreview(s, j.id);
    upstream = "New unreviewed evidence in Google Drive";
    assert.equal(
      (await (await fetch(base + "/sources/" + sid + "/text")).json()).data
        .text,
      snapshot.text,
    );
    const tid = (
      await (
        await request("/chat/threads", { title: "Source race test" })
      ).json()
    ).data.id;
    const invoked = new Promise<void>((r) => (started = r));
    release = () => {};
    assert.equal(
      (
        await request("/chat/threads/" + tid + "/messages", {
          text: "Keep the introduction heading with its paragraph",
          sectionIds: [section.id],
          sourceIds: [sid],
        })
      ).status,
      202,
    );
    await invoked;
    assert(promptSeen.includes("Original reviewed evidence"));
    assert(!promptSeen.includes(upstream));
    assert(!promptSeen.includes("private.invalid"));
    assert.equal(
      (await request("/sources/" + sid + "/prepare-text")).status,
      200,
    );
    assert.equal(s.store.get("source", sid).evidenceReviewed, false);
    release!();
    let assistant: any;
    for (let i = 0; i < 100; i++) {
      assistant = s.store.get("thread", tid).messages.at(-1);
      if (assistant.status !== "running") break;
      await new Promise((r) => setTimeout(r, 10));
    }
    assert.equal(assistant.status, "failed");
    assert.match(assistant.text, /Source content, mapping or review changed/);
    assert.equal(s.store.list("job").length, 1);
    await assert.rejects(
      s.m.apply(j.id, preview.baseRevision!, j.id),
      /Map each selected source/,
    );
    assert(!s.google.calls.includes("batch_update_document"));
  } finally {
    release?.();
    await new Promise<void>((r) => server.close(() => r()));
    s.close();
  }
});
test("Restart flags interrupted writes for reconciliation", () => {
  const s = setup();
  try {
    const j = s.m.create("Heading", [format]);
    j.status = "applying";
    s.m.save(j);
    new Manuscript(s.store, s.google, project);
    assert.equal(s.m.get(j.id).status, "blocked");
  } finally {
    s.close();
  }
});
test("Two wording replacements in one paragraph are blocked before writing", async () => {
  const s = setup();
  try {
    const j = s.m.create("Two cell edits", [
      {
        type: "replace_text",
        before: "T1-01",
        after: "T1-A1",
        evidence: "Trial",
      },
      {
        type: "replace_text",
        before: "T1-01",
        after: "T1-0B",
        evidence: "Trial",
      },
    ]);
    await assert.rejects(approvedPreview(s, j.id));
    assert(!s.google.calls.includes("copy_file"));
  } finally {
    s.close();
  }
});
test("Readback detects an unexpected text edit outside the requested formatting", async () => {
  const s = setup();
  try {
    const j = s.m.create("Heading", [format]);
    const p = await approvedPreview(s, j.id);
    const original = s.google.tool.bind(s.google);
    s.google.tool = async (name, args) => {
      const r = await original(name, args);
      if (name === "batch_update_document") {
        const tab = s.google.doc.tabs.find(
            (t: any) => t.tabId === TARGET.tab_id,
          ),
          para = Engine.paragraphs(tab).find(
            (p: any) => p.text.trim() === "Introduction",
          );
        para.paragraph.elements[0].textRun.content += "Unexpected";
      }
      return r;
    };
    const applied = await s.m.apply(j.id, p.baseRevision!, j.id);
    assert.equal(applied.status, "blocked");
    assert.equal(applied.verification?.native, false);
  } finally {
    s.close();
  }
});
test("A preview in progress cannot race an apply or overwrite its durable state", async () => {
  const s = setup();
  try {
    const j = s.m.create("Heading", [format]);
    const p = await approvedPreview(s, j.id);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const original = s.google.tool.bind(s.google);
    s.google.tool = async (name, args) => {
      if (name === "get_document") await gate;
      return original(name, args);
    };
    const pending = approvedPreview(s, j.id);
    await assert.rejects(s.m.apply(j.id, p.baseRevision!, j.id), /in progress/);
    release();
    assert.equal((await pending).status, "dry_run_ready");
    assert(!s.google.calls.includes("batch_update_document"));
  } finally {
    s.close();
  }
});
test("HTTP rejects cross-origin access, unsupported targets, and scheduling; persists chat", async () => {
  const s = setup();
  const app = createApp(s.store, new Codex(process.cwd()), s.m, project),
    server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.on("listening", r));
  const addr = server.address() as any,
    base = `http://127.0.0.1:${addr.port}/api/v1`;
  try {
    const req = (path: string, body: any, headers: any = {}) =>
      fetch(base + path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-SOLAIR-Client": "web",
          ...headers,
        },
        body: JSON.stringify(body),
      });
    assert.equal(
      (
        await fetch(base + "/health", {
          headers: { Origin: "https://evil.example" },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(base + "/chat/threads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await req("/jobs", {
          request: "x",
          operations: [format],
          documentId: "production",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await fetch(base + "/automation", {
          method: "PATCH",
          headers: { "X-SOLAIR-Client": "web" },
        })
      ).status,
      409,
    );
    const r = await req("/chat/threads", { title: "Review" });
    assert.equal(r.status, 201);
    const t = (await r.json()).data;
    assert.equal(
      (await (await fetch(base + "/chat/threads/" + t.id)).json()).data.title,
      "Review",
    );
    const form = new FormData();
    form.append(
      "file",
      new Blob(["review source"], { type: "text/plain" }),
      "../notes.txt",
    );
    const up = await fetch(base + "/sources", {
      method: "POST",
      headers: { "X-SOLAIR-Client": "web" },
      body: form,
    });
    assert.equal(up.status, 201);
    const source = (await up.json()).data;
    assert.equal(source.name, "notes.txt");
    assert.equal(source.status, "needs_mapping");
    assert(!source.evidenceReviewed);
    assert.equal(
      (
        await req("/jobs/not-an-id/layout-review", {
          revision: "fake",
          notes: "Looks fine to me",
        })
      ).status,
      404,
    );
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    s.close();
  }
});
test("Readback blocks unexpected formatting outside the approved heading even when all text and native objects match", async () => {
  const s = setup();
  try {
    const j = s.m.create("Heading", [format]),
      p = await approvedPreview(s, j.id),
      original = s.google.tool.bind(s.google);
    s.google.tool = async (name, args) => {
      const r = await original(name, args);
      if (name === "batch_update_document") {
        const tab = s.google.doc.tabs.find(
            (t: any) => t.tabId === TARGET.tab_id,
          ),
          other = Engine.paragraphs(tab).find(
            (p: any) => !p.location && p.text.trim() === "Research Design",
          );
        other.paragraph.paragraphStyle.lineSpacing = 100;
      }
      return r;
    };
    const applied = await s.m.apply(j.id, p.baseRevision!, j.id);
    assert.equal(applied.status, "blocked");
    assert.equal(applied.verification?.native, false);
  } finally {
    s.close();
  }
});
test("Section-based source mapping, private PNG preview and Drive-image preparation need no paragraph selection", async () => {
  const s = setup(),
    bytes = readFileSync(
      resolve("../work/manuscript-automation/trial-image.png"),
    ),
    app = createApp(s.store, new Codex(process.cwd()), s.m, project),
    server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.on("listening", r));
  const base = `http://127.0.0.1:${(server.address() as any).port}/api/v1`,
    headers = { "Content-Type": "application/json", "X-SOLAIR-Client": "web" };
  try {
    const sec = (await (await fetch(base + "/manuscript/sections")).json())
      .data;
    assert.equal(sec.defaultScope, "general");
    const section = sec.sections.find((s: any) => s.title === "Introduction");
    const form = new FormData();
    form.append(
      "file",
      new Blob([bytes], { type: "image/png" }),
      "private.png",
    );
    const up = await fetch(base + "/sources", {
        method: "POST",
        headers: { "X-SOLAIR-Client": "web" },
        body: form,
      }),
      source = (await up.json()).data;
    assert.equal(up.status, 201);
    assert(source.image.width > 0);
    assert.equal(source.evidenceReviewed, false);
    const preview = await fetch(base + "/sources/" + source.id + "/image");
    assert(Buffer.from(await preview.arrayBuffer()).equals(bytes));
    const mapped = await fetch(base + "/sources/" + source.id, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ sectionId: section.id, evidenceReviewed: true }),
    });
    assert.equal(mapped.status, 200);
    assert.equal((await mapped.json()).data.sectionId, section.id);
    const sid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    s.store.put("source", {
      id: sid,
      name: "Inbox private image.png",
      origin: "drive",
      driveId: "fixture-drive-image",
      mime: "image/png",
      sectionId: section.id,
      evidenceReviewed: true,
    });
    const original = s.google.tool.bind(s.google);
    s.google.tool = async (name, args) =>
      name === "fetch"
        ? { base64: bytes.toString("base64") }
        : original(name, args);
    const prepared = await fetch(base + "/sources/" + sid + "/prepare-image", {
      method: "POST",
      headers,
      body: "{}",
    });
    assert.equal(prepared.status, 200);
    const drive = (await prepared.json()).data;
    assert(drive.image);
    assert.equal(drive.evidenceReviewed, false);
    assert.equal(drive.status, "needs_evidence_review");
    assert(!JSON.stringify(drive).includes(s.dir));
    assert(!s.google.calls.includes("batch_update_document"));
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    s.close();
  }
});

test("Shared-link top-level navigation opens the HTML shell while cross-site APIs, frames and writes stay blocked", async () => {
  const s = setup(),
    webProject = mkdtempSync(join(tmpdir(), "solair-nav-"));
  const dist = join(webProject, "manuscript-app/apps/web/dist");
  mkdirSync(dist, { recursive: true });
  writeFileSync(
    join(dist, "index.html"),
    "<!doctype html><title>Shared workspace shell</title>",
  );
  const team = new Team(s.store, {
    enabled: true,
    publicOrigin: "https://workspace.example",
    workers: {},
  });
  const server = createApp(
    s.store,
    new Codex(process.cwd()),
    s.m,
    webProject,
    team,
  ).listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.on("listening", r));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  // Node fetch overwrites Sec-Fetch-Mode with cors; send browser navigation
  // metadata verbatim to test the actual request rather than that test artifact.
  const fetch = (
    url: string,
    options: { method?: string; headers?: Record<string, string> } = {},
  ) =>
    new Promise<{
      status: number;
      headers: { get: (name: string) => string };
      text: () => Promise<string>;
    }>((resolve, reject) => {
      const request = httpRequest(url, options, (response) => {
        let text = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => (text += chunk));
        response.on("end", () =>
          resolve({
            status: response.statusCode!,
            headers: {
              get: (name) => String(response.headers[name.toLowerCase()] || ""),
            },
            text: async () => text,
          }),
        );
      });
      request.on("error", reject);
      request.end();
    });
  const nav = {
    "Sec-Fetch-Site": "cross-site",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Dest": "document",
  };
  try {
    for (const path of ["/", "/app", "/app/help", "/signin"]) {
      const result = await fetch(base + path, { headers: nav });
      assert.equal(result.status, 200);
      assert.match(result.headers.get("content-type") || "", /text\/html/);
    }
    assert.equal(
      (await fetch(base, { method: "HEAD", headers: nav })).status,
      200,
    );
    assert.equal(
      (
        await fetch(base, {
          headers: { ...nav, Origin: "https://evil.example" },
        })
      ).status,
      403,
    );
    assert.equal(
      (await fetch(base, { headers: { ...nav, "Sec-Fetch-Dest": "iframe" } }))
        .status,
      403,
    );
    assert.equal(
      (
        await fetch(base, {
          headers: {
            ...nav,
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Dest": "empty",
          },
        })
      ).status,
      403,
    );
    for (const path of [
      "/api",
      "/API/v1/auth/status",
      "/api/v1/auth/status",
      "/api/v1/sources",
      "/api/v1/jobs",
    ])
      assert.equal((await fetch(base + path, { headers: nav })).status, 403);
    assert.equal(
      (
        await fetch(base + "/api/v1/auth/logout", {
          method: "POST",
          headers: { ...nav, "X-SOLAIR-Client": "web" },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(base + "/api/v1/auth/status", {
          headers: { "Sec-Fetch-Site": "same-origin" },
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await fetch(base + "/api/v1/sources", {
          headers: { "Sec-Fetch-Site": "same-origin" },
        })
      ).status,
      401,
    );
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    s.close();
    rmSync(webProject, { recursive: true, force: true });
  }
});
