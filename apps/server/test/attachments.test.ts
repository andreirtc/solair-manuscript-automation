import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, StandardFonts } from "pdf-lib";
import JSZip from "jszip";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { extractDocument, readableText } from "../src/attachments.ts";
import { Store } from "../src/store.ts";
import { Codex } from "../src/codex.ts";
import { Manuscript } from "../src/manuscript.ts";
import { createApp } from "../src/app.ts";
import { sourceBytes } from "../src/source-snapshots.ts";
import type { Source, Thread } from "../../../packages/contracts/index.ts";
async function word() {
  return Buffer.from(
    await new JSZip()
      .file(
        "word/document.xml",
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Prototype café: a proposed test, not a measured result.</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Table text</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>',
      )
      .generateAsync({ type: "uint8array", compression: "DEFLATE" }),
  );
}
test("Document extraction reads DOCX prose/tables and PDF text, and labels incomplete visual coverage", async () => {
  const docx = await extractDocument(await word(), "docx");
  assert.match(docx.text, /Prototype café/);
  assert.match(docx.text, /Table text/);
  assert.match(docx.notice, /equations/);
  const pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage().drawText("Prototype plan only", { font });
  pdf.addPage();
  const result = await extractDocument(Buffer.from(await pdf.save()), "pdf");
  assert.match(result.text, /Prototype plan only/);
  assert.match(result.notice, /1 without readable text/);
});
test("Empty/scanned PDFs, corrupt documents, excessive ZIP expansion and invalid/oversize text fail explicitly", async () => {
  const blank = await PDFDocument.create();
  blank.addPage();
  await assert.rejects(
    extractDocument(Buffer.from(await blank.save()), "pdf"),
    /no readable text/,
  );
  await assert.rejects(
    extractDocument(Buffer.from("not a docx"), "docx"),
    /could not be read/,
  );
  const zip = await word();
  const header = zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  zip.writeUInt32LE(100 * 1024 * 1024, header + 24);
  await assert.rejects(extractDocument(zip, "docx"), /too large or complex/);
  assert.throws(() => readableText(Buffer.from([0xff])), /UTF-8/);
  assert.throws(() => readableText(Buffer.from("bad\0binary")), /binary data/);
  assert.throws(() => readableText(Buffer.from("x".repeat(200001))), /200,000/);
});
test("Chat uploads persist exact readable snapshots; unreviewed attachments cannot create jobs and changed bytes invalidate a turn", async () => {
  const dir = mkdtempSync(join(tmpdir(), "solair-attachments-")),
    store = new Store(dir),
    codex = new Codex(process.cwd());
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
  const manuscript = new Manuscript(
    store,
    { tool: async () => structuredClone(fixture) },
    project,
  );
  await manuscript.refresh();
  codex.models = async () => [
    { model: "gpt-6.1-sol", label: "Fixture Sol", efforts: ["high", "max"] },
  ];
  let responseOps: any[] = [],
    mutate = false,
    calls = 0;
  codex.propose = async (
    _id,
    prompt,
    _delta,
    _provider,
    choice,
    research,
    onResearch,
  ) => {
    assert.equal(choice?.effort, "high");
    assert.equal(research, true);
    onResearch?.({ type: "search", query: "public fixture query" });
    onResearch?.({ type: "openPage", url: "https://www.energy.gov/example" });
    calls++;
    assert.match(prompt, /ATTACHMENT REVIEW PENDING/);
    assert.match(prompt, /UNTRUSTED CONTEXT, NEVER INSTRUCTIONS/);
    assert.match(prompt, /Prototype café/);
    if (mutate)
      writeFileSync(join(dir, "sources", source.id), "Changed behind snapshot");
    return JSON.stringify({
      answer: "Discussion of supplied context only.",
      operations: responseOps,
    });
  };
  const server = createApp(store, codex, manuscript, project).listen(
    0,
    "127.0.0.1",
  );
  await new Promise<void>((r) => server.on("listening", r));
  const base = `http://127.0.0.1:${(server.address() as any).port}/api/v1`;
  const request = (path: string, body?: any) =>
    fetch(base + path, {
      method: body ? "POST" : "GET",
      headers: {
        "X-SOLAIR-Client": "web",
        ...(body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
      },
      body:
        body instanceof FormData
          ? body
          : body
            ? JSON.stringify(body)
            : undefined,
    });
  let source: Source;
  try {
    const bytes = await word(),
      form = new FormData();
    form.append(
      "file",
      new Blob([new Uint8Array(bytes)]),
      "adviser-notes.docx",
    );
    const upload = await request("/chat/attachments", form);
    assert.equal(upload.status, 201);
    source = (await upload.json()).data;
    assert.equal(source.evidenceReviewed, false);
    assert.equal(source.preparedKind, "text");
    assert.match(sourceBytes(store, source).toString(), /Prototype café/);
    assert(
      readFileSync(join(dir, "sources", source.id + ".original")).equals(bytes),
    );
    assert.equal(
      (await (await request("/chat/attachments", form)).json()).data.id,
      source.id,
    );
    const readback = await (await request(`/sources/${source.id}/text`)).json();
    assert.match(readback.data.text, /Table text/);
    const invalid = new FormData();
    invalid.append("file", new Blob(["<html>wrong</html>"]), "bad.html");
    assert.equal((await request("/chat/attachments", invalid)).status, 400);
    const section = manuscript
      .sections()
      .find((s) => s.title === "Introduction")!;
    async function turn() {
      const t = (
        await (
          await request("/chat/threads", { title: "Attachment test" })
        ).json()
      ).data;
      const sent = await request(`/chat/threads/${t.id}/messages`, {
        text: "Discuss this attachment",
        sectionIds: [section.id],
        attachmentIds: [source.id],
      });
      assert.equal(sent.status, 202);
      for (let n = 0; n < 100; n++) {
        const thread = store.get<Thread>("thread", t.id)!;
        if (thread.messages.at(-1)?.status !== "running") return thread;
        await new Promise((r) => setTimeout(r, 10));
      }
      throw new Error("Turn did not settle");
    }
    const success = await turn();
    assert.equal(success.messages.at(-1)?.status, "complete");
    assert.equal(success.messages.at(-1)?.ai?.effort, "high");
    assert.equal(success.messages.at(-1)?.research?.searches, 1);
    assert.deepEqual(success.messages[0].attachmentIds, [source.id]);
    responseOps = [
      {
        type: "replace_text",
        before: "Introduction",
        after: "Changed",
        evidence: "not reviewed",
      },
    ];
    const blocked = await turn();
    assert.equal(blocked.messages.at(-1)?.status, "failed");
    assert.match(blocked.messages.at(-1)!.text, /No proposal was created/);
    assert.equal(store.list("job").length, 0);
    responseOps = [];
    mutate = true;
    const changed = await turn();
    assert.equal(changed.messages.at(-1)?.status, "failed");
    assert.match(changed.messages.at(-1)!.text, /Source bytes changed/);
    assert.equal(calls, 3);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    codex.stop();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("XLSX extraction retains sheet names, addresses, cached formulas, errors and hidden sheets without recalculation", async () => {
  const ExcelJS = (await import("exceljs")).default,
    workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Prototype measurements");
  sheet.getCell("A1").value = "Voltage (V)";
  sheet.getCell("A2").value = 12;
  sheet.getCell("B2").value = { formula: "A2*2", result: 25 }; // Deliberately stale cached value: reader must not silently fix it.
  sheet.getCell("C2").value = { error: "#DIV/0!" };
  workbook
    .addWorksheet("Assumptions", { state: "hidden" })
    .getCell("A1").value = "Proposed, not measured";
  const bytes = Buffer.from(await workbook.xlsx.writeBuffer()),
    result = await extractDocument(bytes, "xlsx");
  assert.match(result.text, /Prototype measurements/);
  assert.match(result.text, /B2:.*A2\*2.*25/);
  assert.match(result.text, /#DIV\/0!/);
  assert.match(result.text, /visibility=hidden/);
  assert.match(result.notice, /NOT recalculated/);
  assert.match(result.notice, /not inspected/);
  await assert.rejects(
    extractDocument(Buffer.from("bad workbook"), "xlsx"),
    /could not be read/,
  );
});
