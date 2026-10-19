import React from "react";
import type { Job } from "../../../packages/contracts/index";
import { api } from "./api";
import { Notice, Feedback, useAction, useResource } from "./ui";
import { navigate } from "./main";
export function ChatProposal({ id, refreshJobs }: { id: string; refreshJobs: () => Promise<void> }) {
  const resource = useResource<Job>("/jobs/" + id), a = useAction();
  const j = resource.data;
  if (!j) return <Notice>Loading the saved proposal…</Notice>;
  if (j.sourceReviewMode !== "proposal_review") return <button className="button proposal-link" onClick={() => navigate("/app/review?job=" + id)}>Read the proposed changes</button>;
  const applied = ["complete", "needs_layout_review"].includes(j.status);
  return <section className="chat-proposal" aria-label="Proposed manuscript update">
    <h3>{applied ? "Applied to the manuscript" : "Review this update"}</h3>
    {applied ? <Notice>Native content verified. {j.verification?.layout === "reviewed" ? "PDF layout reviewed." : "PDF layout still needs checking."}</Notice> : <p>Read the changes below. Approve this whole batch, or tell SolAir what to change in chat.</p>}
    {j.blockers.length > 0 && <Notice error>{j.blockers.join(" ")}</Notice>}
    {j.review?.changes.map(c => <article className="change-block" key={c.id}>
      <h4>{c.sectionPath.join(" / ") || "Manuscript passage"}</h4>
      {c.riskFlags.some(f => /removes|scope|substantial/.test(f)) && <p><b>Careful review:</b> {c.riskFlags.filter(f => /removes|scope|substantial/.test(f)).join(" · ").replaceAll("_", " ")}</p>}
      <div className="comparison"><section><h4>Before</h4><p>{c.before || "No previous text"}</p>{c.formattingBefore && <pre>{JSON.stringify(c.formattingBefore, null, 2)}</pre>}</section><section><h4>Proposed</h4><p>{c.after || "Removed"}</p>{c.formattingAfter && <pre>{JSON.stringify(c.formattingAfter, null, 2)}</pre>}</section></div>
      {c.sourceId && <div className="figure-compare">{c.beforeFigureId && <img src={"/api/v1/manuscript/figures/" + c.beforeFigureId + "/image"} alt="Current manuscript figure" />}<img src={"/api/v1/sources/" + c.sourceId + "/image"} alt="Proposed source figure" /></div>}
      {c.removedText && <details className="removed"><summary>Text being removed</summary><p>{c.removedText}</p></details>}
      <p className="change-evidence"><b>Reason & sources</b>{c.evidence}</p>
    </article>)}
    {!applied && j.status === "dry_run_ready" && j.review && <>
      <p>Approving confirms you have read this batch, including removals and source limitations.</p>
      <button className="button primary" disabled={a.busy} onClick={() => void a.run(async () => {
        await api("/jobs/" + id + "/approve-and-apply", { previewHash: j.review!.hash, baseRevision: j.baseRevision, acknowledged: true }, "POST", { "Idempotency-Key": id + ":chat-review" });
        await resource.reload(); await refreshJobs();
      })}>{a.busy ? "Applying and verifying…" : "Approve and apply this batch"}</button>
    </>}
    {!applied && j.status === "blocked" && <button className="button" disabled={a.busy} onClick={() => void a.run(async () => { await api("/jobs/" + id + "/dry-run", {}); await resource.reload(); })}>Refresh proposal</button>}
    {applied && <button className="button" onClick={() => navigate("/app/review?job=" + id)}>Check PDF layout</button>}
    <Feedback action={a} />
  </section>;
}
