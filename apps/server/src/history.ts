import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { Store } from "./store.ts";
/** Import only the existing independently verified receipt; never infer 51 detailed revision records. */
export function importHistory(store: Store, project: string) {
  const key = "historical-main-heading-flow-20261015";
  if (store.get("historical", key)) return;
  const read = (p: string) =>
    JSON.parse(readFileSync(join(project, p), "utf8"));
  const receiptPath =
    "outputs/SOLAIR-manuscript-formatting-receipt-2026-10-15.json";
  if (!existsSync(join(project, receiptPath))) return;
  try {
    const r = read(receiptPath),
      pdf = read("work/manuscript-automation/main-pdf-verification.json"),
      plan = read("work/manuscript-automation/main-format-plan.json");
    if (
      r.native_verification !== "passed" ||
      !r.only_seven_authorized_paragraph_styles_changed ||
      pdf.pages_with_raster_changes?.length !== 0 ||
      pdf.before_pages !== pdf.after_pages
    )
      return;
    const backupUrl = `https://docs.google.com/document/d/${r.backup_id}/edit`;
    const record = {
      id: key,
      at: "2026-10-15",
      origin: "historical_import",
      kind: "historical_verified_batch",
      message:
        "Imported earlier verified adviser-review work: seven headings received keep-with-next and keep-lines-together formatting. Text and native objects were unchanged; all 156 exported pages were pixel-identical. This is a historical receipt, not a fresh live verification.",
      backupUrl,
      changes: plan.changes,
      documentId: r.document_id,
      nativeVerified: true,
      layout: "historical_pixel_comparison",
    };
    store.put("historical", record);
    store.put("activity", record);
  } catch {
    /* Missing or inconsistent evidence is not converted into a success record. */
  }
}
/** Reflect the user's verified manual cleanup; never delete a Drive file from startup. */
export function importBackupCleanup(store: Store, project: string) {
  const path = join(
      project,
      "outputs/SOLAIR-trial-backup-cleanup-2026-10-16.json",
    ),
    key = "trial-backup-cleanup-20261016";
  if (!existsSync(path) || store.get("activity", key)) return;
  const report = JSON.parse(readFileSync(path, "utf8"));
  if (
    report.status !== "verified_complete" ||
    report.removed_count !== 4 ||
    !Array.isArray(report.remove)
  )
    return;
  const ids = new Set(
    report.remove
      .filter((v: any) =>
        /^SOLAIR app trial backup [0-9a-f-]{36} 2026-10-/.test(v.title),
      )
      .map((v: any) => v.id),
  );
  for (const backup of store.list("backup"))
    if (ids.has(backup.id))
      store.put("backup", {
        ...backup,
        retiredAt: "2026-10-16",
        retirementReason:
          "User-requested cleanup of obsolete developer trial backup.",
      });
  for (const job of store.list("job"))
    if (ids.has(job.backup?.id) && job.status === "complete")
      store.put("job", {
        ...job,
        backup: { ...job.backup, retiredAt: "2026-10-16" },
      });
  store.put("activity", {
    id: key,
    kind: "backup_cleanup",
    at: "2026-10-16",
    origin: "user_requested_drive_cleanup",
    message:
      "Removed four obsolete developer trial backups after explicit user cleanup request; five latest/pending-review backups retained. Original, adviser-review and trial manuscript untouched.",
  });
}
