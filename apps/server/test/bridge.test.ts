import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { GoogleBridge } from "../src/google-bridge.ts";
import { TARGET, Engine } from "../src/manuscript.ts";
const fixture = JSON.parse(
  readFileSync(
    resolve("../work/manuscript-automation/trial-before/document-result.json"),
    "utf8",
  ),
).structuredContent;
function setup() {
  const key = "a-private-test-key-that-is-at-least-32-characters",
    properties = new Map([["SOLAIR_BRIDGE_KEY", key]]),
    calls: any[] = [],
    doc = structuredClone(fixture);
  doc.tabs = doc.tabs.map((tab: any) => {
    const {
      tabId,
      title,
      parentTabId,
      index,
      nestingLevel,
      iconEmoji,
      ...documentTab
    } = tab;
    return {
      tabProperties: {
        tabId,
        title,
        parentTabId,
        index,
        nestingLevel,
        iconEmoji,
      },
      documentTab,
    };
  });
  const context = vm.createContext({
    Solair: Engine,
    Date,
    JSON,
    Object,
    Array,
    String,
    Math,
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k: string) => properties.get(k),
        setProperty: (k: string, v: string) => properties.set(k, v),
      }),
    },
    Utilities: {
      Charset: { UTF_8: "utf8" },
      computeHmacSha256Signature: (v: string, k: string) =>
        [...createHmac("sha256", k).update(v).digest()].map((b) =>
          b > 127 ? b - 256 : b,
        ),
    },
    LockService: {
      getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }),
    },
    ContentService: {
      MimeType: { JSON: "application/json" },
      createTextOutput: (v: string) => ({ setMimeType: () => v }),
    },
    Docs: {
      Documents: {
        get: (id: string) => {
          assert.equal(id, TARGET.document_id);
          return doc;
        },
        batchUpdate: (body: any, id: string) => {
          calls.push({ body, id });
          return { writeControl: body.writeControl };
        },
      },
    },
    DriveApp: {
      getFileById: () => {
        throw new Error("Drive operation not mocked");
      },
    },
  });
  vm.runInContext(readFileSync("deploy/google/Bridge.gs", "utf8"), context);
  const envelope = (action: string, args: any = {}, timestamp = Date.now()) => {
    const nonce = randomBytes(24).toString("hex"),
      payload = JSON.stringify({ action, args });
    return {
      timestamp,
      nonce,
      payload,
      signature: createHmac("sha256", key)
        .update(`${timestamp}.${nonce}.${payload}`)
        .digest("hex"),
    };
  };
  const request = (body: any) =>
    JSON.parse(
      context.doPost({ postData: { contents: JSON.stringify(body) } }),
    );
  return { context, key, calls, doc, envelope, request };
}
test("Google bridge rejects missing or altered signatures, old timestamps, replay and arbitrary actions", () => {
  const s = setup(),
    valid = s.envelope("get");
  assert.equal(s.request({ ...valid, signature: "invalid" }).ok, false);
  assert.equal(
    s.request({
      ...valid,
      payload: JSON.stringify({ action: "get", args: { altered: true } }),
    }).ok,
    false,
  );
  assert.equal(s.request(s.envelope("get", {}, Date.now() - 180000)).ok, false);
  assert.equal(s.request(valid).ok, true);
  assert.equal(s.request(valid).ok, false);
  assert.equal(
    s.request(
      s.envelope("arbitrary_document_batch", { document_id: "original" }),
    ).ok,
    false,
  );
  assert.equal(s.calls.length, 0);
});
test("Cloud apply replans the trial job, protects SOP and rejects stale revisions before a Google write", () => {
  const s = setup();
  const job = {
    schema_version: 1,
    job_id: "cloud-trial-test",
    document_id: TARGET.document_id,
    tab_id: TARGET.tab_id,
    operations: [
      {
        type: "format_paragraph",
        expected_text: "Introduction",
        paragraph_style: { keepWithNext: true },
        evidence: "Authorized trial formatting request",
      },
    ],
  };
  assert.equal(
    s.request(s.envelope("apply", { job, revision: "stale" })).ok,
    false,
  );
  assert.equal(
    s.request(
      s.envelope("apply", {
        job: { ...job, document_id: "original" },
        revision: s.doc.revisionId,
      }),
    ).ok,
    false,
  );
  assert.equal(
    s.request(
      s.envelope("apply", {
        job: {
          ...job,
          operations: [
            { ...job.operations[0], expected_text: "Statement of the Problem" },
          ],
        },
        revision: s.doc.revisionId,
      }),
    ).ok,
    false,
  );
  assert.equal(s.calls.length, 0);
  assert.equal(
    s.request(s.envelope("apply", { job, revision: s.doc.revisionId })).ok,
    true,
  );
  assert.equal(s.calls.length, 1);
  assert.equal(s.calls[0].id, TARGET.document_id);
  assert(s.calls[0].body.requests.some((r: any) => r.createNamedRange));
  assert.equal(
    s.calls[0].body.writeControl.requiredRevisionId,
    s.doc.revisionId,
  );
});
test("Cloud adapter accepts only official deployed endpoints and scoped document actions", async () => {
  assert.throws(
    () =>
      new GoogleBridge({
        url: "https://evil.example/exec",
        key: "x".repeat(40),
      }),
  );
  const adapter = new GoogleBridge({
    url: "https://script.google.com/macros/s/EXAMPLE/exec",
    key: "x".repeat(40),
  });
  await assert.rejects(
    adapter.tool("get_document", { document_id: "original" }),
    /trial document/,
  );
  await assert.rejects(
    adapter.tool("batch_update_document", {
      document_id: TARGET.document_id,
      requests: [],
    }),
    /trial document/,
  );
});
test("Native source reads require an inbox Google Doc and use full tab content without widening the trial reader", async () => {
  const s = setup();
  let mime = "text/plain",
    reads = 0;
  s.context.DriveApp.getFileById = (id: string) => ({
    getParents: () => {
      let available = true;
      return {
        hasNext: () => available,
        next: () => {
          available = false;
          return {
            getId: () =>
              id === "inbox-document"
                ? "1Vlx6tp0oQHfuHxAgo7Pl6JyMH3pfrlpN"
                : "outside-inbox",
          };
        },
      };
    },
    isTrashed: () => false,
    getMimeType: () => mime,
  });
  s.context.Docs.Documents.get = (id: string, args: any) => {
    reads++;
    assert.equal(id, "inbox-document");
    assert.equal(args.includeTabsContent, true);
    return { documentId: id, revisionId: "source-revision", tabs: [] };
  };
  assert.equal(
    s.request(
      s.envelope("source", { id: "outside-document", nativeDocument: true }),
    ).ok,
    false,
  );
  assert.equal(
    s.request(
      s.envelope("source", { id: "inbox-document", nativeDocument: true }),
    ).ok,
    false,
  );
  assert.equal(reads, 0);
  mime = "application/vnd.google-apps.document";
  const result = s.request(
    s.envelope("source", { id: "inbox-document", nativeDocument: true }),
  );
  assert.equal(result.ok, true);
  assert.equal(result.data.documentId, "inbox-document");
  assert.equal(reads, 1);
  assert.equal(s.calls.length, 0);
  const adapter = new GoogleBridge({
    url: "https://script.google.com/macros/s/EXAMPLE/exec",
    key: "x".repeat(40),
  });
  adapter.call = async (action, args) => {
    assert.equal(action, "source");
    assert.equal(args.id, "inbox-document");
    assert.equal(args.nativeDocument, true);
    return result.data;
  };
  assert.equal(
    (
      await adapter.tool("get_source_document", {
        document_id: "inbox-document",
      })
    ).documentId,
    "inbox-document",
  );
  await assert.rejects(
    adapter.tool("get_document", { document_id: "inbox-document" }),
    /trial document/,
  );
});
test("Bridge figure writes accept only one short-lived capability on the configured app origin", () => {
  const s = setup();
  s.context.PropertiesService.getScriptProperties().setProperty(
    "SOLAIR_ASSET_ORIGIN",
    "https://team.example",
  );
  const doc = Engine.normalize(s.doc),
    tab = doc.tabs.find((t: any) => t.tabId === TARGET.tab_id),
    ps = Engine.paragraphs(tab),
    anchor = ps.find(
      (p: any) => !p.location && p.text.trim() === "Introduction",
    );
  const style = {
    alignment: "JUSTIFIED",
    lineSpacing: 200,
    indentFirstLine: { magnitude: 36, unit: "PT" },
    indentStart: { magnitude: 4.5, unit: "PT" },
    indentEnd: { magnitude: 4.5, unit: "PT" },
  };
  const job = {
    schema_version: 1,
    job_id: "cloud-image-test",
    document_id: TARGET.document_id,
    tab_id: TARGET.tab_id,
    operations: [
      {
        type: "insert_figure",
        after_paragraph: "Introduction",
        expected_start: anchor.start,
        caption: "Figure 900. Synthetic bridge fixture only.",
        asset_id: "private-fixture",
        uri: "https://evil.example/api/v1/private-transfer/" + "a".repeat(64),
        width_pt: 200,
        height_pt: 100,
        caption_style: style,
        image_style: style,
        caption_text_style: {
          weightedFontFamily: { fontFamily: "Arial" },
          fontSize: { magnitude: 11, unit: "PT" },
        },
        evidence: "Fixture test only",
      },
    ],
  };
  assert.equal(
    s.request(s.envelope("apply", { job, revision: s.doc.revisionId })).ok,
    false,
  );
  assert.equal(s.calls.length, 0);
  job.operations[0].uri =
    "https://team.example/api/v1/private-transfer/" + "a".repeat(64);
  assert.equal(
    s.request(s.envelope("apply", { job, revision: s.doc.revisionId })).ok,
    true,
  );
  assert.equal(s.calls.length, 1);
  assert(s.calls[0].body.requests.some((r: any) => r.insertInlineImage));
});
test("Cloud PDF uses files.download, handles completed operations without polling, and rejects non-Google redirects", () => {
  const s = setup(),
    calls: any[] = [],
    bytes = Buffer.from("%PDF-test private fixture");
  s.context.ScriptApp = { getOAuthToken: () => "fixture-token" };
  s.context.Utilities.base64Encode = (v: any) =>
    Buffer.from(v).toString("base64");
  s.context.UrlFetchApp = {
    fetch: (url: string, args: any) => {
      calls.push({ url, args });
      if (url.includes("/download?"))
        return {
          getResponseCode: () => 200,
          getContentText: () =>
            JSON.stringify({
              done: true,
              name: "operations/complete",
              response: {
                downloadUri: "https://docs.google.com/private-download",
              },
            }),
        };
      assert.equal(url, "https://docs.google.com/private-download");
      return {
        getResponseCode: () => 200,
        getBlob: () => ({ getBytes: () => [...bytes] }),
      };
    },
  };
  const result = s.request(s.envelope("pdf"));
  assert.equal(result.ok, true);
  assert.equal(
    Buffer.from(result.data.base64, "base64").toString(),
    bytes.toString(),
  );
  assert.equal(calls.length, 2);
  assert(
    calls[0].url.includes(
      "/files/" + TARGET.document_id + "/download?mimeType=application%2Fpdf",
    ),
  );
  assert(!calls.some((c) => c.url.includes("/operations/")));
  s.context.UrlFetchApp.fetch = (url: string) => ({
    getResponseCode: () => 200,
    getContentText: () =>
      JSON.stringify({
        done: true,
        response: { downloadUri: "https://evil.example/leak" },
      }),
  });
  assert.equal(s.request(s.envelope("pdf")).ok, false);
});
