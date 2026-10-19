import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Store, id, now } from "./store.ts";
import { AppError } from "./errors.ts";
import { sourceHash } from "./source-snapshots.ts";
import { inspectPdf, downloadPdf } from "./pdf.ts";
import type { Google } from "./manuscript.ts";
import { PDFDocument } from "pdf-lib";
export const PRINT_CHECKS = [
  {
    id: "scope",
    label:
      "Only the intended manuscript pages are included; school-template pages and synthetic test figures are excluded.",
  },
  {
    id: "facts",
    label:
      "Claims, equations, symbols, units and citations match reviewed evidence.",
  },
  {
    id: "layout",
    label:
      "Margins, fonts, figures, captions, tables and page breaks were inspected in this PDF.",
  },
  {
    id: "pagination",
    label: "Contents, figure/table lists and page numbering match this PDF.",
  },
  {
    id: "final",
    label: "The team has approved this exact revision for printing.",
  },
];
export interface PrintCandidate {
  sourceCandidateId?: string;
  sourcePageRange?: { from: number; to: number };
  id: string;
  schemaVersion: 2;
  documentId: string;
  tabId: string;
  revisionId: string;
  sha256: string;
  pageCount: number;
  letterPages: number;
  fileSizeBytes: number;
  exportedAt: string;
  url: string;
  reviewedAt?: string;
  reviewedBy?: unknown;
  notes?: string;
  checks?: string[];
}
export class Printing {
  constructor(
    public store: Store,
    public google: Google,
    public target: { document_id: string; tab_id: string },
    public revision: () => Promise<string>,
  ) {}
  bytes(candidate: PrintCandidate) {
    if (
      candidate.schemaVersion !== 2 ||
      candidate.documentId !== this.target.document_id ||
      candidate.tabId !== this.target.tab_id
    )
      throw new AppError(
        "PRINT_REVIEW_REQUIRED",
        "Prepare and review a fresh PDF. The older print record has no verified provenance.",
        409,
      );
    let bytes: Buffer;
    try {
      bytes = readFileSync(
        join(this.store.dir, "pdf", "print-" + candidate.id + ".pdf"),
      );
    } catch {
      throw new AppError(
        "PRINT_FILE_MISSING",
        "The reviewed PDF is unavailable. Prepare a fresh export.",
        409,
      );
    }
    if (sourceHash(bytes) !== candidate.sha256)
      throw new AppError(
        "PRINT_FILE_CHANGED",
        "The PDF changed after export. Prepare and review a fresh export.",
        409,
      );
    return bytes;
  }
  current() {
    const frozen = this.store.get<PrintCandidate & { candidateId: string }>(
      "frozen_print_pdf",
      "current",
    );
    if (!frozen?.reviewedAt || frozen.schemaVersion !== 2) return;
    try {
      this.bytes({ ...frozen, id: frozen.candidateId });
      return frozen;
    } catch {
      return;
    }
  }
  async prepare() {
    const revisionId = await this.revision(),
      bytes = await downloadPdf(this.google, this.target.document_id),
      info = await inspectPdf(bytes);
    if ((await this.revision()) !== revisionId)
      throw new AppError(
        "REVISION_CONFLICT",
        "The manuscript changed during export. Prepare a fresh PDF.",
        409,
      );
    const key = id(),
      candidate: PrintCandidate = {
        id: key,
        schemaVersion: 2,
        documentId: this.target.document_id,
        tabId: this.target.tab_id,
        revisionId,
        sha256: sourceHash(bytes),
        ...info,
        fileSizeBytes: bytes.length,
        exportedAt: now(),
        url: `/api/v1/manuscript/print-candidates/${key}/pdf`,
      };
    mkdirSync(join(this.store.dir, "pdf"), { recursive: true, mode: 0o700 });
    writeFileSync(join(this.store.dir, "pdf", "print-" + key + ".pdf"), bytes, {
      mode: 0o600,
      flag: "wx",
    });
    this.store.put("print_candidate", candidate);
    this.store.activity(
      "print_pdf_prepared",
      "Prepared a revision-bound PDF for review; it has not been approved for printing.",
    );
    return candidate;
  }
  async freeze(
    candidateId: string,
    revision: string,
    checks: string[],
    notes: string,
  ) {
    const candidate = this.store.get<PrintCandidate>(
      "print_candidate",
      candidateId,
    );
    if (!candidate || candidate.revisionId !== revision)
      throw new AppError(
        "PRINT_REVIEW_REQUIRED",
        "Prepare and inspect the exact revision first.",
        409,
      );
    if (
      checks.length !== PRINT_CHECKS.length ||
      new Set(checks).size !== checks.length ||
      PRINT_CHECKS.some((c) => !checks.includes(c.id)) ||
      notes.trim().length < 30
    )
      throw new AppError(
        "PRINT_REVIEW_REQUIRED",
        "Read the PDF, acknowledge every print check and add meaningful review notes (at least 30 characters).",
        409,
      );
    this.bytes(candidate);
    if ((await this.revision()) !== revision)
      throw new AppError(
        "REVISION_CONFLICT",
        "The manuscript changed after this PDF was prepared. Prepare and review a fresh export.",
        409,
      );
    this.bytes(candidate);
    const approved = {
      ...candidate,
      reviewedAt: now(),
      reviewedBy: this.store.actor(),
      checks,
      notes: notes.trim(),
    };
    this.store.put("print_approval", approved);
    this.store.put("frozen_print_pdf", {
      ...approved,
      id: "current",
      candidateId: candidate.id,
    });
    this.store.activity(
      "print_pdf_frozen",
      "Recorded deliberate approval of the exact frozen PDF. Later manuscript edits do not change its bytes.",
    );
    return { ...approved, frozen: true, url: "/api/v1/manuscript/print-pdf" };
  }
  async extract(candidateId: string, from: number, to: number) {
    const original = this.store.get<PrintCandidate>(
      "print_candidate",
      candidateId,
    );
    if (!original)
      throw new AppError(
        "NOT_FOUND",
        "Prepare a PDF before selecting manuscript pages.",
        404,
      );
    if (
      !Number.isInteger(from) ||
      !Number.isInteger(to) ||
      from < 1 ||
      to < from ||
      to > original.pageCount
    )
      throw new AppError(
        "INVALID_PAGE_RANGE",
        "Choose a valid inclusive range from the prepared PDF.",
      );
    if ((await this.revision()) !== original.revisionId)
      throw new AppError(
        "REVISION_CONFLICT",
        "The manuscript changed. Prepare a fresh export before selecting pages.",
        409,
      );
    const source = await PDFDocument.load(this.bytes(original)),
      target = await PDFDocument.create();
    const pages = await target.copyPages(
      source,
      Array.from({ length: to - from + 1 }, (_, i) => from - 1 + i),
    );
    pages.forEach((p) => target.addPage(p));
    const bytes = Buffer.from(await target.save()),
      info = await inspectPdf(bytes),
      key = id();
    const candidate: PrintCandidate = {
      ...original,
      ...info,
      id: key,
      sourceCandidateId: original.id,
      sourcePageRange: { from, to },
      sha256: sourceHash(bytes),
      fileSizeBytes: bytes.length,
      exportedAt: now(),
      url: `/api/v1/manuscript/print-candidates/${key}/pdf`,
    };
    if ((await this.revision()) !== original.revisionId)
      throw new AppError(
        "REVISION_CONFLICT",
        "The manuscript changed while pages were selected. Prepare a fresh export.",
        409,
      );
    writeFileSync(join(this.store.dir, "pdf", "print-" + key + ".pdf"), bytes, {
      mode: 0o600,
      flag: "wx",
    });
    this.store.put("print_candidate", candidate);
    this.store.activity(
      "print_pages_selected",
      `Prepared reviewed page range ${from}–${to} for PDF inspection; it is not yet approved for print.`,
    );
    return candidate;
  }
  frozenBytes() {
    const current = this.store.get<any>("frozen_print_pdf", "current");
    if (!current?.reviewedAt || current.schemaVersion !== 2)
      throw new AppError(
        "PRINT_REVIEW_REQUIRED",
        "No reviewed print PDF is available. Prepare and review one first.",
        409,
      );
    return this.bytes({ ...current, id: current.candidateId });
  }
}
