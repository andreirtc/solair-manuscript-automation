import type { Source } from "../../../packages/contracts/index.ts";
import { AppError } from "./errors.ts";
export interface SourceTable {
  sheet: string;
  headerRow: number;
  columns: string[];
  rows: { row: number; values: string[] }[];
}
export const isTabularSource = (s: Source) => /\.(csv|tsv|xlsx)$/i.test(s.name);
/** CSV record numbers remain stable for this frozen file, including quoted multiline fields. */
export function csvRecords(text: string, delimiter = ",") {
  const records: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false,
    closed = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else field += ch;
      continue;
    }
    if (ch === '"' && !field && !closed) {
      quoted = true;
      continue;
    }
    if (ch === delimiter) {
      row.push(field);
      field = "";
      closed = false;
      continue;
    }
    if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      records.push(row);
      row = [];
      field = "";
      closed = false;
      continue;
    }
    if (closed && ch !== " " && ch !== "\t")
      throw new AppError(
        "INVALID_CSV",
        "A CSV field has text after its closing quote. Export the response sheet as CSV again.",
      );
    if (!closed) field += ch;
  }
  if (quoted)
    throw new AppError(
      "INVALID_CSV",
      "A quoted CSV field is incomplete. Export the response sheet as CSV again.",
    );
  if (field || row.length) {
    row.push(field);
    records.push(row);
  }
  return records;
}
export function sourceTables(s: Source, text: string): SourceTable[] {
  if (/\.(csv|tsv)$/i.test(s.name)) {
    const rows = csvRecords(
      text.replace(/^\uFEFF/, ""),
      /\.tsv$/i.test(s.name) ? "\t" : ",",
    );
    return [
      {
        sheet: "CSV",
        headerRow: 1,
        columns: rows[0] || [],
        rows: rows
          .slice(1)
          .map((values, i) => ({ row: i + 2, values }))
          .filter((r) => r.values.some((v) => v.trim())),
      },
    ];
  }
  if (!/\.xlsx$/i.test(s.name)) return [];
  const tables: SourceTable[] = [];
  let table: SourceTable | undefined;
  let values = new Map<number, Map<number, string>>();
  const finish = () => {
    if (!table) return;
    const ordered = [...values].sort((a, b) => a[0] - b[0]);
    const max = Math.max(0, ...ordered.flatMap(([, v]) => [...v.keys()]));
    const rows = ordered.map(([row, v]) => ({
      row,
      values: Array.from({ length: max + 1 }, (_, i) => v.get(i) || ""),
    }));
    table.headerRow = rows[0]?.row || 1;
    table.columns = rows[0]?.values || [];
    table.rows = rows.slice(1);
    tables.push(table);
  };
  for (const line of text.split("\n")) {
    const header = /^\[SHEET ("(?:[^"\\]|\\.)*");/.exec(line);
    if (header) {
      finish();
      table = {
        sheet: JSON.parse(header[1]),
        headerRow: 1,
        columns: [],
        rows: [],
      };
      values = new Map();
      continue;
    }
    const cell = /^([A-Z]+)(\d+): (.*)$/.exec(line);
    if (!table || !cell) continue;
    let col = 0;
    for (const letter of cell[1]) col = col * 26 + letter.charCodeAt(0) - 64;
    const row = Number(cell[2]);
    if (!values.has(row)) values.set(row, new Map());
    values.get(row)!.set(col - 1, cell[3]);
  }
  finish();
  return tables;
}
export function rowNumbers(value: string) {
  if (!value.trim()) return [];
  const result = new Set<number>();
  for (const token of value.split(",")) {
    const m = /^\s*(\d+)(?:\s*[-–]\s*(\d+))?\s*$/.exec(token);
    if (!m)
      throw new AppError(
        "INVALID_ROW_SELECTION",
        "Use row numbers or ranges such as 2-9, 12. These are source rows, not respondent counts.",
      );
    const first = Number(m[1]),
      last = Number(m[2] || m[1]);
    if (first < 1 || last < first || last > 20001 || last - first > 20000)
      throw new AppError(
        "INVALID_ROW_SELECTION",
        "Choose actual source rows, up to row 20001.",
      );
    for (let row = first; row <= last; row++) result.add(row);
  }
  return [...result].sort((a, b) => a - b);
}
export function selectedTableText(s: Source, text: string) {
  if (!isTabularSource(s)) return text;
  const tables = sourceTables(s, text),
    selection = s.rowSelection;
  if (!selection)
    return `ROW ELIGIBILITY PENDING. This file has ${tables.length} sheet(s). No individual responses supplied for analysis yet. Ask the human to inspect respondent-code labels and deliberately select genuine source rows in Sources. Do not calculate counts, percentages or findings. Headers: ${JSON.stringify(tables.map((t) => ({ sheet: t.sheet, columns: t.columns })))}`;
  const table = tables.find((t) => t.sheet === selection.sheet);
  if (
    !table ||
    !selection.rows.length ||
    selection.rows.some((row) => !table.rows.some((r) => r.row === row))
  )
    throw new AppError(
      "ROW_SELECTION_STALE",
      "Selected data rows are unavailable. Inspect the current source and review row eligibility again.",
      409,
    );
  return (
    `ELIGIBLE SOURCE RECORDS ONLY; selected by human, not independently verified. Sheet ${JSON.stringify(table.sheet)}. ${selection.rows.length} source records; NOT automatically this many people. Paired/grouped answers are not independent individual responses. Selection note: ${selection.notes}\nColumns: ${JSON.stringify(table.columns)}\n` +
    table.rows
      .filter((r) => selection.rows.includes(r.row))
      .map((r) => `SOURCE ROW ${r.row}: ${JSON.stringify(r.values)}`)
      .join("\n") +
    "\nOther rows were excluded and are not model context. Keep BEMAC Forms, Malabon interviews and president material separate; these baseline interviews are not automatically post-use evaluations."
  );
}
