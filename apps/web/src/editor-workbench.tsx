import React from "react";
import type {
  Message,
  SectionNode,
  Source,
  ManuscriptWorkbench,
} from "../../../packages/contracts/index";
import { api } from "./api";
import { navigate } from "./main";
import { Feedback, Icon, useAction } from "./ui";
export type Finding = ManuscriptWorkbench["findings"][number];
export const tasks = {
  conversation: "Work with me · chat and review",
  revise: "Draft changes",
  reconcile_sources: "Consolidate & discuss",
  find_visuals: "Find sourced visuals",
  figure_brief: "Plan a figure edit",
} as const;
function publicLink(url: string | null | undefined) {
  try {
    const u = new URL(url || "");
    return u.protocol === "https:" && !u.username && !u.password
      ? u.href
      : undefined;
  } catch {
    return undefined;
  }
}
export function EditorWorkbench({
  message,
  threadId,
  sources,
  sections,
  onDraft,
  onSource,
}: {
  message: Message;
  threadId: string;
  sources: Source[];
  sections: SectionNode[];
  onDraft: (finding: Finding, messageId: string) => void;
  onSource: () => Promise<void>;
}) {
  const a = useAction(),
    plan = message.workbench;
  if (!plan) return null;
  const sectionName = (id: string) =>
    sections.find((s) => s.id === id)?.path.join(" / ") ||
    "Refresh section list";
  return (
    <section
      className="editor-workbench"
      aria-label="Source consolidation and figure plan"
    >
      <h3>Working manuscript plan</h3>
      <p className="muted">
        Draft analysis, with traceable excerpts. Source review and exact-change
        approval remain separate.
      </p>
      <Feedback action={a} />
      {plan.findings.length > 0 && (
        <details open>
          <summary>Evidence & decisions · {plan.findings.length}</summary>
          <ol className="editor-findings">
            {plan.findings.map((f, i) => (
              <li key={i}>
                <div className="finding-labels">
                  <span>{f.kind.replaceAll("_", " ")}</span>
                  <strong>{f.disposition.replaceAll("_", " ")}</strong>
                </div>
                <p>
                  <b>{f.statement}</b>
                </p>
                <p>{f.rationale}</p>
                {f.sectionIds.length > 0 && (
                  <small>{f.sectionIds.map(sectionName).join(" · ")}</small>
                )}
                {f.references.map((ref, n) => {
                  const source = sources.find((s) => s.id === ref.sourceId);
                  return (
                    <figure className="source-quotation" key={n}>
                      <blockquote>{ref.quote}</blockquote>
                      <figcaption>
                        {source?.name || "Source unavailable"} ·{" "}
                        {source?.evidenceReviewed
                          ? "human reviewed"
                          : "review pending"}
                      </figcaption>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() =>
                          navigate(
                            `/app/sources?source=${ref.sourceId}${f.sectionIds[0] ? "&section=" + f.sectionIds[0] : ""}`,
                          )
                        }
                      >
                        Inspect & map source <Icon name="arrow" />
                      </button>
                    </figure>
                  );
                })}
                {f.disposition === "use_with_attribution" && (
                  <button
                    type="button"
                    className="button subtle"
                    onClick={() => onDraft(f, message.id)}
                  >
                    Prepare request from this finding <Icon name="arrow" />
                  </button>
                )}
              </li>
            ))}
          </ol>
        </details>
      )}
      {plan.figures.length > 0 && (
        <details open>
          <summary>Visuals & manual edits · {plan.figures.length}</summary>
          <div className="figure-briefs">
            {plan.figures.map((f, i) => (
              <section key={i} className="figure-brief">
                <h4>{f.title}</h4>
                <small>
                  {f.kind === "human_edit"
                    ? "Human figure edit"
                    : "Original-source visual candidate"}
                  {f.sectionId ? " · " + sectionName(f.sectionId) : ""}
                </small>
                {f.figureId && (
                  <a
                    className="text-button"
                    href={`/api/v1/manuscript/figures/${f.figureId}/image`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open current figure for your inspection
                  </a>
                )}
                <dl>
                  <div>
                    <dt>Source / location</dt>
                    <dd>
                      {f.locator}
                      {publicLink(f.pageUrl) && (
                        <>
                          {" "}
                          ·{" "}
                          <a
                            href={publicLink(f.pageUrl)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Original source page
                          </a>
                        </>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Proposed caption</dt>
                    <dd>{f.caption}</dd>
                  </div>
                  <div>
                    <dt>Attribution</dt>
                    <dd>{f.attribution}</dd>
                  </div>
                  <div>
                    <dt>Reuse / permission</dt>
                    <dd>{f.reuse}</dd>
                  </div>
                </dl>
                {f.instructions.length > 0 && (
                  <>
                    <h5>
                      {f.kind === "human_edit"
                        ? "Edit these elements"
                        : "Collect the original"}
                    </h5>
                    <ol>
                      {f.instructions.map((s, n) => (
                        <li key={n}>{s}</li>
                      ))}
                    </ol>
                  </>
                )}
                {f.checks.length > 0 && (
                  <>
                    <h5>Before uploading or proposing</h5>
                    <ul>
                      {f.checks.map((s, n) => (
                        <li key={n}>{s}</li>
                      ))}
                    </ul>
                  </>
                )}
                <div className="actions">
                  {f.kind === "source_visual" &&
                    f.pageObserved &&
                    f.imageUrl && (
                      <button
                        type="button"
                        className="button subtle"
                        disabled={a.busy}
                        onClick={() =>
                          void a.run(async () => {
                            const source = await api<Source>(
                              "/sources/import-visual",
                              { threadId, messageId: message.id, index: i },
                            );
                            await onSource();
                            a.setNotice(
                              "Original figure saved privately. Inspect it, confirm attribution/reuse and mark it reviewed before requesting insertion.",
                            );
                            navigate(
                              `/app/sources?source=${source.id}${f.sectionId ? "&section=" + f.sectionId : ""}`,
                            );
                          })
                        }
                      >
                        {a.busy
                          ? "Importing original…"
                          : "Collect original figure"}
                        <Icon name="arrow" />
                      </button>
                    )}
                  <button
                    type="button"
                    className="text-button"
                    disabled={a.busy}
                    onClick={() =>
                      void a.run(async () => {
                        await navigator.clipboard.writeText(
                          [
                            f.title,
                            f.locator,
                            `Caption: ${f.caption}`,
                            `Attribution: ${f.attribution}`,
                            `Reuse: ${f.reuse}`,
                            ...f.instructions.map((s, n) => `${n + 1}. ${s}`),
                            "Check:",
                            ...f.checks,
                          ].join("\n"),
                        );
                        a.setNotice("Figure instructions copied.");
                      })
                    }
                  >
                    Copy figure instructions
                  </button>
                </div>
                {f.kind === "source_visual" && !f.pageObserved && (
                  <p className="muted">
                    Original page has not been observed in this request. Verify
                    it before importing; the candidate is not validated.
                  </p>
                )}
              </section>
            ))}
          </div>
        </details>
      )}
      {plan.nextSteps.length > 0 && (
        <>
          <h4>Next decisions</h4>
          <ol>
            {plan.nextSteps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
