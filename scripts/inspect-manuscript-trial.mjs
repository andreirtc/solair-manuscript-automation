import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "@napi-rs/canvas";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import assert from "node:assert/strict";
const dir = resolve(".local/acceptance/research-upgrade/manuscript-trial"),
  proposal = JSON.parse(readFileSync(join(dir, "model-proposal.json"))),
  anchor = proposal.response.operations[0].expected_text;
const norm = (s) => s.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase(),
  needle = norm(anchor).slice(0, 100),
  records = [];
for (const name of ["after", "restored"]) {
  const task = getDocument({
      data: new Uint8Array(readFileSync(join(dir, name + ".pdf"))),
      isEvalSupported: false,
      useWorkerFetch: false,
      disableFontFace: true,
      verbosity: 0,
      standardFontDataUrl:
        resolve("node_modules/pdfjs-dist/standard_fonts") + "/",
    }),
    doc = await task.promise;
  const matches = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p),
        content = await page.getTextContent(),
        items = content.items.filter((x) => "str" in x),
        text = items.map((x) => x.str).join(" ");
      if (norm(text).includes(needle)) {
        matches.push({
          page: p,
          width: page.view[2] - page.view[0],
          height: page.view[3] - page.view[1],
          items: items.map((x) => ({ text: x.str, transform: x.transform })),
        });
        const viewport = page.getViewport({ scale: 1.3 }),
          canvas = createCanvas(
            Math.ceil(viewport.width),
            Math.ceil(viewport.height),
          );
        await page.render({ canvasContext: canvas.getContext("2d"), viewport })
          .promise;
        writeFileSync(
          join(dir, name + "-page-" + p + ".png"),
          canvas.toBuffer("image/png"),
          { mode: 0o600 },
        );
        if (matches.length >= 3) break;
      }
      page.cleanup();
    }
    assert(matches.length, "Target paragraph not found in " + name + " PDF");
    records.push({ name, pages: doc.numPages, matches });
    console.log(
      name,
      doc.numPages,
      "PDF pages; target pages",
      matches.map((m) => m.page),
    );
  } finally {
    await task.destroy();
  }
}
const a = records[0].matches[0],
  r = records[1].matches[0],
  changed = a.items.filter(
    (item, i) =>
      item.text === r.items[i]?.text &&
      JSON.stringify(item.transform) !== JSON.stringify(r.items[i].transform),
  ).length;
assert(changed > 0, "PDF did not expose the intended temporary spacing change");
writeFileSync(
  join(dir, "pdf-inspection.json"),
  JSON.stringify(
    {
      at: new Date().toISOString(),
      scope: "Developer trial PDF inspection, not submission approval",
      pages: records.map((x) => ({
        name: x.name,
        count: x.pages,
        targetPages: x.matches.map((m) => m.page),
      })),
      positionChangedRuns: changed,
      images: records.flatMap((x) =>
        x.matches.map((m) => x.name + "-page-" + m.page + ".png"),
      ),
      visualReview: "pending",
    },
    null,
    2,
  ),
  { mode: 0o600 },
);
console.log(
  "PDF layout changed as expected:",
  changed,
  "text runs; affected pages rendered.",
);
