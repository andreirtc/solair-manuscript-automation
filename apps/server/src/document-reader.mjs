// Isolated, time-bounded text extraction. No rendered HTML, macros or OCR.
import process from "node:process";
const chunks = [];
let size = 0;
for await (const chunk of process.stdin) {
  size += chunk.length;
  if (size > 20 * 1024 * 1024) throw new Error("FILE_TOO_LARGE");
  chunks.push(chunk);
}
const data = Buffer.concat(chunks),
  kind = process.argv[2];
const MAX = 200000;
function check(text) {
  if (text.length > MAX) throw new Error("TEXT_TOO_LARGE");
  return text;
}
// Reject excessive ZIP expansion and ZIP64/encrypted archives before Mammoth opens it.
function checkZip(b, required = "word/document.xml") {
  let end = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--)
    if (
      b.readUInt32LE(i) === 0x06054b50 &&
      i + 22 + b.readUInt16LE(i + 20) === b.length
    ) {
      end = i;
      break;
    }
  if (end < 0) throw new Error("INVALID_DOCUMENT");
  const count = b.readUInt16LE(end + 10),
    offset = b.readUInt32LE(end + 16);
  if (
    !count ||
    count > 2000 ||
    b.readUInt16LE(end + 4) ||
    b.readUInt16LE(end + 6) ||
    b.readUInt16LE(end + 8) !== count
  )
    throw new Error("DOCUMENT_COMPLEXITY_LIMIT");
  let p = offset,
    expanded = 0,
    document = false;
  for (let n = 0; n < count; n++) {
    if (p + 46 > end || b.readUInt32LE(p) !== 0x02014b50)
      throw new Error("INVALID_DOCUMENT");
    const flags = b.readUInt16LE(p + 8),
      bytes = b.readUInt32LE(p + 24),
      nameLength = b.readUInt16LE(p + 28);
    const name = b.subarray(p + 46, p + 46 + nameLength).toString("utf8");
    expanded += bytes;
    if (flags & 1 || bytes > 16 * 1024 * 1024 || expanded > 48 * 1024 * 1024)
      throw new Error("DOCUMENT_COMPLEXITY_LIMIT");
    if (name === required) document = true;
    p += 46 + nameLength + b.readUInt16LE(p + 30) + b.readUInt16LE(p + 32);
  }
  if (!document || p !== end) throw new Error("INVALID_DOCUMENT");
}
try {
  let text = "",
    notice = "";
  if (kind === "docx") {
    checkZip(data);
    const mammoth = (await import("mammoth")).default;
    // Preserve semantic structure for source reconciliation without rendering HTML or reading image bytes.
    const html = (
      await mammoth.convertToHtml(
        { buffer: data },
        {
          externalFileAccess: false,
          convertImage: mammoth.images.imgElement(async () => ({
            src: "source-image-omitted",
          })),
        },
      )
    ).value;
    text = check(
      html
        .replace(
          /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi,
          (_all, n, value) => "\n" + "#".repeat(Number(n)) + " " + value + "\n",
        )
        .replace(
          /<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
          (_all, href, label) => label + " (" + href + ")",
        )
        .replace(
          /<img\b[^>]*>/gi,
          " [SOURCE IMAGE OMITTED — inspect the original] ",
        )
        .replace(
          /<table\b[^>]*>/gi,
          "\n[TABLE; cell order preserved, merged-cell layout not verified]\n",
        )
        .replace(/<tr\b[^>]*>/gi, "\n| ")
        .replace(/<\/(?:td|th)>/gi, " | ")
        .replace(/<\/tr>/gi, "\n")
        .replace(/<li\b[^>]*>/gi, "\n- ")
        .replace(/<\/(?:p|table|ul|ol)>|<br\s*\/?\s*>/gi, "\n")
        .replace(/<[^>]*>/g, "")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/\n{3,}/g, "\n\n")
        .trim(),
    );
    notice =
      "Word semantic text: headings, lists, hyperlinks and table-cell order retained. Figures are marked but pixels, native equations, merged-cell layout, margins and page spacing are not extracted; inspect the original for these.";
  } else if (kind === "xlsx") {
    checkZip(data, "xl/workbook.xml");
    const ExcelJS = (await import("exceljs")).default,
      workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(data);
    if (workbook.worksheets.length > 100)
      throw new Error("DOCUMENT_COMPLEXITY_LIMIT");
    let cells = 0;
    for (const sheet of workbook.worksheets) {
      text = check(
        text +
          `\n[SHEET ${JSON.stringify(sheet.name)}; visibility=${sheet.state}; cached values only]\n`,
      );
      sheet.eachRow((row) =>
        row.eachCell((cell) => {
          if (cell.value === null || cell.value === undefined) return;
          if (++cells > 20000) throw new Error("DOCUMENT_COMPLEXITY_LIMIT");
          const value =
            cell.value instanceof Date
              ? { date: cell.value.toISOString() }
              : cell.value;
          text = check(
            text + cell.address + ": " + JSON.stringify(value) + "\n",
          );
        }),
      );
    }
    if (!cells) throw new Error("NO_READABLE_TEXT");
    notice = `XLSX snapshot: ${workbook.worksheets.length} sheets, ${cells} nonempty cells (hidden sheets included and labelled). Cell addresses, formulas and saved results only. Formulas are NOT recalculated or verified; charts, images and layout are not inspected. External links/macros are not executed.`;
  } else if (kind === "pdf") {
    if (!data.subarray(0, 1024).includes(Buffer.from("%PDF-")))
      throw new Error("INVALID_DOCUMENT");
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = getDocument({
      data: new Uint8Array(data),
      isEvalSupported: false,
      useWorkerFetch: false,
      useSystemFonts: false,
      disableFontFace: true,
      verbosity: 0,
      stopAtErrors: true,
    });
    const doc = await task.promise;
    try {
      if (doc.numPages > 250) throw new Error("DOCUMENT_COMPLEXITY_LIMIT");
      let empty = 0;
      for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p),
          content = await page.getTextContent();
        let line = "";
        for (const item of content.items)
          if ("str" in item) line += item.str + (item.hasEOL ? "\n" : " ");
        if (!line.trim()) empty++;
        text = check(text + `\n[Page ${p}]\n` + line);
        page.cleanup();
      }
      if (empty === doc.numPages) throw new Error("NO_READABLE_TEXT");
      notice = `PDF text only (${doc.numPages} pages; ${empty} without readable text). No OCR or image inspection. Reading order, equations and tables may be incomplete; compare with the original.`;
    } finally {
      await task.destroy();
    }
  } else throw new Error("UNSUPPORTED_DOCUMENT");
  if (!text.trim()) throw new Error("NO_READABLE_TEXT");
  process.stdout.write(JSON.stringify({ text, notice }));
} catch (error) {
  const known = [
    "TEXT_TOO_LARGE",
    "NO_READABLE_TEXT",
    "DOCUMENT_COMPLEXITY_LIMIT",
    "INVALID_DOCUMENT",
  ];
  const code = known.includes(error.message)
    ? error.message
    : "INVALID_DOCUMENT";
  process.stdout.write(JSON.stringify({ error: code }));
  process.exitCode = 1;
}
