export interface Actor {
  id: string;
  name: string;
  username: string;
  role: "owner" | "editor";
  slot: number;
}
export interface TeamStatus {
  enabled: boolean;
  configured: boolean;
  memberLimit: number;
  actor: Actor | null;
  publicOrigin: string | null;
  allMembersMayApply: boolean;
  aiQuota: string;
}
export type JobStatus =
  | "draft"
  | "dry_run_ready"
  | "applying"
  | "needs_layout_review"
  | "complete"
  | "blocked"
  | "rejected"
  | "failed";
export type Operation =
  | {
      type: "replace_text";
      before: string;
      after: string;
      evidence: string;
      anchorId?: string;
      cell?: { row: number; column: number; table_anchor?: string };
    }
  | {
      type: "format_paragraph";
      expected_text: string;
      paragraph_style: Record<string, unknown>;
      text_style?: Record<string, unknown>;
      anchorId?: string;
      evidence: string;
    }
  | {
      type: "insert_figure";
      sourceId: string;
      anchorId: string;
      after_paragraph: string;
      caption: string;
      width_pt?: number;
      evidence: string;
    }
  | {
      type: "replace_figure";
      sourceId: string;
      figureId: string;
      caption: string;
      width_pt?: number;
      evidence: string;
    };
export interface Change {
  type: string;
  before?: string;
  after?: string;
  text?: string;
  paragraph_style?: Record<string, unknown>;
  text_style?: Record<string, unknown>;
  caption?: string;
  asset_id?: string;
  evidence: string;
}
export interface Job {
  sourceReviewMode?: "proposal_review";
  sourceBindings?: Record<string, string>;
  review?: ReviewPreview;
  id: string;
  request: string;
  status: JobStatus;
  target: "trial" | "maintained";
  documentId?: string;
  baseRevision?: string;
  operations: Operation[];
  sourceIds: string[];
  proposedChanges: Change[];
  blockers: string[];
  backup?: { id: string; url: string; retiredAt?: string };
  verification?: {
    native: boolean;
    layout: "pending" | "reviewed";
    revision: string;
  };
  createdAt: string;
  updatedAt: string;
  origin: string;
  createdBy?: Actor;
  approvedBy?: Actor;
  appliedBy?: Actor;
  reviewedBy?: Actor;
}
export interface ReviewPreview {
  hash: string;
  revision: string;
  status: "needs_review" | "approved" | "rejected";
  riskFlags: string[];
  requiresNotes: boolean;
  changes: {
    id: string;
    type: string;
    sectionPath: string[];
    before: string;
    after: string;
    removedText: string;
    formattingBefore?: Record<string, unknown>;
    formattingAfter?: Record<string, unknown>;
    evidence: string;
    riskFlags: string[];
    sourceId?: string;
    beforeFigureId?: string;
  }[];
  approvedAt?: string;
  notes?: string;
}
export interface Source {
  rowSelection?: { sheet: string; rows: number[]; notes: string };
  projectFile?: string;
  description?: string;
  provenance?: {
    kind: "team_notes" | "public_source";
    pageUrl?: string;
    assetUrl?: string;
    pageSha256?: string;
    title?: string;
    locator?: string;
    attribution?: string;
    reuse?: string;
    retrievedAt?: string;
  };
  uploadSha256?: string;
  originalSize?: number;
  extractionNotice?: string;
  preparedKind?: "text" | "image";
  preparedAt?: string;
  upstreamRevision?: string;
  reviewVersion?: string;
  uploadedBy?: Actor;
  mappedBy?: Actor;
  id: string;
  name: string;
  mime: string;
  sha256?: string;
  size?: number;
  image?: { width: number; height: number; mime: "image/png" | "image/jpeg" };
  origin: "upload" | "drive";
  driveId?: string;
  anchorId?: string;
  sectionId?: string;
  evidenceReviewed: boolean;
  status: string;
  createdAt: string;
}
export interface Message {
  guidanceFor?: string;
  guidance?: "delivering" | "steered" | "queued" | "following";
  task?: ManuscriptTask;
  contextSourceIds?: string[];
  workbench?: ManuscriptWorkbench;
  research?: { enabled: boolean; searches: number; openedPages: string[] };
  progress?: {
    phase: string;
    actions: {
      id: string;
      type: string;
      label: string;
      url?: string;
      status: "started" | "completed";
      at: string;
    }[];
  };
  attachmentIds?: string[];
  helperRole?:
    | "editor"
    | "equations"
    | "evidence"
    | "defense"
    | "questions"
    | "prototype";
  ai?: { model: string; effort: string };
  actor?: Actor;
  id: string;
  role: "user" | "assistant";
  text: string;
  status: "complete" | "running" | "failed" | "interrupted";
  createdAt: string;
  jobId?: string;
  sourceIds?: string[];
  anchorIds?: string[];
  sectionIds?: string[];
  scope?: "general" | "sections" | "paragraphs";
  resolvedSectionIds?: string[];
}
export type ManuscriptTask =
  | "conversation"
  | "revise"
  | "reconcile_sources"
  | "find_visuals"
  | "figure_brief";
