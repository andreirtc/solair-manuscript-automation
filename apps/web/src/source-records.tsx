import React, { useState, useEffect } from "react";
import type { Source } from "../../../packages/contracts/index";
import { api } from "./api";
import { Feedback, useAction } from "./ui";
interface Table {
  sheet: string;
  headerRow: number;
  columns: string[];
  rows: { row: number; values: string[] }[];
  totalRows: number;
  previewPartial: boolean;
}
export function SourceRecords({
  source,
  onSaved,
}: {
  source: Source;
  onSaved: (s: Source) => Promise<void>;
}) {
  const a = useAction(),
    [tables, setTables] = useState<Table[]>([]),
    [sheet, setSheet] = useState(source.rowSelection?.sheet || ""),
    [rows, setRows] = useState(source.rowSelection?.rows.join(",") || ""),
    [notes, setNotes] = useState(source.rowSelection?.notes || ""),
    [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    setTables([]);
  }, [source.id]);
  useEffect(() => {
    setSheet(source.rowSelection?.sheet || "");
    setRows(source.rowSelection?.rows.join(",") || "");
    setNotes(source.rowSelection?.notes || "");
    setConfirmed(false);
  }, [source.id, source.reviewVersion]);
  const table = tables.find((t) => t.sheet === sheet);
  return (
    <details
      className="source-records"
      onToggle={(e) => {
        if (e.currentTarget.open && !tables.length && !a.busy)
          void a.run(async () => {
            const r = await api<{ tables: Table[] }>(
              `/sources/${source.id}/table`,
            );
            setTables(r.tables);
            setSheet((value) => value || r.tables[0]?.sheet || "");
          });
      }}
    >
      <summary>Review eligible response records</summary>
      <p>
        CSV/XLSX rows are records, not automatically separate participants.
        Verify respondent-code labels, including any paired answers. Exclude
        test or otherwise ineligible entries. BEMAC Forms, Malabon interviews
        and the president’s material remain separate.
      </p>
      <Feedback action={a} />
      {tables.length > 0 && (
        <>
          <label>
            Sheet
            <select
              value={sheet}
              onChange={(e) => {
                setSheet(e.target.value);
                setConfirmed(false);
              }}
            >
              {tables.map((t) => (
                <option key={t.sheet}>{t.sheet}</option>
              ))}
            </select>
          </label>
          {table && (
            <>
              <small>
                {table.totalRows} nonempty data records · header at source row{" "}
                {table.headerRow}
                {table.previewPartial
                  ? " · preview shows first 100; inspect the downloaded original for later rows"
                  : ""}
              </small>
              <div
                className="answer-table"
                tabIndex={0}
                aria-label="Source records for eligibility review"
              >
                <table>
                  <thead>
                    <tr>
                      <th>Source row</th>
                      {table.columns.map((s, i) => (
                        <th key={i}>{s || `Column ${i + 1}`}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.map((r) => (
                      <tr key={r.row}>
                        <th>{r.row}</th>
                        {r.values.map((v, i) => (
                          <td key={i}>{v}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <label>
            Include these source row numbers
            <input
              value={rows}
              onChange={(e) => {
                setRows(e.target.value);
                setConfirmed(false);
              }}
              placeholder="For example: 2-9, 12"
            />
          </label>
          <label>
            Explain eligibility and respondent groups
            <textarea
              rows={3}
              maxLength={3000}
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                setConfirmed(false);
              }}
              placeholder="Identify the genuine respondent-code labels, paired records, exclusions and whether this is baseline interview or post-use data."
            />
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span>
              I checked these exact rows against the genuine records. All other
              rows must be excluded from AI analysis.
            </span>
          </label>
          <button
            type="button"
            className="button subtle"
            disabled={
              a.busy || !confirmed || notes.trim().length < 30 || !rows.trim()
            }
            onClick={() =>
              void a.run(async () => {
                const s = await api<Source>(
                  `/sources/${source.id}/row-selection`,
                  { sheet, rows, notes },
                );
                await onSaved(s);
                a.setNotice(
                  "Eligible records saved; other rows will not enter model context. Read the source and record its evidence review separately.",
                );
              })
            }
          >
            Save eligible records
          </button>
        </>
      )}
    </details>
  );
}
