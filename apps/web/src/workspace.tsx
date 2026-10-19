import React, { useEffect, useState, lazy, Suspense } from "react";
import type {
  TeamStatus,
  Job,
  SectionNode,
  Source,
  Thread,
  ManuscriptTask,
} from "../../../packages/contracts/index";
import { api } from "./api";
import { navigate } from "./main";
import {
  Logo,
  Icon,
  ThemeSwitch,
  Notice,
  PageHead,
  Empty,
  Feedback,
  useAction,
  useResource,
  DateLabel,
  Badge,
} from "./ui";
import {
  Review,
  History,
  Sources,
  Equations,
  Formatting,
  PrintReview,
  Settings,
} from "./views";
import { Help } from "./help";
const Answer = lazy(() =>
  import("./answer").then((module) => ({ default: module.Answer })),
);
import { AttachmentPreview, PastePanel } from "./chat-attachments";
import { ChatProposal } from "./chat-proposal";
import { UsageMeter } from "./account-usage";
import { ResearchActivity } from "./research-activity";
import { EditorWorkbench, tasks, type Finding } from "./editor-workbench";
import {
  Character,
  companions,
  consumeEntrySpace,
  Space,
  SpaceChoices,
} from "./companions";
export function ScopePicker({
  sections,
  value,
  onChange,
}: {
  sections: SectionNode[];
  value: string[];
  onChange: (s: string[]) => void;
}) {
  return (
    <details className="scope-picker">
      <summary>
        <Icon name="file" />
        {value.length
          ? `${value.length} section${value.length > 1 ? "s" : ""} selected`
          : "Let the agent find it"}
        <Icon name="chevron" />
      </summary>
      <div className="scope-content">
        <p>
          Optional: choose a chapter, section or subsection. With nothing
          selected, the agent finds the relevant material.
        </p>
        <button
          className="text-button"
          type="button"
          onClick={() => onChange([])}
        >
          Use automatic scope
        </button>
        <div className="section-list">
          {sections.map((s) => (
            <label
              key={s.id}
              className="check-row"
              style={{ paddingInlineStart: Math.min(s.level, 3) * 14 + 8 }}
            >
              <input
                type="checkbox"
                checked={value.includes(s.id)}
                disabled={
                  s.readOnly || (!value.includes(s.id) && value.length >= 8)
                }
                onChange={(e) =>
                  onChange(
                    e.target.checked
                      ? [...value, s.id]
                      : value.filter((id) => id !== s.id),
                  )
                }
              />
              <span>
                {s.title}
                {s.readOnly && <small>Protected</small>}
              </span>
            </label>
          ))}
        </div>
      </div>
    </details>
  );
}
export function Workspace({
  route,
  state,
  recheck,
}: {
  route: string;
  state: TeamStatus;
  recheck: () => Promise<void>;
}) {
  const [menu, setMenu] = useState(false),
    jobs = useResource<Job[]>("/jobs"),
    manuscript = useResource<any>("/manuscript"),
    sections = useResource<{ sections: SectionNode[] }>("/manuscript/sections");
  const part = route.split("/")[2] || "chat";
  const maintained = manuscript.data?.writeMode === "maintained_reviewed";
  const pending =
    jobs.data?.filter(
      (j) =>
        j.target === (maintained ? "maintained" : "trial") &&
        ["draft", "dry_run_ready", "needs_layout_review"].includes(j.status),
    ).length || 0;
  const links = [
      ["chat", "Chat", "chat"],
      ["review", "Review changes", "review"],
      ["history", "History", "history"],
    ],
    tools = [
      ["sources", "Sources", "sources"],
      ["equations", "Equations", "equation"],
      ["formatting", "School formatting", "layout"],
      ["print", "Print review", "print"],
      ["help", "Help & guide", "file"],
    ];
  function go(id: string) {
    setMenu(false);
    navigate("/app/" + id);
  }
  return (
    <div className="workspace">
      <aside className={"sidebar " + (menu ? "open" : "")}>
        <div className="sidebar-brand">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              navigate("/");
            }}
          >
            <Logo />
          </a>
          <button
            className="icon-button mobile-only"
            aria-label="Close navigation"
            onClick={() => setMenu(false)}
          >
            <Icon name="close" />
          </button>
        </div>
        <div className="workspace-label">Manuscript workspace</div>
        <nav aria-label="Workspace">
          {links.map(([id, label, icon]) => (
            <button
              key={id}
              className={"nav-item " + (part === id ? "active" : "")}
              onClick={() => go(id)}
            >
              <Icon name={icon} />
              <span>{label}</span>
              {id === "review" && pending > 0 && (
                <span className="nav-count">{pending}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="nav-divider" />
        <div className="workspace-label">Manuscript tools</div>
        <nav aria-label="Tools">
          {tools.map(([id, label, icon]) => (
            <button
              key={id}
              className={"nav-item " + (part === id ? "active" : "")}
              onClick={() => go(id)}
            >
              <Icon name={icon} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className={"nav-item " + (part === "settings" ? "active" : "")}
            onClick={() => go("settings")}
          >
            <span className="avatar">{state.actor?.name[0] || "S"}</span>
            <span>
              {state.actor?.name || "This laptop"}
              <small>Account & team</small>
            </span>
            <Icon name="settings" />
          </button>
        </div>
      </aside>
      {menu && (
        <button
          className="menu-scrim"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="workspace-body">
        <header className="app-topbar">
          <div>
            <button
              className="icon-button mobile-only"
              aria-label="Open navigation"
              onClick={() => setMenu(true)}
            >
              <Icon name="menu" />
            </button>
            <span className="topbar-title">
              SolAir <span>/</span>{" "}
              {part === "chat"
                ? "Manuscript chat"
                : part === "review"
                  ? "Review changes"
                  : part[0].toUpperCase() + part.slice(1)}
            </span>
          </div>
          <div className="actions">
            <span className="trial-label">
              <span />{" "}
              {manuscript.data
                ? maintained
                  ? "Adviser manuscript"
                  : "Test duplicate"
                : "Checking manuscript…"}
            </span>
            <ThemeSwitch />
          </div>
        </header>
        <main
          id="main"
          className={"app-main " + (part === "chat" ? "chat-main" : "")}
        >
          <div className="mode-note">
            <Icon name="shield" />
            <span>
              {manuscript.data
                ? maintained
                  ? "Working on the adviser-review manuscript. Read the proposed changes, then approve and apply a batch in chat."
                  : "Working on the test duplicate. Your adviser-review manuscript stays unchanged until activation."
                : "Checking the configured manuscript."}
            </span>
            {manuscript.data && (
              <a
                href={`https://docs.google.com/document/d/${manuscript.data.documentId}/edit?tab=${manuscript.data.tabId}`}
                target="_blank"
                rel="noreferrer"
              >
                Open Doc <Icon name="link" />
              </a>
            )}
          </div>
          {part === "chat" ? (
            <Chat
              sections={sections.data?.sections || []}
              refreshJobs={jobs.reload}
            />
          ) : part === "review" ? (
            <Review
              jobs={jobs}
              refreshJobs={jobs.reload}
              activeTarget={maintained ? "maintained" : "trial"}
            />
          ) : part === "history" ? (
            <History />
          ) : part === "sources" ? (
            <Sources sections={sections.data?.sections || []} />
          ) : part === "equations" ? (
            <Equations documentId={manuscript.data?.documentId} />
          ) : part === "formatting" ? (
            <Formatting
              sections={sections.data?.sections || []}
              refreshJobs={jobs.reload}
            />
          ) : part === "print" ? (
            <PrintReview />
          ) : part === "help" ? (
            <Help maintained={maintained} />
          ) : part === "settings" ? (
            <Settings state={state} recheck={recheck} />
          ) : (
            <Empty title="Page not found">
              <button onClick={() => go("chat")}>Go to chat</button>
            </Empty>
          )}
        </main>
      </div>
      <nav className="mobile-nav" aria-label="Quick navigation">
        {links.map(([id, label, icon]) => (
          <button
            key={id}
            className={part === id ? "active" : ""}
            onClick={() => go(id)}
          >
            <Icon name={icon} />
            <span>{id === "review" ? "Review" : label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
function Chat({
  sections,
  refreshJobs,
}: {
  sections: SectionNode[];
  refreshJobs: () => Promise<void>;
}) {
  const threads = useResource<Thread[]>("/chat/threads"),
    sources = useResource<Source[]>("/sources"),
    a = useAction(),
    [current, setCurrent] = useState<Thread>(),
    [text, setText] = useState(""),
    [scope, setScope] = useState<string[]>([]),
    [selectedSources, setSelectedSources] = useState<string[]>([]),
    [contextSources, setContextSources] = useState<string[]>([]),
    [task, setTask] = useState<ManuscriptTask>("conversation"),
    [analysisMessageId, setAnalysisMessageId] = useState<string>(),
    [attachments, setAttachments] = useState<Source[]>([]),
    [showPaste, setShowPaste] = useState(false),
    [attachmentError, setAttachmentError] = useState(""),
    [showThreads, setShowThreads] = useState(false),
    [pollError, setPollError] = useState(""),
    [purpose, setPurpose] = useState<
      "manuscript" | "defense" | "questions" | "prototype"
    >(() => consumeEntrySpace()),
    [helperRole, setHelperRole] = useState("editor"),
    [models, setModels] = useState<
      { model: string; label: string; efforts: string[] }[]
    >([]),
    [chosenModel, setChosenModel] = useState(""),
    [effort, setEffort] = useState("high"),
    [research, setResearch] = useState(true);
  const running = current?.messages.some((m) => m.status === "running");
  const manuscriptSpace = (current?.purpose || purpose) === "manuscript";
  useEffect(() => {
    const saved = sessionStorage.getItem("solair-current-thread");
    if (saved)
      void api<Thread>("/chat/threads/" + saved)
        .then((t) => setCurrent(t))
        .catch(() => sessionStorage.removeItem("solair-current-thread"));
  }, []);
  useEffect(() => {
    if (current) sessionStorage.setItem("solair-current-thread", current.id);
    else sessionStorage.removeItem("solair-current-thread");
    setContextSources(current?.contextSourceIds || []);
    setSelectedSources(
      current?.messages.filter((m) => m.role === "user").at(-1)?.sourceIds ||
        [],
    );
    const previous = current?.messages.filter((m) => m.role === "user").at(-1);
    if (previous) setTask("conversation");
    else if (!current) setTask("conversation");
    setAnalysisMessageId(undefined);
  }, [current?.id]);
  function prepareFinding(f: Finding, messageId: string) {
    const refs = [...new Set(f.references.map((r) => r.sourceId))];
    const ready = refs.every((id) =>
      sources.data?.some(
        (s) => s.id === id && s.evidenceReviewed && (s.sectionId || s.anchorId),
      ),
    );
    setTask(ready ? "revise" : "reconcile_sources");
    setScope(f.sectionIds);
    setContextSources(refs);
    setSelectedSources(ready ? refs : []);
    setAnalysisMessageId(messageId);
    setText(
      ready
        ? `Prepare one small exact manuscript proposal from this reviewed finding: ${f.statement}\nPreserve the facts, finalized SOP, native objects and the school template. Explain before/after and unresolved limits.`
        : `Discuss this finding and what still needs source review: ${f.statement}\nHelp me clarify its meaning before drafting changes.`,
    );
    document.querySelector<HTMLTextAreaElement>(".composer textarea")?.focus();
  }
  useEffect(() => {
    if (!current) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const t = await api<Thread>("/chat/threads/" + current.id);
        if (!cancelled) {
          setCurrent(t);
          setPollError("");
          if (!t.messages.some((m) => m.status === "running"))
            void refreshJobs();
        }
      } catch (e) {
        if (!cancelled) setPollError((e as Error).message);
      }
    };
    const poll = setInterval(refresh, running ? 2000 : 12000);
    const stream = running
      ? new EventSource(`/api/v1/chat/threads/${current.id}/events`)
      : undefined;
    stream?.addEventListener("assistant.phase", refresh);
    stream?.addEventListener("assistant.completed", refresh);
    stream?.addEventListener("assistant.failed", refresh);
    return () => {
      cancelled = true;
      clearInterval(poll);
      stream?.close();
    };
  }, [current?.id, running]);
  async function attachFiles(files: File[]) {
    if (a.busy || running) return;
    if (attachments.length + files.length > 5) {
      setAttachmentError("Attach up to five files per message.");
      return;
    }
    if (files.some((file) => file.size > 20 * 1024 * 1024)) {
      setAttachmentError("Each attachment must be 20 MB or smaller.");
      return;
    }
    setAttachmentError("");
    await a.run(async () => {
      for (const file of files) {
        const form = new FormData();
        form.append("file", file);
        const source = await api<Source>("/chat/attachments", form);
        setAttachments((items) =>
          items.some((item) => item.id === source.id)
            ? items
            : [...items, source],
        );
      }
      setShowPaste(false);
      await sources.reload();
    });
  }
  function attachPaste(value: string) {
    if (value.length > 200000) {
      setAttachmentError(
        "Pasted text exceeds 200,000 characters. Attach a smaller excerpt; nothing was truncated or sent.",
      );
      return;
    }
    void attachFiles([
      new File([value], "Pasted text.txt", { type: "text/plain" }),
    ]);
  }
  async function send() {
    if (!text.trim() || a.busy) return;
    if (running && current) {
      await a.run(async () => {
        await api("/chat/threads/" + current.id + "/guidance", { text: text.trim() });
        setText(""); setCurrent(await api<Thread>("/chat/threads/" + current.id));
      });
      return;
    }
    await a.run(async () => {
      let t = current;
      if (!t) {
        t = await api<Thread>("/chat/threads", {
          title: text.trim().slice(0, 100),
          purpose,
        });
        setCurrent(t);
        void threads.reload();
      }
      await api("/chat/threads/" + t.id + "/messages", {
        text: text.trim(),
        research,
        scope: scope.length ? "sections" : "general",
        sectionIds: scope,
        sourceIds: selectedSources,
        contextSourceIds: contextSources,
        task: manuscriptSpace ? task : "revise",
        ...(analysisMessageId ? { analysisMessageId } : {}),
        attachmentIds: attachments.map((source) => source.id),
        helperRole:
          t.purpose && t.purpose !== "manuscript" ? t.purpose : helperRole,
        ...(chosenModel ? { ai: { model: chosenModel, effort } } : {}),
      });
      setText("");
      setAttachments([]);
      setShowPaste(false);
      const saved = await api<Thread>("/chat/threads/" + t.id);
      setCurrent(saved);
      setContextSources(saved.contextSourceIds || []);
      setAnalysisMessageId(undefined);
    });
  }
  return (
    <div className="chat-workspace">
      {running && <button type="button" className="button primary phone-guidance" onClick={() => { const field = document.querySelector<HTMLTextAreaElement>("#message-input"); field?.scrollIntoView({ block: "center", behavior: "instant" }); field?.focus({ preventScroll: true }); }}>Add guidance</button>}
      <div className="chat-toolbar">
        <button
          className="button subtle"
          onClick={() => setShowThreads(!showThreads)}
        >
          <Icon name="history" />
          {current?.title || "Conversations"}
        </button>
        <button
          className="icon-button"
          aria-label="New conversation"
          title="New conversation"
          disabled={a.busy}
          onClick={() => {
            setCurrent(undefined);
            setText("");
            setScope([]);
            setSelectedSources([]);
            setAttachments([]);
            setShowPaste(false);
            setAttachmentError("");
          }}
        >
          <Icon name="plus" />
        </button>
      </div>
      {current && (
        <div className="space-status">
          <Character space={(current.purpose || "manuscript") as Space} />
          <Badge value={current.purpose || "manuscript"} />
          {current.branchedFrom && <small>Branched conversation</small>}
          <button
            className="text-button"
            disabled={a.busy || running}
            onClick={() =>
              void a.run(async () => {
                setCurrent(
                  await api<Thread>("/chat/threads/" + current.id + "/fork", {
                    title: current.title.slice(0, 90) + " · branch",
                  }),
                );
                await threads.reload();
              })
            }
          >
            Branch conversation <Icon name="plus" />
          </button>
        </div>
      )}
      {showThreads && (
        <div className="conversation-list">
          {threads.error && <Notice error>{threads.error}</Notice>}
          {!threads.data?.length && (
            <p>No conversations yet. Start with a question below.</p>
          )}
          {threads.data?.map((t) => (
            <button
              key={t.id}
              disabled={a.busy}
              onClick={() =>
                void a.run(async () => {
                  setCurrent(await api<Thread>("/chat/threads/" + t.id));
                  setAttachments([]);
                  setShowPaste(false);
                  setAttachmentError("");
                  setShowThreads(false);
                })
              }
            >
              <span>
                <small>{t.purpose || "manuscript"}</small>
                {t.title}
              </span>
              <DateLabel value={t.createdAt} />
            </button>
          ))}
        </div>
      )}
      <div className="messages" aria-live="polite">
        {!current?.messages.length ? (
          <div
            className="chat-welcome role-home"
            data-space={current?.purpose || purpose}
          >
            <div className="role-home-heading">
              <Character space={(current?.purpose || purpose) as Space} eager />
              <div>
                <h1>What shall we make clearer?</h1>
                <p>{companions[(current?.purpose || purpose) as Space].name}</p>
              </div>
            </div>
            <SpaceChoices
              compact
              value={(current?.purpose || purpose) as Space}
              onChange={(space) => {
                setCurrent(undefined);
                setPurpose(space);
                setText("");
                setScope([]);
                setSelectedSources([]);
                setAttachments([]);
                setShowPaste(false);
                setAttachmentError("");
                setHelperRole(space === "manuscript" ? "editor" : space);
              }}
            />
            <p className="role-home-description">
              {companions[(current?.purpose || purpose) as Space].description}
            </p>
            <div className="prompt-suggestions">
              <button
                onClick={() => {
                  setText(
                    companions[(current?.purpose || purpose) as Space].prompt,
                  );
                  document
                    .querySelector<HTMLTextAreaElement>(".composer textarea")
                    ?.focus();
                }}
              >
                {companions[(current?.purpose || purpose) as Space].prompt}
                <Icon name="arrow" />
              </button>
            </div>
          </div>
        ) : (
          current.messages.map((m) => (
            <article className={"message " + m.role} key={m.id}>
              <div className="message-meta">
                <span className="avatar small">
                  {m.role === "assistant" ? "S" : m.actor?.name[0] || "Y"}
                </span>
                <b>
                  {m.role === "assistant" ? "SolAir" : m.actor?.name || "You"}
                </b>
                <DateLabel value={m.createdAt} />
              </div>
              {m.role === "assistant" && <ResearchActivity message={m} />}
              {m.status === "running" ? null : m.role === "assistant" ? (
                <Suspense
                  fallback={<div className="message-text">{m.text}</div>}
                >
                  <Answer text={m.text} />
                </Suspense>
              ) : (
                <div className="message-text">{m.text}</div>
              )}
              {m.role === "assistant" && m.status === "complete" && m.ai && (
                <div className="answer-details">
                  <span>
                    {m.ai.model} · {m.ai.effort} reasoning
                  </span>
                  {m.research && (
                    <span>
                      {m.research.enabled
                        ? m.research.searches
                          ? `${m.research.searches} web searches · ${m.research.openedPages.length} pages opened`
                          : "No web search used"
                        : "Web research off"}
                    </span>
                  )}
                </div>
              )}
              {m.status === "failed" || m.status === "interrupted" ? (
                <Notice error>
                  {m.status === "interrupted"
                    ? "This answer was interrupted."
                    : "This request could not finish."}{" "}
                  No manuscript update was applied. Follow the guidance above,
                  then resend when ready.
                </Notice>
              ) : null}
              {m.sectionIds?.length ? (
                <small>
                  Selected sections:{" "}
                  {m.sectionIds
                    .map(
                      (id) =>
                        sections.find((s) => s.id === id)?.title || "Section",
                    )
                    .join(" · ")}
                </small>
              ) : null}
              {m.attachmentIds?.length ? (
                <div className="message-attachments">
                  {m.attachmentIds.map((id) => {
                    const source = sources.data?.find(
                      (source) => source.id === id,
                    );
                    return source ? (
                      <AttachmentPreview key={id} source={source} />
                    ) : (
                      <small key={id}>Attachment unavailable</small>
                    );
                  })}
                </div>
              ) : null}
              {m.sourceIds?.length ? (
                <small>
                  Sources:{" "}
                  {m.sourceIds
                    .map(
                      (id) =>
                        sources.data?.find((s) => s.id === id)?.name ||
                        "Reviewed source",
                    )
                    .join(" · ")}
                </small>
              ) : null}
              {m.guidance && <small role="status">{m.guidance === "steered" ? "Delivered to the active answer" : m.guidance === "following" ? "Included in the following answer" : m.guidance === "delivering" ? "Sending guidance…" : "Queued for the next answer"}</small>}
              {m.jobId && <ChatProposal key={m.jobId} id={m.jobId} refreshJobs={refreshJobs} />}
              {m.role === "assistant" && m.status === "complete" && current && (
                <details className="agent-options"><summary>Research details & figure instructions</summary><EditorWorkbench
                  message={m}
                  threadId={current.id}
                  sources={sources.data || []}
                  sections={sections}
                  onDraft={prepareFinding}
                  onSource={sources.reload}
                /></details>
              )}
            </article>
          ))
        )}
      </div>
      <div className="composer-area">
        {pollError && (
          <Notice error>
            {pollError} Your saved messages remain available. The app will
            reconnect automatically while this address is live. If the host
            restarted, open the latest team address.
          </Notice>
        )}
        <Feedback action={a} />
        <UsageMeter refreshKey={`${current?.id || "new"}:${!!running}`} />
        <details className="agent-options">
          <summary>
            <Icon name="settings" />
            Agent & space options
          </summary>
          <div>
        {manuscriptSpace && (
          <div className="manuscript-task">
            <label htmlFor="manuscript-task">Work on the manuscript</label>
            <select
              id="manuscript-task"
              value={task}
              disabled={a.busy || !!running}
              onChange={(e) => {
                setTask(e.target.value as ManuscriptTask);
                setAnalysisMessageId(undefined);
              }}
            >
              {Object.entries(tasks).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <small>
              {task === "conversation" ? "Chat naturally. The agent prepares edits; you review and approve a batch here." : task === "revise"
                ? "Read exact proposals before approving and applying."
                : task === "reconcile_sources"
                  ? "Bring drafts, findings and questions together. This step creates no edit job."
                  : task === "find_visuals"
                    ? "Find original source figures with captions and attribution. No generated research images."
                    : "Get precise instructions for a human to edit an existing figure."}
            </small>
          </div>
        )}
            {!current && (
              <label>
                New space
                <select
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value as typeof purpose)}
                >
                  <option value="manuscript">Manuscript editing</option>
                  <option value="defense">Defense coach · discussion</option>
                  <option value="questions">Questions · discussion</option>
                  <option value="prototype">
                    Prototype planning · discussion
                  </option>
                </select>
              </label>
            )}
            <label>
              Helper role
              <select
                value={
                  (current?.purpose || purpose) !== "manuscript"
                    ? current?.purpose || purpose
                    : helperRole
                }
                disabled={(current?.purpose || purpose) !== "manuscript"}
                onChange={(e) => setHelperRole(e.target.value)}
              >
                <option value="editor">Thesis editor</option>
                <option value="equations">Equation reviewer</option>
                <option value="evidence">Evidence checker</option>
                <option value="defense">Defense coach</option>
                <option value="questions">Questions</option>
                <option value="prototype">Prototype planner</option>
              </select>
            </label>
            <label className="model-choice">
              Model
              <select
                value={chosenModel}
                onChange={(e) => {
                  const value = e.target.value;
                  setChosenModel(value);
                  const m = models.find((m) => m.model === value);
                  setEffort(
                    ["high", "medium", "low", "xhigh", "max"].find((value) =>
                      m?.efforts.includes(value),
                    ) || "high",
                  );
                }}
              >
                <option value="">Default · GPT-6.1 Sol / High</option>
                {models.map((m) => (
                  <option key={m.model} value={m.model}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            {chosenModel && (
              <label>
                Reasoning
                <select
                  value={effort}
                  onChange={(e) => setEffort(e.target.value)}
                >
                  {models
                    .find((m) => m.model === chosenModel)
                    ?.efforts.map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                </select>
              </label>
            )}
            <button
              type="button"
              className="text-button"
              disabled={a.busy || running}
              onClick={() =>
                void a.run(async () => {
                  setModels(await api("/ai/models"));
                  a.setNotice(
                    "Models loaded from your personal runtime. Your plan or quota may still reject a model; no fallback account is used.",
                  );
                })
              }
            >
              Load my models <Icon name="refresh" />
            </button>
            <label className="check-row research-choice">
              <input
                type="checkbox"
                checked={research}
                disabled={a.busy || !!running}
                onChange={(e) => setResearch(e.target.checked)}
              />{" "}
              Search the web when useful
            </label>
            <small>
              Research uses your own ChatGPT account. High is the default;
              choose Max for harder tasks when available. Sources and claims
              still need your review.
            </small>
            <small>
              Spaces separate discussions, not Google Docs copies. Help & guide
              explains roles and branching.
            </small>
          </div>
        </details>
        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          {attachments.length > 0 && (
            <div className="attachment-tray" aria-label="Attached context">
              {attachments.map((source) => (
                <AttachmentPreview
                  key={source.id}
                  source={source}
                  remove={
                    a.busy || running
                      ? undefined
                      : () =>
                          setAttachments((items) =>
                            items.filter((item) => item.id !== source.id),
                          )
                  }
                />
              ))}
              <small>
                Shared workspace context. For manuscript proposals, inspect and
                review it in Sources, then select it under Add evidence.
                Detaching keeps the saved source.
              </small>
            </div>
          )}
          {!!contextSources.length && (
            <details className="retained-sources">
              <summary>
                Retained for follow-up · {contextSources.length} sources
              </summary>
              <p>
                These snapshots stay with this conversation. Unreviewed context
                cannot authorize manuscript changes.
              </p>
              {contextSources.map((id) => {
                const s = sources.data?.find((s) => s.id === id);
                return (
                  <label key={id} className="check-row">
                    <input
                      type="checkbox"
                      checked
                      disabled={a.busy || !!running}
                      onChange={() =>
                        setContextSources((items) =>
                          items.filter((v) => v !== id),
                        )
                      }
                    />
                    {s?.name || "Saved source"} ·{" "}
                    {s?.evidenceReviewed ? "reviewed" : "context only"}
                  </label>
                );
              })}
            </details>
          )}
          {showPaste && (
            <PastePanel
              busy={a.busy || !!running}
              onAdd={attachPaste}
              onClose={() => setShowPaste(false)}
            />
          )}
          {attachmentError && <Notice error>{attachmentError}</Notice>}
          <label className="sr-only" htmlFor="message-input">
            Your manuscript request
          </label>
          <textarea
            id="message-input"
            placeholder={running ? "Add guidance while SolAir works…" : "Tell SolAir what you’d like to revise…"}
            value={text}
            maxLength={12000}
            rows={3}
            onChange={(e) => setText(e.target.value)}
            onPaste={(e) => {
              const value = e.clipboardData.getData("text/plain");
              if (
                value.length >= 1500 ||
                value.split("\n").length >= 12 ||
                value.length + text.length > 12000
              ) {
                e.preventDefault();
                if (a.busy || running) {
                  setAttachmentError(
                    "Wait for the current action to finish, then paste again.",
                  );
                  return;
                }
                attachPaste(value);
              }
            }}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                (!e.shiftKey || e.metaKey || e.ctrlKey) &&
                !e.nativeEvent.isComposing &&
                e.keyCode !== 229
              ) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <div className="composer-controls">
            <div className="composer-options">
              <label
                className={
                  "attachment-upload button subtle" +
                  (a.busy || running || attachments.length >= 5
                    ? " is-disabled"
                    : "")
                }
              >
                <Icon name="plus" />
                <span>{a.busy ? "Working…" : "Attach"}</span>
                <input
                  className="sr-only"
                  type="file"
                  aria-label="Attach documents to chat"
                  accept=".pdf,.docx,.xlsx,.txt,.md,.csv,.json"
                  multiple
                  disabled={a.busy || !!running || attachments.length >= 5}
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    e.target.value = "";
                    void attachFiles(files);
                  }}
                />
              </label>
              <button
                type="button"
                className="button subtle"
                disabled={a.busy || !!running || attachments.length >= 5}
                aria-expanded={showPaste}
                onClick={() => setShowPaste(!showPaste)}
              >
                Paste text
              </button>
              <ScopePicker
                sections={sections}
                value={scope}
                onChange={setScope}
              />
              {task !== "conversation" && <details className="source-picker">
                <summary>
                  <Icon name="sources" />
                  {selectedSources.length
                    ? `${selectedSources.length} sources`
                    : "Add evidence"}
                </summary>
                <div className="scope-content">
                  <p>
                    Only sources you have inspected and marked reviewed can
                    support a proposal.
                  </p>
                  {sources.data
                    ?.filter((s) => s.evidenceReviewed)
                    .map((s) => (
                      <label className="check-row" key={s.id}>
                        <input
                          type="checkbox"
                          checked={selectedSources.includes(s.id)}
                          disabled={
                            !selectedSources.includes(s.id) &&
                            selectedSources.length >= 25
                          }
                          onChange={(e) =>
                            setSelectedSources(
                              e.target.checked
                                ? [...selectedSources, s.id]
                                : selectedSources.filter((id) => id !== s.id),
                            )
                          }
                        />
                        {s.name}
                      </label>
                    ))}
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => navigate("/app/sources")}
                  >
                    Manage sources <Icon name="arrow" />
                  </button>
                </div>
              </details>}
              <details className="source-picker">
                <summary>
                  <Icon name="file" />
                  Use saved material
                </summary>
                <div className="scope-content">
                  <p>
                    Include drafts and messy notes. The agent will reconcile them and show how they support the proposed changes.
                  </p>
                  {sources.data
                    ?.filter((s) => (s.preparedKind === "text" || s.image) && !/^Research Instrument\.pdf$/i.test(s.name))
                    .map((s) => (
                      <label className="check-row" key={s.id}>
                        <input
                          type="checkbox"
                          checked={contextSources.includes(s.id)}
                          disabled={
                            a.busy ||
                            !!running ||
                            (!contextSources.includes(s.id) &&
                              contextSources.length >= 25)
                          }
                          onChange={(e) =>
                            setContextSources((items) =>
                              e.target.checked
                                ? [...items, s.id]
                                : items.filter((id) => id !== s.id),
                            )
                          }
                        />
                        {s.name}
                      </label>
                    ))}
                </div>
              </details>
            </div>
            <button
              className="send-button"
              type="submit"
              disabled={!text.trim() || a.busy}
              aria-label={running ? "Send guidance" : "Send manuscript request"}
            >
              <Icon name="send" />
            </button>
          </div>
        </form>
        <p className="composer-footnote">
          {running ? "You can send guidance while SolAir works. Delivery is shown beside your message." : "Enter to send · Shift+Enter for a new line. Read the proposed batch before approving."}
        </p>
      </div>
    </div>
  );
}
