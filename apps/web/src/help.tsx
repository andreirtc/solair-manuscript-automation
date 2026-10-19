import React from "react";
import { PageHead, Icon } from "./ui";
import { navigate } from "./main";
export function Help({ maintained = false }: { maintained?: boolean }) {
  return (
    <>
      <PageHead
        title="A little guidance. A clearer next step."
        description="The essentials for your first session and your team’s revision day."
      />
      <div className="help-start">
        <h2>Your first five minutes</h2>
        <ol>
          <li>
            <b>Join your workspace.</b> Use your own one-use invitation, name,
            username and password. Only the first owner needs the private setup
            key.
          </li>
          <li>
            <b>Connect your ChatGPT.</b> In Settings, open the official
            authorization page, enter the code, then check connections.
          </li>
          <li>
            <b>Choose a space.</b> Manuscript is for proposed edits; Defense
            coach, Questions and Prototype planning are for discussion. Branch
            copies a conversation into a new context. Choose a character in
            Chat; models and helper roles are under Agent & space options.
          </li>
          <li>
            <b>Ask naturally.</b> Describe what you need. Leave scope empty to
            let the agent find it, or choose a section/subsection.
          </li>
        </ol>
        <button className="button primary" onClick={() => navigate("/app")}>
          Start a conversation <Icon name="arrow" />
        </button>
      </div>
      <div className="help-topics">
        <details open>
          <summary>Team test: before real manuscript revisions</summary>
          <ol>
            <li>
              <b>Host and join.</b> Keep the laptop awake and online. Share the
              current Settings address and a different one-use invitation with
              each teammate. Test one phone on mobile data.
            </li>
            <li>
              <b>Connect individually.</b> Each member connects their own
              ChatGPT in Settings and checks connections. Workspace passwords
              and ChatGPT authorization are separate; there is no other-account
              fallback.
            </li>
            <li>
              <b>Try the discussion spaces.</b> Ask a Questions, Defense or
              Prototype question. Verify that answers arrive in the chosen space
              and that discussion does not create manuscript proposals.
            </li>
            <li>
              <b>Inspect the automated manuscript trial.</b> The developer trial
              checked a small formatting proposal, approval gate, backup, native
              result, exported PDF and restoration on the duplicate. Review its
              affected page; you do not need to repeat the technical test. Real
              revisions still require reading and approving every comparison.
            </li>
            <li>
              <b>Check shared history.</b> Another member should see the same
              conversation and activity with the correct actor. Anyone applying
              a proposal must record their own review first.
            </li>
            <li>
              <b>
                {maintained
                  ? "Check the active document."
                  : "Request manuscript activation."}
              </b>{" "}
              {maintained
                ? "Adviser manuscript is active. Old trial proposals cannot transfer; create and review fresh proposals for this copy."
                : "After the team trial passes, request adviser-review activation. The Test duplicate label means the submission manuscript is unchanged."}
            </li>
          </ol>
          <p>
            Report connection, review or verification failures before
            proceeding. Do not print the developer trial. Native formula
            corrections still happen directly in Google Docs, followed by
            refresh and PDF review.
          </p>
        </details>
        <details open>
          <summary>How a Google Docs update happens</summary>
          <p>
            Request → draft → validate → read each before/after comparison →
            approve → apply → inspect the PDF. The app checks the current
            revision, makes a backup and verifies native content. Approval never
            applies an update by itself.
          </p>
          <p>
            {maintained
              ? "Approved writes now go to the adviser-review manuscript. Each change still needs your explicit review and Apply action."
              : "Current writes go to the test duplicate. The adviser-review manuscript requires separate activation."}{" "}
            Finalized SOP and the school-reference tab stay protected.
          </p>
        </details>
        <details>
          <summary>Attach documents or pasted text in Chat</summary>
          <p>
            Select Attach for PDF, DOCX, XLSX, TXT, MD, CSV or JSON (20 MB per
            file, five attachments per message). Long clipboard pastes become
            Pasted text automatically; Paste text also works for shorter notes.
            Type what you want done, preview your attachment and send when
            ready. Press Enter to send or Shift+Enter for a new line.
          </p>
          <p>
            Attachments are saved in shared Sources. Detach removes one from
            your unsent message, not from the workspace. Discussion needs no
            section mapping. Manuscript proposals require inspecting, mapping
            and marking sources reviewed, then selecting them under Add
            evidence.
          </p>
          <p>
            XLSX reading includes sheet names, cell addresses, formulas and
            saved results, including labelled hidden sheets. It does not
            recalculate formulas, read charts or execute macros. Export old XLS
            files as XLSX or CSV first. Extraction reads text only, not figures,
            native equations or page layout. Scanned PDFs need an OCR
            transcription you check yourself. Maximum extraction: 200,000
            characters and 250 PDF pages. Each answer receives up to 20,000
            characters per attachment, 50,000 total; use smaller excerpts for
            longer material. Attach to the current message again when switching
            model/member or starting a branch that needs it.
          </p>
        </details>
        <details>
          <summary>Models, helper roles and spaces</summary>
          <p>
            The model chooser lists models advertised by your own connected
            Codex runtime. Your plan or quota may still reject a model; no other
            account or paid API is substituted. GPT‑6.1 Sol / High is the
            default. Higher effort can take longer; it does not guarantee
            correctness.
          </p>
          <p>
            My AI allowance in Chat and Settings shows your own account's
            reported percentage left and reset times. It refreshes every minute
            and after a request; open it for details. Missing data is labelled
            unavailable. Lower reasoning does not reset an exhausted limit. Load
            your models, choose a model and set Reasoning to change the effort.
          </p>
          <p>
            Search the web when useful is on by default. The agent can
            independently search public sources, open pages and cite findings.
            Live research activity shows reported searches and opened pages;
            completed answers retain that activity and the model/reasoning
            setting. You can turn research off for a context-only answer. Shell
            commands, connector execution and direct document writes remain
            unavailable to the conversational agent.
          </p>
          <p>
            Roles focus the same protected agent: Thesis editor, Equation
            reviewer, Evidence checker, Defense coach, Questions or Prototype
            planner. They are not separate subscriptions or custom GPTs.
            Discussion spaces cannot create manuscript proposals.
          </p>
          <p>
            Spaces and branches separate discussions, not Google Docs copies or
            Git worktrees. Your team shares the same document, reviewed sources
            and history. A branch does not apply copied proposals again.
          </p>
        </details>
        <details>
          <summary>Prototype planning and DP1 decisions</summary>
          <p>
            We are developing the prototype and still choosing what to
            demonstrate for DP1. Use a Prototype planning space to compare
            system designs, troubleshoot problems and discuss conceptual wiring
            or schematics. Bring exact component models, ratings, pinouts,
            datasheets and measurements. Plans and diagrams remain proposals
            until checked against the real hardware; they are not evidence that
            a test happened.
          </p>
        </details>
        <details>
          <summary>Give a useful revision request</summary>
          <p>
            “Clarify the research instrument description using the selected
            evidence. Preserve our methodology and finalized SOP. Explain
            important removals before proposing them.”
          </p>
          <p>
            For defense: “Ask me about our assumptions, point out unsupported
            claims, and help me explain the limitations without inventing
            results.”
          </p>
        </details>
        <details>
          <summary>What each tool does</summary>
          <dl>
            <dt>Sources</dt>
            <dd>
              Upload or scan the designated Drive folder, inspect the exact
              material, choose a section and mark it reviewed. Scanning never
              applies an update.
            </dd>
            <dt>School formatting</dt>
            <dd>
              Compare supported paragraphs with the school sample and prepare
              reviewable repairs. Inspect figures, tables and page breaks in the
              PDF.
            </dd>
            <dt>Equations</dt>
            <dd>
              Inventory and discuss native formulas. Edit the formula itself in
              Google Docs, then refresh. The app can revise supported
              explanatory text while preserving formulas.
            </dd>
            <dt>Print review</dt>
            <dd>
              Export one PDF, exclude template/test content and inspect the
              exact pages. Save approved PDF keeps the reviewed version. Open
              that one file and choose 4 copies in your printer settings.
            </dd>
            <dt>History</dt>
            <dd>
              See requests, approvals, actors, verification and backups. Pending
              PDF review is not a completed layout check.
            </dd>
          </dl>
        </details>
        <details>
          <summary>Working together and recovering</summary>
          <p>
            The host laptop must stay awake, online and running. The temporary
            team address may change after restart. Invite codes last 24 hours
            and reserve a place until used or expired; they do not use AI
            allowance.
          </p>
          <p>
            Cloudflare error 1033 means the host’s tunnel is disconnected. The
            host should check its internet, keep the app running, allow 30
            seconds for reconnection, then refresh the current team address.
            Different Wi-Fi or mobile-data networks are fine; no new account is
            needed.
          </p>
          <p>
            If the model is unavailable, check your personal connection or
            choose another advertised model. If the document changed, refresh
            and validate again. If an update was interrupted, inspect its saved
            status and run dry-run recovery before retrying.
          </p>
          <p>
            Check facts, citations, measurements and calculations against real
            evidence. Preservation checks do not establish scientific truth.
            Gantt and SolAir software integration are future work.
          </p>
        </details>
      </div>
    </>
  );
}
