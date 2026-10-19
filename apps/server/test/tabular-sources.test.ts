import test from "node:test";
import assert from "node:assert/strict";
import {
  csvRecords,
  sourceTables,
  rowNumbers,
  selectedTableText,
} from "../src/tabular-sources.ts";
import type { Source } from "../../../packages/contracts/index.ts";
const source = { id: "csv-source", name: "Forms responses.csv" } as Source;
test("Forms CSV retains quoted commas, newlines, escaped quotes and stable source-record numbers", () => {
  const text =
    'Code,Answer\r\n"1 and 2","Observed, together"\r\n"3 and 4","First line\nSecond ""quoted"" line"\r\nEXCLUDE,Invented\r\n';
  const rows = csvRecords(text);
  assert.equal(rows.length, 4);
  assert.equal(rows[2][1], 'First line\nSecond "quoted" line');
  const [table] = sourceTables(source, text);
  assert.deepEqual(
    table.rows.map((r) => r.row),
    [2, 3, 4],
  );
  assert.equal(table.rows[0].values[0], "1 and 2");
  assert.throws(() => csvRecords('Code,Answer\n1,"unfinished'), /incomplete/);
});
test("Pending eligibility hides response values; selected genuine rows exclude all others and are not labelled participant counts", () => {
  const text =
    "Code,Answer\n1 and 2,Genuine paired response\n3 and 4,Another genuine response\nTEST,Invented response\n";
  const pending = selectedTableText(source, text);
  assert.match(pending, /ROW ELIGIBILITY PENDING/);
  assert.doesNotMatch(pending, /Genuine paired|Invented response/);
  const selected = selectedTableText(
    {
      ...source,
      rowSelection: {
        sheet: "CSV",
        rows: [2, 3],
        notes:
          "User verified original BEMAC code labels. Exclude the test entry.",
      },
    },
    text,
  );
  assert.match(selected, /Genuine paired response/);
  assert.doesNotMatch(selected, /Invented response/);
  assert.match(
    selected,
    /2 source records; NOT automatically this many people/,
  );
  assert.throws(
    () =>
      selectedTableText(
        {
          ...source,
          rowSelection: { sheet: "CSV", rows: [1], notes: "invalid header" },
        },
        text,
      ),
    /unavailable/,
  );
});
test("XLSX source row eligibility preserves sheet and cell coordinates, cached/formula values and separate sheets", () => {
  const text =
    '\n[SHEET "BEMAC"; visibility=visible; cached values only]\nA1: "Code"\nB1: "Answer"\nA2: "1 and 2"\nB2: {"formula":"1+1","result":2}\nA3: "TEST"\nB3: "exclude"\n[SHEET "Other"; visibility=hidden; cached values only]\nA1: "Header"\nA2: "not this group"\n';
  const x = { ...source, name: "Forms.xlsx" };
  const tables = sourceTables(x, text);
  assert.deepEqual(
    tables.map((t) => t.sheet),
    ["BEMAC", "Other"],
  );
  const selected = selectedTableText(
    {
      ...x,
      rowSelection: {
        sheet: "BEMAC",
        rows: [2],
        notes: "Reviewed BEMAC respondent codes only.",
      },
    },
    text,
  );
  assert.match(selected, /formula/);
  assert.doesNotMatch(selected, /SOURCE ROW 3|not this group|\\"TEST\\"/);
  assert.throws(
    () =>
      selectedTableText(
        { ...x, rowSelection: { sheet: "missing", rows: [2], notes: "bad" } },
        text,
      ),
    /unavailable/,
  );
});
test("Row-range selection is explicit, bounded, deduplicated and rejects malformed or reversed ranges", () => {
  assert.deepEqual(rowNumbers("2-4, 3, 8"), [2, 3, 4, 8]);
  for (const bad of ["all", "1;delete", "4-2", "0", "1-999999"])
    assert.throws(() => rowNumbers(bad));
});