export interface ManuscriptWorkbench {
  documentId?: string;
  sourceBindings: Record<string, string>;
  manuscriptRevision: string;
  findings: {
    statement: string;
    kind:
      | "team_report"
      | "measurement_report"
      | "seller_rating"
      | "calculation"
      | "proposal"
      | "conflict"
      | "unresolved";
    references: { sourceId: string; quote: string }[];
    sectionIds: string[];
    disposition:
      | "use_with_attribution"
      | "hold"
      | "superseded"
      | "needs_confirmation";
    rationale: string;
  }[];
  figures: {
    title: string;
    kind: "source_visual" | "human_edit";
    sectionId: string | null;
    anchorId: string | null;
    figureId: string | null;
    sourceId: string | null;
    pageUrl: string | null;
    imageUrl: string | null;
    locator: string;
    caption: string;
    attribution: string;
    reuse: string;
    instructions: string[];
    checks: string[];
    pageObserved?: boolean;
  }[];
  nextSteps: string[];
}
export interface Thread {
  contextSourceIds?: string[];
  purpose?: "manuscript" | "defense" | "questions" | "prototype";
  branchedFrom?: string;
  createdBy?: Actor;
  id: string;
  title: string;
  createdAt: string;
  messages: Message[];
  providerId?: string;
}
export interface Activity {
  actor?: Actor;
  id: string;
  at: string;
  kind: string;
  message: string;
  jobId?: string;
  origin: string;
  backupUrl?: string;
  changes?: Change[];
}
export interface Anchor {
  sectionId?: string;
  sectionPath?: string[];
  id: string;
  text: string;
  start: number;
  end: number;
  section: string;
  protected: boolean;
  location?: { row: number; column: number } | null;
}
export interface SectionNode {
  id: string;
  title: string;
  kind: "front_matter" | "chapter" | "section" | "subsection";
  level: number;
  parentId?: string;
  path: string[];
  start: number;
  end: number;
  readOnly: boolean;
  containsProtected: boolean;
  paragraphCount: number;
  children: string[];
}
export interface AccountUsage {
  status: "available" | "unavailable";
  checkedAt: string;
  message?: string;
  limits: {
    id: string;
    name?: string;
    reached: boolean;
    primary?: UsageWindow;
    secondary?: UsageWindow;
  }[];
}
export interface UsageWindow {
  usedPercent: number;
  windowDurationMins?: number;
  resetsAt?: number;
}
export interface Connections {
  codex: {
    status: string;
    model: string;
    effort: string;
    accountType?: string;
    plan?: string;
    error?: string;
  };
  google: { status: string; error?: string };
  checkedAt?: string;
}
export interface EquationItem {
  id: string;
  sectionId?: string;
  sectionPath?: string[];
  anchorId?: string;
  paragraphStart: number;
  paragraphEnd: number;
  equationType: "native" | "image";
  isStandalone: boolean;
  surroundingText: string;
  equationNumber?: string;
  label: string;
  symbolsAndVariables: { symbol: string; meaning: string; unit?: string }[];
  verifiedConstants?: { name: string; value: string; citation?: string }[];
  missingOrPendingParameters?: string[];
  readOnly: boolean;
  manualEditGuidance: string;
}
export interface EquationsSummary {
  totalCount: number;
  nativeCount: number;
  standaloneCount: number;
  inlineCount: number;
  capabilities: {
    nativeEquationEditing: "unsupported_by_google_docs_api";
    preservation: "enforced_by_readback_and_preservation_hash";
    supportedOperations: string[];
  };
  equations: EquationItem[];
}
export interface PrintReadiness {
  requiredChecks?: { id: string; label: string }[];
  referenceProfile?: unknown;
  estimateNotice?: string;
  submissionCutoff: string;
  requiredPhysicalCopies: number;
  baselinePagesPerCopy: number;
  totalPrintedPagesEstimate: number;
  currentRevisionId: string;
  formattingRules: {
    paperSize: string;
    margins: string;
    bodyTypography: string;
    lineSpacing: string;
    captions: string;
    headings: string;
  };
  scheduleTimeline: {
    date: string;
    timeWindow: string;
    milestone: string;
    actionRequired: string;
  }[];
  verificationChecklist: {
    category: string;
    items: {
      task: string;
      status: "verified" | "pending_manual_review";
      details: string;
    }[];
  }[];
  frozenPrintPdf?: {
    stale?: boolean;
    reviewedAt?: string;
    revisionId: string;
    sha256: string;
    pageCount: number;
    exportedAt: string;
    fileSizeBytes: number;
    url: string;
  };
}
export interface Envelope<T> {
  data: T;
  requestId: string;
}
export const API_BASE = "/api/v1";
