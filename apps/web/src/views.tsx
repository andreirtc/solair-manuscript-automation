import React, { useEffect, useState, lazy, Suspense } from "react";
import type {
  Job,
  Source,
  SectionNode,
  EquationsSummary,
  PrintReadiness,
  TeamStatus,
  Actor,
  Connections,
  Activity,
} from "../../../packages/contracts/index";
import { api } from "./api";
import { navigate } from "./main";
import { ScopePicker } from "./workspace";
import { UsageMeter } from "./account-usage";
import { SourceRecords } from "./source-records";
import {
  Icon,
  Notice,
  Empty,
  Feedback,
  useAction,
  useResource,
  PageHead,
  Badge,
  DateLabel,
} from "./ui";
const SourceText = lazy(() =>
  import("./answer").then((m) => ({ default: m.Answer })),
);
export function Review({
  jobs,
  refreshJobs,
  activeTarget = "trial",
}: {
  activeTarget?: "trial" | "maintained";
  jobs: ReturnType<typeof useResource<Job[]>>;
  refreshJobs: () => Promise<void>;
}) {
  const [selected, setSelected] = useState(
      new URLSearchParams(location.search).get("job") || "",
    ),
    [job, setJob] = useState<Job>(),
    [acks, setAcks] = useState<string[]>([]),
    [notes, setNotes] = useState(""),
    [reason, setReason] = useState(""),
    [pdf, setPdf] = useState<{ revision: string; url?: string }>(),
    [layoutNotes, setLayoutNotes] = useState(""),
    a = useAction();
  useEffect(() => {
    if (selected)
      void a.run(async () => {
        setJob(await api<Job>("/jobs/" + selected));
        setPdf(undefined);
      });
  }, [selected]);
  useEffect(() => {
    setAcks([]);
    setNotes("");
  }, [job?.review?.hash]);
  const otherTarget = Boolean(job && job.target !== activeTarget);
  const candidates =
    jobs.data?.filter(
      (j) =>
        j.target === activeTarget &&
        j.status !== "complete" &&
        j.status !== "rejected",
    ) || [];
  async function mutate(
    path: string,
    body: unknown,
    headers?: Record<string, string>,
  ) {
    const r = await api<Job>("/jobs/" + job!.id + path, body, "POST", headers);
    setJob(r);
    await refreshJobs();
  }
  return (
    <>
      <PageHead
        title="A change worth reading."
        description="See exactly what will change, why it changes, and what stays protected."
      />
      <Feedback action={a} />
      {jobs.error && (
        <Notice error>
          {jobs.error}
          <button onClick={() => void jobs.reload()}>Retry</button>
        </Notice>
      )}
      <div className="review-layout">
        <aside className="job-list">
          <h2>Proposals</h2>
          {!candidates.length && (
            <p>No pending proposals. Start a revision in chat.</p>
          )}
          {candidates.map((j) => (
            <button
              key={j.id}
              disabled={a.busy}
              className={selected === j.id ? "selected" : ""}
              onClick={() => {
                setSelected(j.id);
                setJob(undefined);
              }}
            >
              <span>{j.request}</span>
              <Badge value={j.status} />
              <DateLabel value={j.updatedAt} />
            </button>
          ))}
        </aside>
        <section className="review-detail">
          {!job ? (
            <Empty
              icon="review"
              title={a.busy ? "Loading proposal…" : "Choose a proposal to read"}
            >
              <p>Nothing is applied from this list automatically.</p>
              <button
                className="button subtle"
                onClick={() => navigate("/app")}
              >
                Go to chat <Icon name="arrow" />
              </button>
            </Empty>
          ) : (
            <>
              {otherTarget && (
                <Notice>
                  This proposal belongs to{" "}
                  {job.target === "trial"
                    ? "the test duplicate"
                    : "another manuscript"}
                  . It is read-only here; create a fresh proposal for the active
                  document.
                </Notice>
              )}
              <header className="proposal-heading">
                <Badge value={job.status} />
                <h2>{job.request}</h2>
                <p>
                  Requested by {job.createdBy?.name || "a previous session"} ·{" "}
                  <DateLabel value={job.createdAt} />
                </p>
              </header>
              {job.origin.includes("fixture") ||
              /synthetic|acceptance|fixture/i.test(job.request) ? (
                <Notice>
                  Developer test fixture. This proposal is not research evidence
                  or a final submission revision.
                </Notice>
              ) : null}
              {job.blockers.map((b, i) => (
                <Notice error key={i}>
                  {b}
                </Notice>
              ))}
              {["draft", "blocked", "failed"].includes(job.status) && (
                <>
                  <p>
                    Validate this proposal against the current document to
                    generate an exact comparison. A dry run does not write to
                    Google Docs.
                  </p>
                  <button
                    className="button primary"
                    disabled={a.busy || otherTarget}
                    onClick={() => void a.run(() => mutate("/dry-run", {}))}
                  >
                    {a.busy ? "Validating…" : "Validate & preview"}
                    <Icon name="arrow" />
                  </button>
                </>
              )}
              {job.review && (
                <>
                  <div className="review-summary">
                    <b>
                      {job.review.changes.length} proposed change
                      {job.review.changes.length === 1 ? "" : "s"}
                    </b>
                    <span>Read each comparison before checking it.</span>
                  </div>
                  {job.review.riskFlags.length > 0 && (
                    <Notice>
                      Needs careful review:{" "}
                      {job.review.riskFlags.join(" · ").replaceAll("_", " ")}
                    </Notice>
                  )}
                  {job.review.changes.map((c, i) => (
                    <article className="change-block" key={c.id}>
                      <header>
                        <span className="change-number">{i + 1}</span>
                        <div>
                          <h3>
                            {c.sectionPath.join(" / ") || "Manuscript change"}
                          </h3>
                          <Badge value={c.type} />
                        </div>
                      </header>
                      {c.sourceId && (
                        <div className="figure-compare">
                          {c.beforeFigureId && (
                            <div>
                              <b>Current figure</b>
                              <img
                                src={
                                  "/api/v1/manuscript/figures/" +
                                  c.beforeFigureId +
                                  "/image"
                                }
                                alt="Current manuscript figure"
                              />
                            </div>
                          )}
                          <div>
                            <b>Proposed source</b>
                            <img
                              src={"/api/v1/sources/" + c.sourceId + "/image"}
                              alt="Proposed figure from reviewed source"
                            />
                          </div>
                        </div>
                      )}
                      <div className="comparison">
                        <section>
                          <h4>Before</h4>
                          <p>{c.before || "(No previous text)"}</p>
                          {c.formattingBefore && (
                            <pre>
                              {JSON.stringify(c.formattingBefore, null, 2)}
                            </pre>
                          )}
                        </section>
                        <section>
                          <h4>Proposed</h4>
                          <p>{c.after || "(Removed)"}</p>
                          {c.formattingAfter && (
                            <pre>
                              {JSON.stringify(c.formattingAfter, null, 2)}
                            </pre>
                          )}
                        </section>
                      </div>
                      {c.removedText && (
                        <details className="removed">
                          <summary>Text being removed</summary>
                          <p>{c.removedText}</p>
                        </details>
                      )}
                      <p className="change-evidence">
                        <b>Reason & evidence</b>
                        {c.evidence}
                      </p>
                      {job.status === "dry_run_ready" &&
                        job.review?.status !== "approved" && (
                          <label className="check-row acknowledge">
                            <input
                              type="checkbox"
                              checked={acks.includes(c.id)}
                              onChange={(e) =>
                                setAcks(
                                  e.target.checked
                                    ? [...acks, c.id]
                                    : acks.filter((id) => id !== c.id),
                                )
                              }
                            />
                            <span>
                              I read this change, including its removals and
                              supporting evidence.
                            </span>
                          </label>
                        )}
                    </article>
                  ))}
                  {job.status === "dry_run_ready" &&
                    job.review.status !== "approved" && (
                      <div className="review-actions">
                        <label>
                          {job.review.requiresNotes
                            ? "Explain your review of the important changes (at least 30 characters)"
                            : "Review notes (optional)"}
                          <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            maxLength={3000}
                            rows={3}
                            placeholder="Record what you checked and why the revision is appropriate."
                          />
                        </label>
                        <button
                          className="button primary"
                          disabled={
                            a.busy ||
                            acks.length !== job.review.changes.length ||
                            (job.review.requiresNotes &&
                              notes.trim().length < 30)
                          }
                          onClick={() =>
                            void a.run(() =>
                              mutate("/review", {
                                previewHash: job.review!.hash,
                                acknowledgedChangeIds: acks,
                                notes,
                              }),
                            )
                          }
                        >
                          Approve this exact proposal
                          <Icon name="check" />
                        </button>
                        <small>
                          Approval records your review. Applying the update is a
                          separate action.
                        </small>
                      </div>
                    )}
                  {job.status === "dry_run_ready" &&
                    job.review.status === "approved" && (
                      <div className="review-actions">
                        <Notice>
                          Proposal approved. The server will check the current
                          revision, create a backup, and verify preservation
                          before recording success.
                        </Notice>
                        <button
                          className="button primary"
                          disabled={a.busy || otherTarget}
                          onClick={() =>
                            void a.run(() =>
                              mutate(
                                "/apply",
                                { baseRevision: job.baseRevision },
                                {
                                  "Idempotency-Key":
                                    "apply-" +
                                    job.id +
                                    "-" +
                                    job.review!.hash.slice(0, 16),
                                },
                              ),
                            )
                          }
                        >
                          {a.busy
                            ? "Applying & verifying…"
                            : job.target === "maintained"
                              ? "Apply approved update to adviser manuscript"
                              : "Apply approved update to test duplicate"}
                          <Icon name="arrow" />
                        </button>
                      </div>
                    )}
                </>
              )}
              {job.backup?.retiredAt && (
                <p className="muted">
                  This completed trial’s old backup was retired during your
                  requested cleanup. The verification receipt remains in
                  History.
                </p>
              )}
              {job.backup && !job.backup.retiredAt && (
                <a
                  className="inline-link"
                  href={job.backup.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open pre-update backup <Icon name="link" />
                </a>
              )}
              {["needs_layout_review", "complete"].includes(job.status) && (
                <div className="review-actions">
                  <h3>Check the printed layout</h3>
                  <p>
                    Native checks protect objects and formatting. Inspect the
                    exported PDF for page breaks, equations, tables, figures and
                    captions.
                  </p>
                  <button
                    className="button subtle"
                    disabled={a.busy || otherTarget}
                    onClick={() =>
                      void a.run(async () => {
                        const p = await api<any>(
                          "/jobs/" + job.id + "/export-pdf",
                          {},
                        );
                        setPdf({
                          revision: p.revision,
                          url: p.url || "/api/v1/jobs/" + job.id + "/pdf",
                        });
                        a.setNotice(
                          "PDF exported. Open it and inspect the affected pages before recording your review.",
                        );
                      })
                    }
                  >
                    Export current update PDF <Icon name="file" />
                  </button>
                  {pdf && (
                    <>
                      <a
                        className="button subtle"
                        href={pdf.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Read exported PDF <Icon name="link" />
                      </a>
                      <label>
                        What did you check in the PDF?
                        <textarea
                          rows={3}
                          value={layoutNotes}
                          onChange={(e) => setLayoutNotes(e.target.value)}
                          maxLength={3000}
                        />
                      </label>
                      <button
                        className="button primary"
                        disabled={a.busy || layoutNotes.trim().length < 10}
                        onClick={() =>
                          void a.run(() =>
                            mutate("/layout-review", {
                              revision: pdf.revision,
                              notes: layoutNotes,
                              reviewer: "user",
                            }),
                          )
                        }
                      >
                        Record my layout review <Icon name="check" />
                      </button>
                    </>
                  )}
                </div>
              )}
              {![
                "applying",
                "complete",
                "needs_layout_review",
                "rejected",
              ].includes(job.status) && (
                <details className="reject">
                  <summary>Reject this proposal</summary>
                  <label>
                    Reason
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      maxLength={3000}
                      rows={2}
                    />
                  </label>
                  <button
                    className="button danger"
                    disabled={a.busy || reason.trim().length < 5}
                    onClick={() =>
                      void a.run(() => mutate("/reject", { reason }))
                    }
                  >
                    Reject proposal
                  </button>
                </details>
              )}
            </>
          )}
        </section>
      </div>
    </>
  );
}
export function History() {
  const activity = useResource<Activity[]>("/activity"),
    jobs = useResource<Job[]>("/jobs"),
    backups = useResource<any[]>("/backups"),
    [tab, setTab] = useState("updates");
  return (
    <>
      <PageHead
        title="Every revision has a story."
        description="Trace requests, approvals, verification and the backups made along the way."
      />
      <div className="tabs" role="tablist" aria-label="History views">
        {["updates", "activity", "backups"].map((t) => (
          <button
            role="tab"
            aria-selected={tab === t}
            key={t}
            onClick={() => setTab(t)}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      {[activity, jobs, backups]
        .filter((r) => r.error)
        .map((r, i) => (
          <Notice error key={i}>
            {r.error}
            <button onClick={() => void r.reload()}>Retry</button>
          </Notice>
        ))}
      {tab === "updates" ? (
        jobs.data?.length ? (
          <div className="history-list">
            {jobs.data.map((j) => (
              <button
                key={j.id}
                onClick={() => navigate("/app/review?job=" + j.id)}
              >
                <Icon name="review" />
                <div>
                  <b>{j.request}</b>
                  <span>
                    {j.target === "maintained"
                      ? "Adviser manuscript"
                      : "Test duplicate"}{" "}
                    · {j.createdBy?.name || "Previous session"} ·{" "}
                    <DateLabel value={j.updatedAt} />
                  </span>
                </div>
                <Badge value={j.status} />
                <Icon name="chevron" />
              </button>
            ))}
          </div>
        ) : (
          <Empty title={jobs.loading ? "Loading updates…" : "No updates yet"} />
        )
      ) : tab === "activity" ? (
        activity.data?.length ? (
          <ol className="timeline">
            {activity.data.map((v) => (
              <li key={v.id}>
                <span className="timeline-dot" />
                <div>
                  <p>{v.message}</p>
                  <small>
                    {v.actor?.name || v.origin} · <DateLabel value={v.at} />
                  </small>
                  {v.jobId && (
                    <button
                      className="text-button"
                      onClick={() => navigate("/app/review?job=" + v.jobId)}
                    >
                      Read proposal <Icon name="arrow" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <Empty
            title={activity.loading ? "Loading activity…" : "No activity yet"}
          />
        )
      ) : backups.data?.length ? (
        <div className="history-list">
          {backups.data.map((b, i) => (
            <a
              key={b.id || i}
              href={b.retiredAt ? undefined : b.url || b.backup?.url}
              aria-disabled={!!b.retiredAt}
              className={b.retiredAt ? "retired-backup" : undefined}
              target="_blank"
              rel="noreferrer"
            >
              <Icon name="shield" />
              <div>
                <b>{b.name || "Pre-update manuscript backup"}</b>
                <span>
                  {b.retiredAt
                    ? "Retired during your trial-backup cleanup"
                    : b.createdAt && <DateLabel value={b.createdAt} />}
                </span>
              </div>
              <Icon name="link" />
            </a>
          ))}
        </div>
      ) : (
        <Empty
          title={
            backups.loading
              ? "Loading backups…"
              : "Backups appear when an update is applied"
          }
        >
          <p>Proposals and dry runs do not require a manuscript write.</p>
        </Empty>
      )}
    </>
  );
}
export function Sources({ sections }: { sections: SectionNode[] }) {
  const sources = useResource<Source[]>("/sources"),
    a = useAction(),
    [selected, setSelected] = useState<Source>(),
    [section, setSection] = useState(""),
    [text, setText] = useState(""),
    [description, setDescription] = useState(""),
    [pageUrl, setPageUrl] = useState(""),
    [imageUrl, setImageUrl] = useState(""),
    [inspected, setInspected] = useState(false);
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("source");
    const source = sources.data?.find((s) => s.id === id);
    if (
      source &&
      (selected?.id !== source.id ||
        selected.reviewVersion !== source.reviewVersion)
    )
      setSelected(source);
  }, [sources.data]);
  useEffect(() => {
    const suggestion =
      new URLSearchParams(location.search).get("section") || "";
    setSection(
      selected?.sectionId ||
        (sections.some((s) => s.id === suggestion && !s.readOnly)
          ? suggestion
          : ""),
    );
    setDescription(selected?.description || "");
    setText("");
    setInspected(false);
  }, [selected?.id, selected?.reviewVersion]);
  async function prepare(s: Source) {
    const p = await api<Source>(
      "/sources/" +
        s.id +
        (s.mime.startsWith("image/") ? "/prepare-image" : "/prepare-text"),
      {},
    );
    setSelected(p);
    await sources.reload();
  }
  return (
    <>
      <PageHead
        title="Give revisions solid ground."
        description="Bring drafts, findings, data and original figures together. Inspect each source before it supports a manuscript change."
      />
      <Feedback action={a} />
      {sources.error && <Notice error>{sources.error}</Notice>}
      <div className="actions source-actions">
        <label className="button primary">
          <Icon name="plus" />
          Upload source
          <input
            className="sr-only"
            type="file"
            multiple
            accept=".pdf,.docx,.xlsx,.txt,.md,.csv,.json,.png,.jpg,.jpeg"
            disabled={a.busy}
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              if (files.length)
                void a.run(async () => {
                  if (
                    files.length > 12 ||
                    files.some((f) => f.size > 20 * 1024 * 1024)
                  )
                    throw new Error(
                      "Choose at most 12 files, each 20 MB or smaller. Nothing was uploaded.",
                    );
                  for (let i = 0; i < files.length; i++) {
                    a.setNotice(`Reading file ${i + 1} of ${files.length}…`);
                    const fd = new FormData();
                    fd.append("file", files[i]);
                    setSelected(await api<Source>("/sources", fd));
                  }
                  await sources.reload();
                  a.setNotice(
                    `${files.length} source files saved. Review is pending; use Consolidate & discuss to organize their meaning.`,
                  );
                });
              e.target.value = "";
            }}
          />
        </label>
        <button
          className="button subtle"
          disabled={a.busy}
          onClick={() =>
            void a.run(async () => {
              const r = await api<any>("/sources/scan-drive", {});
              await sources.reload();
              a.setNotice(
                `${r.added} new sources from ${r.scanned} folder items.${r.partial ? " The folder listing may be partial; review the remaining files in Drive." : ""}`,
              );
            })
          }
        >
          <Icon name="refresh" />
          Scan Drive inbox
        </button>
        <small>Up to 12 files · 20 MB each</small>
      </div>
      <details className="public-source-intake">
        <summary>Collect a public source or original figure</summary>
        <p>
          Save an original publisher page/PDF, or a PNG/JPEG linked from it.
          Attribution and reuse still need your review. Private Google Docs use
          the Drive inbox or an uploaded export.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void a.run(async () => {
              const s = await api<Source>("/sources/import-web", {
                pageUrl,
                ...(imageUrl.trim() ? { imageUrl } : {}),
              });
              setSelected(s);
              setPageUrl("");
              setImageUrl("");
              await sources.reload();
              a.setNotice(
                "Original source saved privately. Inspect it before recording evidence review.",
              );
            });
          }}
        >
          <label>
            Original source page or PDF URL
            <input
              type="url"
              value={pageUrl}
              onChange={(e) => setPageUrl(e.target.value)}
              required
              placeholder="https://publisher.example/original-study"
            />
          </label>
          <label>
            Exact image URL (optional)
            <input
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://publisher.example/figure.png"
            />
          </label>
          <button
            className="button subtle"
            disabled={a.busy || !pageUrl.trim()}
          >
            {a.busy ? "Collecting source…" : "Collect original source"}
          </button>
        </form>
      </details>
      <p className="muted">
        Markdown is useful for drafts, headings, notes and tables. Keep the
        original PDF/DOCX or Google Doc for figures, equations and exact
        formatting; exported text does not replace the native school template.
      </p>
      <div className="source-layout">
        <div className="source-list">
          {!sources.data?.length && (
            <Empty
              icon="sources"
              title={
                sources.loading
                  ? "Loading sources…"
                  : "Your evidence starts here"
              }
            >
              <p>Add adviser feedback, research notes, data or figures.</p>
            </Empty>
          )}
          {sources.data?.map((s) => (
            <button
              key={s.id}
              disabled={a.busy}
              className={selected?.id === s.id ? "selected" : ""}
              onClick={() => setSelected(s)}
            >
              <Icon name={s.image ? "layout" : "file"} />
              <div>
                <b>{s.name}</b>
                <small>
                  {s.origin} · {s.status.replaceAll("_", " ")}
                </small>
              </div>
              {s.evidenceReviewed && <Icon name="check" />}
            </button>
          ))}
        </div>
        <section className="source-detail">
          {selected ? (
            <>
              <h2>{selected.name}</h2>
              <Badge value={selected.status} />
              {/\.(csv|tsv|xlsx)$/i.test(selected.name) && (
                <SourceRecords
                  source={selected}
                  onSaved={async (s) => {
                    setSelected(s);
                    await sources.reload();
                  }}
                />
              )}
              <a
                className="button subtle"
                href={`/api/v1/sources/${selected.id}/original`}
                download
              >
                Download saved original <Icon name="file" />
              </a>
              {selected.provenance && (
                <dl className="source-provenance">
                  <div>
                    <dt>Source basis</dt>
                    <dd>
                      {selected.provenance.kind === "team_notes"
                        ? "Team-supplied compilation; claims retain their reported status"
                        : "Original public-source snapshot"}
                    </dd>
                  </div>
                  {selected.provenance.pageUrl && (
                    <div>
                      <dt>Original page</dt>
                      <dd>
                        <a
                          href={selected.provenance.pageUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {selected.provenance.title ||
                            selected.provenance.pageUrl}
                        </a>
                      </dd>
                    </div>
                  )}
                  {selected.provenance.locator && (
                    <div>
                      <dt>Figure / page</dt>
                      <dd>{selected.provenance.locator}</dd>
                    </div>
                  )}
                  {selected.provenance.attribution && (
                    <div>
                      <dt>Attribution</dt>
                      <dd>{selected.provenance.attribution}</dd>
                    </div>
                  )}
                  {selected.provenance.reuse && (
                    <div>
                      <dt>Reuse / permission</dt>
                      <dd>{selected.provenance.reuse}</dd>
                    </div>
                  )}
                </dl>
              )}
              {selected.origin === "drive" && !selected.preparedAt && (
                <button
                  className="button subtle"
                  disabled={a.busy}
                  onClick={() => void a.run(() => prepare(selected))}
                >
                  Prepare private snapshot <Icon name="arrow" />
                </button>
              )}
              {selected.image ? (
                <img
                  className="source-image"
                  key={selected.id}
                  src={"/api/v1/sources/" + selected.id + "/image"}
                  alt={selected.name}
                  onLoad={() => setInspected(true)}
                />
              ) : (
                <>
                  <button
                    className="button subtle"
                    disabled={a.busy}
                    onClick={() =>
                      void a.run(async () => {
                        const r = await api<{ text: string }>(
                          "/sources/" + selected.id + "/text",
                        );
                        setText(r.text);
                        setInspected(true);
                      })
                    }
                  >
                    Read source text <Icon name="file" />
                  </button>
                  {text && (
                    <>
                      <div className="source-readable">
                        <Suspense fallback={<p>Preparing readable preview…</p>}>
                          <SourceText text={text} />
                        </Suspense>
                      </div>
                      <details>
                        <summary>Exact extracted text</summary>
                        <pre className="source-text">{text}</pre>
                      </details>
                    </>
                  )}
                  <p className="muted">
                    {selected.extractionNotice ||
                      "Uploaded PDF, DOCX and XLSX files get a readable snapshot. Figures, equations and scanned pages still need comparison with the original. Drive binaries need an uploaded readable export."}
                  </p>
                </>
              )}
              <label>
                What this source shows or establishes
                <textarea
                  value={description}
                  maxLength={3000}
                  rows={3}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="For a figure, describe the actual content and intended meaning. Note estimates, proposals and unresolved claims."
                />
              </label>
              <label>
                Relevant chapter, section or subsection
                <select
                  value={section}
                  onChange={(e) => setSection(e.target.value)}
                >
                  <option value="">Choose where this evidence belongs</option>
                  {sections
                    .filter((s) => !s.readOnly)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.path.join(" / ")}
                      </option>
                    ))}
                </select>
              </label>
              <button
                className="button subtle"
                disabled={a.busy || !section}
                onClick={() =>
                  void a.run(async () => {
                    setSelected(
                      await api<Source>(
                        "/sources/" + selected.id,
                        {
                          sectionId: section,
                          evidenceReviewed: false,
                          description,
                        },
                        "PATCH",
                      ),
                    );
                    await sources.reload();
                    a.setNotice(
                      "Section saved. Evidence review is still pending.",
                    );
                  })
                }
              >
                Save section mapping
              </button>
              <label className="check-row acknowledge">
                <input
                  type="checkbox"
                  checked={selected.evidenceReviewed}
                  disabled={a.busy || !section || !inspected}
                  onChange={(e) => {
                    const reviewed = e.target.checked;
                    void a.run(async () => {
                      setSelected(
                        await api<Source>(
                          "/sources/" + selected.id,
                          {
                            sectionId: section,
                            evidenceReviewed: reviewed,
                            description,
                          },
                          "PATCH",
                        ),
                      );
                      await sources.reload();
                      a.setNotice(
                        reviewed
                          ? "Your source review was recorded. It can now support a proposal."
                          : "Source review removed. Existing proposals must be validated again.",
                      );
                    });
                  }}
                />
                <span>
                  I inspected this exact source and verified that it is
                  appropriate evidence for the selected section.
                </span>
              </label>
              <small>
                Reading the preview enables review. The checkbox records your
                own judgment; the app cannot verify a source’s scientific truth
                for you.
              </small>
            </>
          ) : (
            <Empty title="Choose a source to inspect" icon="sources" />
          )}
        </section>
      </div>
    </>
  );
}
export function Equations({ documentId }: { documentId?: string }) {
  const r = useResource<EquationsSummary>("/manuscript/equations");
  return (
    <>
      <PageHead
        title="Make the hard parts explainable."
        description="Review equation context, assumptions, units and the evidence behind every substitution."
      />
      {r.error && <Notice error>{r.error}</Notice>}
      <Notice>
        Native equations are preserved. Google Docs’ update API does not support
        editing their formulas. Revise a formula in Google Docs, then refresh
        and inspect the PDF; chat can help review your supplied formula and its
        explanation.
      </Notice>
      <div className="equation-intro">
        <p>
          {r.data
            ? `${r.data.nativeCount} native equation objects found in the manuscript.`
            : "Loading equation inventory…"}{" "}
          Inventory is not a scientific correctness check.
        </p>
        {documentId && (
          <a
            className="button subtle"
            href={`https://docs.google.com/document/d/${documentId}/edit?tab=t.rf2v4q59t7sc`}
            target="_blank"
            rel="noreferrer"
          >
            Open manuscript equations <Icon name="link" />
          </a>
        )}
      </div>
      <div className="equation-list">
        {r.data?.equations.map((eq, i) => (
          <details key={eq.id}>
            <summary>
              <span className="change-number">{i + 1}</span>
              <div>
                <b>{eq.sectionPath?.join(" / ") || eq.label}</b>
                <small>
                  {eq.readOnly
                    ? "Protected finalized SOP"
                    : eq.isStandalone
                      ? "Display equation"
                      : "Equation within text"}
                </small>
              </div>
              <Icon name="chevron" />
            </summary>
            <div>
              <pre className="equation-context">{eq.surroundingText}</pre>
              <p>{eq.manualEditGuidance}</p>
              <ul>
                <li>Check the original formula, its domain and assumptions.</li>
                <li>
                  Verify symbol definitions, dimensions and unit conversions.
                </li>
                <li>
                  Trace constants and numerical values to reviewed research or
                  measurements.
                </li>
                <li>
                  Recalculate independently and compare to your actual results.
                </li>
              </ul>
              <button
                className="button subtle"
                onClick={() => navigate("/app")}
              >
                Discuss this in chat <Icon name="arrow" />
              </button>
            </div>
          </details>
        ))}
      </div>
    </>
  );
}
export function Formatting({
  sections,
  refreshJobs,
}: {
  sections: SectionNode[];
  refreshJobs: () => Promise<void>;
}) {
  const r = useResource<any>("/manuscript/layout"),
    a = useAction(),
    [scope, setScope] = useState<string[]>([]);
  return (
    <>
      <PageHead
        title="Keep the school’s layout in view."
        description="Formatting rules come from the protected THESIS LAYOUT tab, with explicit exceptions for special content."
      />
      <Feedback action={a} />
      {r.error && (
        <Notice error>
          {r.error}
          <button onClick={() => void r.reload()}>Retry audit</button>
        </Notice>
      )}
      <div className="formatting-intro">
        <Icon name="layout" />
        <div>
          <h2>Match the reference, then inspect the PDF.</h2>
          <p>
            Automatic body repairs are proposals. Title pages, tables, equations
            and ambiguous paragraphs need separate review.
          </p>
        </div>
      </div>
      <div className="actions">
        <ScopePicker sections={sections} value={scope} onChange={setScope} />
        <button
          className="button primary"
          disabled={a.busy}
          onClick={() =>
            void a.run(async () => {
              const p = await api<any>("/manuscript/layout/proposal", {
                sectionIds: scope,
              });
              await refreshJobs();
              if (p.job) navigate("/app/review?job=" + p.job.id);
              else
                a.setNotice(
                  "No supported body repairs were found in this scope. Inspect the PDF for visual issues.",
                );
            })
          }
        >
          {a.busy
            ? "Checking current document…"
            : "Prepare formatting proposal"}
          <Icon name="arrow" />
        </button>
      </div>
      <p className="muted">
        Each proposal contains at most 25 changes for careful review. It does
        not silently reformat the entire thesis.
      </p>
      {r.data && (
        <>
          <h2 className="section-heading">
            Rules sampled from the school template
          </h2>
          <dl className="format-rules">
            <div>
              <dt>Body font</dt>
              <dd>
                {r.data.profile?.roles?.body?.textStyle?.weightedFontFamily
                  ?.fontFamily || "Not available"}{" "}
                {r.data.profile?.roles?.body?.textStyle?.fontSize?.magnitude
                  ? `· ${r.data.profile.roles.body.textStyle.fontSize.magnitude} pt`
                  : ""}
              </dd>
            </div>
            <div>
              <dt>Body line spacing</dt>
              <dd>
                {r.data.profile?.roles?.body?.paragraphStyle?.lineSpacing
                  ? `${r.data.profile.roles.body.paragraphStyle.lineSpacing}%`
                  : "Not available"}
              </dd>
            </div>
            <div>
              <dt>Figure captions</dt>
              <dd>
                {r.data.profile?.captionPlacement === "above_image"
                  ? "Above the image, kept with the figure"
                  : "Check the reference tab"}
              </dd>
            </div>
            <div>
              <dt>Current findings</dt>
              <dd>
                {r.data.issues?.length || 0} supported paragraph repairs ·{" "}
                {r.data.pageIssues?.length || 0} page settings needing manual
                review
              </dd>
            </div>
          </dl>
          {!!r.data.pageIssues?.length && (
            <Notice>
              Page-level settings need manual review in Google Docs. Inspect
              margins, paper size and university headers in the PDF.
            </Notice>
          )}
          <details className="audit-details">
            <summary>Read the school tab’s written instructions</summary>
            <p>
              These are native template instructions at the displayed revision.
              Literal space counts and bottom-of-page rules require
              rendered-page inspection.
            </p>
            {r.data.profile?.writtenInstructions?.map((v: any) => (
              <p key={v.start}>{v.text}</p>
            ))}
            {!!r.data.profile?.writtenConflicts?.length && (
              <Notice>
                The template’s written rules differ from incidental sample
                formatting. Supported body/caption font and line spacing follow
                the explicit written requirements; other exceptions remain for
                review.
              </Notice>
            )}
            <ul>
              {r.data.profile?.manualChecks?.map((s: string, i: number) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </details>
          <details className="audit-details">
            <summary>Read the paragraphs flagged for formatting review</summary>
            {r.data.issues?.length ? (
              r.data.issues.map((issue: any) => (
                <article className="audit-issue" key={issue.anchorId}>
                  <h3>
                    {issue.sectionPath?.join(" / ") || "Manuscript paragraph"}
                  </h3>
                  <Badge value={issue.role} />
                  <p>{issue.text}</p>
                </article>
              ))
            ) : (
              <p>
                No supported paragraph repairs are flagged in this snapshot.
                This does not establish that the printed layout is correct.
              </p>
            )}
          </details>
        </>
      )}
    </>
  );
}
interface Candidate {
  id: string;
  revisionId: string;
  pageCount: number;
  letterPages: number;
  fileSizeBytes: number;
  sha256: string;
  url: string;
  sourcePageRange?: { from: number; to: number };
}
export function PrintReview() {
  const r = useResource<PrintReadiness>("/manuscript/print-readiness"),
    a = useAction(),
    [candidate, setCandidate] = useState<Candidate>(),
    [checks, setChecks] = useState<string[]>([]),
    [notes, setNotes] = useState(""),
    [from, setFrom] = useState(1),
    [to, setTo] = useState(1);
  function accept(c: Candidate) {
    setCandidate(c);
    setChecks([]);
    setNotes("");
    setFrom(1);
    setTo(c.pageCount);
  }
  return (
    <>
      <PageHead
        title="The final read before print."
        description="Prepare one PDF, inspect its pages, then select 4 copies in your printer settings."
      />
      <Feedback action={a} />
      {r.error && <Notice error>{r.error}</Notice>}
      <Notice>
        Exports can include school-reference pages or developer test fixtures.
        Inspect the file, select only the intended manuscript pages, and exclude
        synthetic content before final approval.
      </Notice>
      <div className="print-top">
        <div>
          <h2>
            {candidate
              ? `${candidate.pageCount} pages in this candidate`
              : "Start with a fresh export."}
          </h2>
          <p>
            {candidate
              ? `One PDF with ${candidate.pageCount} pages. Choose 4 copies in your printer settings.`
              : "A historical page estimate is not a final print count."}
          </p>
        </div>
        <button
          className="button primary"
          disabled={a.busy}
          onClick={() =>
            void a.run(async () => {
              accept(await api<Candidate>("/manuscript/prepare-print-pdf", {}));
              await r.reload();
            })
          }
        >
          {a.busy ? "Preparing…" : "Prepare current PDF"}
          <Icon name="file" />
        </button>
      </div>
      {candidate && (
        <section className="print-candidate">
          <div className="actions">
            <a
              className="button primary"
              href={candidate.url}
              target="_blank"
              rel="noreferrer"
            >
              Read this exact PDF <Icon name="link" />
            </a>
            <span>
              {candidate.letterPages} Letter-size pages ·{" "}
              {(candidate.fileSizeBytes / 1024 / 1024).toFixed(1)} MB
            </span>
          </div>
          <details className="page-extract">
            <summary>Select manuscript page range</summary>
            <p>
              Use the PDF viewer’s page positions, including front matter. This
              creates a separate candidate and keeps the full export.
            </p>
            <div className="actions">
              <label>
                First PDF page
                <input
                  type="number"
                  min={1}
                  max={candidate.pageCount}
                  value={from}
                  onChange={(e) => setFrom(+e.target.value)}
                />
              </label>
              <label>
                Last PDF page
                <input
                  type="number"
                  min={from}
                  max={candidate.pageCount}
                  value={to}
                  onChange={(e) => setTo(+e.target.value)}
                />
              </label>
              <button
                className="button subtle"
                disabled={
                  a.busy || from < 1 || to < from || to > candidate.pageCount
                }
                onClick={() =>
                  void a.run(async () => {
                    accept(
                      await api<Candidate>(
                        "/manuscript/print-candidates/" +
                          candidate.id +
                          "/extract",
                        { from, to },
                      ),
                    );
                    a.setNotice(
                      "Page-range PDF prepared. Read this new candidate before approving it.",
                    );
                  })
                }
              >
                Prepare these pages <Icon name="arrow" />
              </button>
            </div>
          </details>
          {candidate.sourcePageRange && (
            <p>
              Selected source PDF pages {candidate.sourcePageRange.from}–
              {candidate.sourcePageRange.to}.
            </p>
          )}
          <h2>Confirm what you checked</h2>
          {r.data?.requiredChecks?.map((c) => (
            <label className="check-row print-check" key={c.id}>
              <input
                type="checkbox"
                checked={checks.includes(c.id)}
                onChange={(e) =>
                  setChecks(
                    e.target.checked
                      ? [...checks, c.id]
                      : checks.filter((id) => id !== c.id),
                  )
                }
              />
              <span>{c.label}</span>
            </label>
          ))}
          <label>
            Final review notes
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={3000}
              placeholder="Record the sections, calculations, citations and layout you inspected (at least 30 characters)."
            />
          </label>
          <button
            className="button primary"
            disabled={
              a.busy ||
              notes.trim().length < 30 ||
              !r.data?.requiredChecks?.length ||
              checks.length !== r.data.requiredChecks.length
            }
            onClick={() =>
              void a.run(async () => {
                await api("/manuscript/freeze-print-pdf", {
                  candidateId: candidate.id,
                  revision: candidate.revisionId,
                  acknowledgedChecks: checks,
                  notes,
                });
                await r.reload();
                a.setNotice(
                  "Your approval is recorded. This saved PDF keeps the reviewed version, even if Google Docs changes later.",
                );
              })
            }
          >
            Save approved PDF <Icon name="check" />
          </button>
          <details>
            <summary>File identity</summary>
            <p className="code-wrap">SHA-256: {candidate.sha256}</p>
            <p className="code-wrap">Revision: {candidate.revisionId}</p>
          </details>
        </section>
      )}
      {r.data?.frozenPrintPdf && (
        <section className="frozen-pdf">
          <h2>Your approved print file</h2>
          {r.data.frozenPrintPdf.stale && (
            <Notice error>
              The manuscript has changed since this file was approved. Prepare a
              fresh export for a newer print revision.
            </Notice>
          )}
          <p>
            One PDF · {r.data.frozenPrintPdf.pageCount} pages. Open it and
            select 4 copies in your printer settings.
          </p>
          <a
            className="button subtle"
            href={r.data.frozenPrintPdf.url}
            target="_blank"
            rel="noreferrer"
          >
            Open approved PDF <Icon name="link" />
          </a>
        </section>
      )}
    </>
  );
}
export function Settings({
  state,
  recheck,
}: {
  state: TeamStatus;
  recheck: () => Promise<void>;
}) {
  const members = useResource<Actor[]>("/team/members"),
    connections = useResource<Connections>("/connections"),
    a = useAction(),
    [login, setLogin] = useState<any>(),
    [invite, setInvite] = useState("");
  return (
    <>
      <PageHead
        title="Your account. Your team."
        description="Each member connects their own ChatGPT account. Your AI requests never borrow a teammate’s account."
      />
      <Feedback action={a} />
      <section className="settings-section">
        <div>
          <h2>Your ChatGPT connection</h2>
          <p>
            Workspace sign-in and ChatGPT authorization are separate. Finish
            authorization on OpenAI’s own page.
          </p>
        </div>
        <div className="settings-content">
          <UsageMeter />
          {connections.data && (
            <p>
              ChatGPT: <Badge value={connections.data.codex.status} /> · Google
              Docs: <Badge value={connections.data.google.status} />
            </p>
          )}
          {connections.error && <Notice error>{connections.error}</Notice>}
          {connections.data?.codex.error && (
            <Notice error>{connections.data.codex.error}</Notice>
          )}
          <div className="actions">
            <button
              className="button primary"
              disabled={a.busy || !state.enabled}
              onClick={() =>
                void a.run(async () => setLogin(await api("/ai/login", {})))
              }
            >
              Connect my ChatGPT <Icon name="link" />
            </button>
            <button
              className="button subtle"
              disabled={a.busy}
              onClick={() =>
                void a.run(async () => {
                  const c = await api<Connections>("/connections/check", {});
                  connections.setData(c);
                  a.setNotice(
                    c.codex.status === "connected"
                      ? "Your ChatGPT connection is ready."
                      : "Complete your authorization, then check again.",
                  );
                  if (c.codex.status === "connected") setLogin(undefined);
                })
              }
            >
              Check connections <Icon name="refresh" />
            </button>
          </div>
          {!state.enabled && (
            <Notice>
              Local laptop mode uses the host’s existing Codex connection.
              Personal team accounts require team mode.
            </Notice>
          )}
          {login && (
            <div className="device-login">
              <h3>Complete your personal sign-in</h3>
              <p>Open the page below and enter this one-time code.</p>
              <a
                className="button subtle"
                href={login.verificationUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open OpenAI authorization <Icon name="link" />
              </a>
              <code>{login.userCode}</code>
              <p>Then return here and select “Check connections.”</p>
              <button
                className="text-button"
                disabled={a.busy}
                onClick={() =>
                  void a.run(async () => {
                    await api("/ai/login/cancel", { loginId: login.loginId });
                    setLogin(undefined);
                  })
                }
              >
                Cancel authorization
              </button>
            </div>
          )}
          {state.enabled && (
            <button
              className="text-button danger"
              disabled={a.busy}
              onClick={() =>
                void a.run(async () => {
                  await api("/ai/logout", {});
                  setLogin(undefined);
                  await connections.reload();
                  a.setNotice("Your ChatGPT account was disconnected.");
                })
              }
            >
              Disconnect my ChatGPT
            </button>
          )}
        </div>
      </section>
      <section className="settings-section">
        <div>
          <h2>Four people, one manuscript.</h2>
          <p>
            Any member can review and apply a validated proposal. Every action
            records who performed it.
          </p>
        </div>
        <div className="settings-content">
          {members.error && <Notice error>{members.error}</Notice>}
          {members.data?.map((m) => (
            <div className="member-row" key={m.id}>
              <span className="avatar">{m.name[0]}</span>
              <div>
                <b>
                  {m.name}
                  {m.id === state.actor?.id ? " (you)" : ""}
                </b>
                <small>
                  {m.role} · @{m.username}
                </small>
              </div>
            </div>
          ))}
          {state.enabled && (
            <p>
              {members.data?.length || 0} of {state.memberLimit} places filled.
            </p>
          )}
          {state.actor?.role === "owner" && (
            <>
              <button
                className="button subtle"
                disabled={
                  a.busy || (members.data?.length || 0) >= state.memberLimit
                }
                onClick={() =>
                  void a.run(async () => {
                    const r = await api<{ code: string }>(
                      "/team/invitations",
                      {},
                    );
                    setInvite(r.code);
                  })
                }
              >
                Create one-use invitation <Icon name="plus" />
              </button>
              {invite && (
                <div className="invite-code">
                  <p>Share privately with one teammate. Expires in 24 hours.</p>
                  <code>{invite}</code>
                  <button
                    className="button subtle"
                    onClick={() =>
                      void a.run(async () => {
                        await navigator.clipboard.writeText(invite);
                        a.setNotice("Invitation copied. Share it privately.");
                      })
                    }
                  >
                    Copy invitation
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </section>
      <section className="settings-section">
        <div>
          <h2>Working together from your phones</h2>
          <p>
            The host laptop must stay awake, connected to the internet, and
            running the app. A temporary tunnel address may change after
            restart.
          </p>
        </div>
        <div className="settings-content">
          {state.publicOrigin ? (
            <>
              <p>Team workspace address</p>
              <a className="code-wrap" href={state.publicOrigin}>
                {state.publicOrigin}
              </a>
              <button
                className="button subtle"
                onClick={() =>
                  void a.run(async () => {
                    await navigator.clipboard.writeText(state.publicOrigin!);
                    a.setNotice("Workspace address copied.");
                  })
                }
              >
                Copy workspace address
              </button>
            </>
          ) : (
            <Notice>
              Team access has not been configured for this server.
            </Notice>
          )}
        </div>
      </section>
      <section className="settings-section">
        <div>
          <h2>Refresh the manuscript</h2>
          <p>
            Use this after making a manual Google Docs edit. Existing proposals
            may need a new validation.
          </p>
        </div>
        <div className="settings-content">
          <button
            className="button subtle"
            disabled={a.busy}
            onClick={() =>
              void a.run(async () => {
                await api("/manuscript/refresh", {});
                a.setNotice(
                  "Manuscript refreshed from Google Docs. Validate older proposals again before applying them.",
                );
              })
            }
          >
            Refresh from Google Docs <Icon name="refresh" />
          </button>
        </div>
      </section>
      {state.enabled && (
        <button
          className="button subtle"
          disabled={a.busy}
          onClick={() =>
            void a.run(async () => {
              await api("/auth/logout", {});
              await recheck();
              navigate("/sign-in");
            })
          }
        >
          Sign out of workspace <Icon name="logout" />
        </button>
      )}
    </>
  );
}
