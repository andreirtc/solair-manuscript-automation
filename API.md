# Implemented manuscript API v1

Base `/api/v1`. Successful envelopes: `{data, requestId}`. Errors: `{error:{code,message,retryable},requestId}`. The TypeScript shapes in `packages/contracts/index.ts` are authoritative. This replaces the earlier proposed contract v0.2.

Local mode accepts loopback Hosts. Team deployment additionally accepts only its configured HTTPS hostname/origin and requires an authenticated workspace session. Cross-site requests are rejected. Mutations require `X-SOLAIR-Client: web`; JSON uses `Content-Type: application/json`. The built client shares the backend origin. Vite proxies requests from port 5173. No permissive CORS or browser credential form is needed.

| Method / path                     | Request / result                                                                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| GET `/health`                     | Actual local-only policy and version                                                                                                        |
| GET `/connections`                | Last explicit connection check; `not_checked` after restart                                                                                 |
| POST `/connections/check`         | `{}`; checks managed sign-in, model catalog and a real trial Docs read                                                                      |
| GET `/manuscript`                 | Target identity, revision, live/cached read state, intended maintained identity                                                             |
| POST `/manuscript/refresh`        | `{}`; refresh trial document and validate tab/SOP boundaries                                                                                |
| GET `/manuscript/outline`         | Paragraph anchors with exact text, section, protected state and table-cell position                                                         |
| GET `/sources`                    | Persistent source intake records                                                                                                            |
| POST `/sources`                   | Multipart `file`, one file up to 20 MB; duplicate bytes reuse source record                                                                 |
| PATCH `/sources/:id`              | `{sectionId,evidenceReviewed}` (or legacy anchorId); protected/missing destinations rejected                                                                      |
| POST `/sources/scan-drive`        | `{}`; scan designated inbox for source metadata; report `added`, `scanned`, `partial`                                                       |
| GET `/jobs`                       | Persistent scoped update jobs                                                                                                               |
| POST `/jobs`                      | `{request,operations,sourceIds:[]}`; draft only; rejects extra/production target fields                                                     |
| GET `/jobs/:id`                   | Job, proposal, checks, blockers and backup                                                                                                  |
| POST `/jobs/:id/dry-run`          | `{}`; fetch current revision, plan safely; no writes                                                                                        |
| POST `/jobs/:id/apply`            | `{baseRevision}` plus `Idempotency-Key` (reuse job UUID); backup + guarded native batch + readback                                          |
| POST `/jobs/:id/export-pdf`       | `{}`; export only a still-current native-verified revision; returns local PDF URL                                                           |
| GET `/jobs/:id/pdf`               | Private PDF bytes from backend, never the connector's bearer download URL                                                                   |
| POST `/jobs/:id/layout-review`    | `{revision,notes}`; notes ≥10 chars, matching export/current revision; optional reviewer `user` (default) / `codex` for acceptance evidence |
| GET `/backups`                    | App-created backup links                                                                                                                    |
| GET `/automation`                 | Explicit inactive policy; user left Apps Script install off; manual Drive scan                                                              |
| PATCH `/automation`               | Always rejects with `SCHEDULING_DISABLED` in this release                                                                                   |
| GET `/chat/threads`               | App-owned conversation summaries; no provider IDs exposed                                                                                   |
| POST `/chat/threads`              | `{title?}`; creates persistent app conversation                                                                                             |
| GET `/chat/threads/:id`           | Saved messages, statuses and job links                                                                                                      |
| POST `/chat/threads/:id/messages` | `{text,sourceIds:[],scope?:"general"|"sections",sectionIds:[]}`; no selection defaults to automatic location; 202 accepted; never applies a proposal                                                                  |
| GET `/chat/threads/:id/events`    | SSE, `assistant.delta`, `assistant.completed`, `assistant.failed`; resume by Last-Event-ID or `?after=`                                     |
| GET `/activity`                   | Latest 200 app events plus explicitly historical imported evidence                                                                          |
| GET `/changes`                    | Current app job changes, verification, origin and backup                                                                                    |
| GET `/history/imported`           | Earlier independently verified historical batch, separate from app trial jobs                                                               |

SSE deltas are provider structured-output fragments, not ready-to-render prose. The starter displays a working indicator, then fetches the completed saved message. Do not render raw JSON tokens as the manuscript assistant's answer. No internal reasoning is exposed.

Operations:

```json
{
  "type": "replace_text",
  "before": "exact existing substring",
  "after": "replacement",
  "evidence": "User request or reviewed source ID"
}
```

Optional cell targeting is `{row:0,column:0,table_anchor?:"exact caption"}` (zero-based). Ambiguous replacement matches are blocked.

```json
{
  "type": "format_paragraph",
  "expected_text": "exact standalone paragraph",
  "paragraph_style": { "keepWithNext": true, "keepLinesTogether": true },
  "evidence": "User-requested formatting"
}
```

Validated formatting fields also include alignment, lineSpacing, spaceAbove/Below, indentFirstLine/Start/End, avoidWidowAndOrphan. Dimensions use `{magnitude,unit:"PT"}`. Never send raw Docs batch requests from the browser.

States: `draft`, `dry_run_ready`, `applying`, `needs_layout_review`, `complete`, `blocked`, `rejected`, `failed`. A lost write response or interrupted write becomes blocked pending marker/preservation reconciliation. Apply retries reuse the same job/key. A changed revision requires a fresh preview. `complete` requires recorded review of the still-current exported PDF.

Section IDs derive from their title/parent and survive index shifts. Paragraph IDs are internal exact-target metadata and may change after edits; the agent resolves them, never the user. Stale internal anchors block safely. Sources can map to a section/subsection. Uploaded sources remain unreviewed until explicitly mapped/reviewed. Chat refuses unreadable PDF/audio evidence. Reviewed PNG/JPEG sources supply metadata only; the drafting model cannot infer image contents.

Source evidence is frozen locally and hash-checked. For Drive Google Docs/text sources, POST `/sources/:id/prepare-text` first, then GET `/sources/:id/text` to display the exact snapshot for review. Preparation accepts at most 200,000 characters, extracts actual text without connector metadata/private download URLs, preserves table-cell labels and marks native objects for original-file inspection. It resets evidence review; an unprepared Drive file cannot be marked reviewed. A later Drive edit does not silently replace this snapshot: explicitly prepare again to use it. Uploaded text is already frozen and uses the same text-preview endpoint. AI receives at most 20,000 source characters per turn with an explicit coverage notice; this is not a full-source review claim.

Native Google Docs sources use the full Docs tab reader, not the best-effort generic text fetch. The local adapter maps the internal get_source_document action to Google's get_document. The hosted bridge first verifies direct inbox membership and native Docs MIME before reading all tabs; the ordinary get_document action remains limited to the trial. Large extracted sources are rejected rather than silently shortened; source evidence can be split into smaller reviewable files. This source-size limit is separate from the main manuscript reader and does not prevent reading/formatting the full manuscript.

Map and review sources **before creating a proposal**. Each job binds to their exact bytes, mapping and review version. Changing/re-preparing/re-reviewing any selected source requires a fresh proposal; refreshing the old preview does not rebind it. `SOURCE_CHANGED` / `SOURCE_PREPARATION_REQUIRED` are actionable conflicts, never an invitation to bypass review. The bindings are checked after AI drafting, at approval and again before the native write, including after backup.

No mock success is served by this backend. No credentials, authentication cache, internal provider thread IDs or Google export bearer URLs are part of the frontend interface.

## Team access and personal AI

Team mode is enabled in the current laptop deployment. Public access uses the approved Cloudflare tunnel through an authentication guard. The deterministic Google adapter may use the existing local Codex connector explicitly via localGoogleConnector; personal AI routes always use distinct member workers. Four real personal consents and phone acceptance remain pending. See LAPTOP-TEAM.md and CODEX-CONTINUE.md.

| Method / path            | Request / result                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| GET `/auth/status`       | Public: enabled/configured, current actor or null, four-member limit and individual-quota rule                    |
| POST `/auth/setup`       | `{key,name,username,password}`; once only, private bootstrap key, creates owner/session                           |
| POST `/auth/login`       | `{username,password}`; workspace sign-in, HttpOnly session cookie                                                 |
| POST `/auth/join`        | `{code,name,username,password}`; valid one-use invitation, creates editor/session                                 |
| POST `/auth/logout`      | `{}`; revokes this session and clears cookie                                                                      |
| GET `/team/members`      | Authenticated; public member identities/roles, no password hashes or credentials                                  |
| POST `/team/invitations` | `{}`; owner only, 24-hour one-use code; four-members-plus-reservations limit                                      |
| POST `/ai/login`         | `{}`; starts this member's isolated ChatGPT device-code authorization; returns loginId, verificationUrl, userCode |
| POST `/ai/login/cancel`  | `{loginId}`; cancels only this member's pending authorization                                                     |
| POST `/ai/logout`        | `{}`; disconnects only this member's AI worker and clears their provider bindings                                 |

Mutating public auth routes still require the same client header and origin protections. New names are 1–80 characters; usernames are 3–32 letters/digits/underscore/hyphen, normalized lowercase; new workspace passwords are 12–128 characters. These are separate from ChatGPT credentials. Session lasts 12 hours. Sign-in is rate-limited. In team mode all ordinary API routes, including health/PDF/events, require membership. SSE closes when its session is expired/revoked.

`/connections` and `/connections/check` are personal to the authenticated actor. Google access is the project adapter; AI access is that actor's worker. No account/model/quota fallback is allowed. Shared chats have separate server-only provider bindings per member. The browser cannot supply a provider thread, worker slot or author ID. Jobs expose createdBy/approvedBy/appliedBy/reviewedBy; messages/activity expose actor; sources expose uploadedBy/mappedBy. Older records may have no actor and must remain honestly unattributed.

Any authenticated member may preview, record their own deliberate proposal review, apply and record a PDF review. An owner role grants invitation management, not a monopoly on applying edits. Job/apply schemas reject browser-supplied attribution. A PDF review submitted in team mode records the actual member, regardless of the legacy local `reviewer` hint.

The private worker HTTP API is server-to-server only and is never a frontend integration target. Its credentials, Codex registration, provider IDs and logs must not enter the browser. The Google Apps Script bridge also remains server-to-server; it accepts signed scoped actions and replans writes against a fresh trial revision.


## Section, formatting and figure workflow

- GET `/manuscript/sections`: `{defaultScope:"general",label:"Let the agent find it",sections}`. Each node has id, title, parentId, children, path, kind and protection state. Empty selection locates the relevant sections automatically. GET outline remains internal compatibility metadata.
- GET `/manuscript/layout`: read-only profile sampled from the actual school tab, role-specific issues, page mismatches and excluded exceptions. POST `/manuscript/layout/proposal` with `{sectionIds:[]}` refreshes first and creates a draft of at most 25 scoped repairs, returning remaining issue count. It never applies automatically. Captions receive keep-with-next; body indents/exceptions are preserved.
- GET `/manuscript/figures`: captioned inline images with opaque figure id, caption, section path, dimensions and readOnly state. GET `/manuscript/figures/:id/image` proxies a private preview without returning Google's bearer URL; previously reviewed images are privately cached for history.
- GET `/manuscript/equations`: actual native-equation inventory and context. Constants/variable definitions are not guessed or certified. Counts refer to native objects; context entries group objects by paragraph. Native formula editing is unsupported; exact narrative text-run replacement is supported under preservation checks.
- GET `/manuscript/print-readiness`: actual school samples, required manual checks, pending/current frozen file and stale status. No historical page estimate becomes a verified final count. Captions are sampled Arial11/double-spaced above figures.
- POST `/manuscript/prepare-print-pdf` body `{}`: fresh revision-guarded download and PDF parser validation; returns immutable candidate `{id,revisionId,sha256,pageCount,letterPages,fileSizeBytes,url,...}`. Export failure never falls back to cached files.
- GET `/manuscript/print-candidates/:id/pdf`: authenticated exact candidate bytes with hash/provenance verification.
- POST `/manuscript/print-candidates/:id/extract` body `{from,to}`: inclusive1-based PDF page range; creates a new candidate and retains original. Current revision is checked before and after extraction.
- POST `/manuscript/freeze-print-pdf` body `{candidateId,revision,acknowledgedChecks,notes}`: exact current candidate, every unique required check ID, notes30–3000characters and fresh matching revision. Records actor/time/approval and immutable file identity. No silent print approval.
- GET `/manuscript/print-pdf`: authenticated bytes of the deliberately reviewed frozen file. Legacy cached “frozen” records without provenance are rejected. Later manuscript edits do not alter frozen bytes; readiness flags staleness.
- GET `/sources/:id/image`: private prepared PNG/JPEG bytes. POST `/sources/:id/prepare-image`: privately materialize a PNG/JPEG from the fixed Drive inbox; resets evidence review. PATCH source accepts exactly one of sectionId or internal anchorId and evidenceReviewed.
- POST `/jobs/:id/review`: `{previewHash,acknowledgedChangeIds:[...],notes}`. Every exact change ID is required, and wording/removal/figure risk needs ≥30-character notes. Approval belongs to the authenticated actor and exact revision/hash. Apply rejects missing/stale/another-member approval before backup/write.
- POST `/jobs/:id/reject`: `{reason}` (≥5 characters). No native write; rejected proposals cannot be reopened by dry run. A blocked job with an uncertain write returns `RECONCILE_REQUIRED`; dry-run reconciliation must check its atomic marker/preservation before rejection or retry. An applied update cannot be rejected.

`format_paragraph` can include hidden anchorId and text_style limited to Arial/11 pt. Only specified font fields change; emphasis remains. `replace_text` accepts hidden anchorId and preserves cell targeting. Font/alignment/spacing and caption repairs are proposals, with before/after review.

`insert_figure`: `{type,sourceId,anchorId,after_paragraph,caption,width_pt?,evidence}`. `replace_figure`: `{type,sourceId,figureId,caption,width_pt?,evidence}`. Captions follow `Figure N. ...`. Each figure is a separate job, with reviewed mapped source, exact current target, hash/aspect checks and sampled school styles. Replacement atomically deletes only the old inline-image character and inserts the new object, avoiding CENTER_CROP. It requires explicit removal review. Full text, unrequested formatting, reference/SOP, original native objects and exact asset markers are verified.

Local raw app-server image upload rewriting failed a live trial and is disabled. Orca's direct private upload was used for labeled developer engine acceptance only; it is not proof of the GUI transport. Hosted GoogleBridge, with explicit privateImageTrials enabled (default OFF), prepares a 256-bit bearer capability after review and backup, bound to source hash/job/revision/preview, expiring after five minutes or five reads and revoked after the write. Only Google fetches this URL; it is not returned to clients, listed, or used to change Drive sharing. GET `/private-transfer/:token` is the sole token-authorized media route before team-session auth; invalid/expired tokens reveal nothing. HTTPS/live bridge acceptance remains pending.

The cloud bridge uses Drive files.download for large PDF exports and keeps OAuth/download URLs server-side. The manuscript is approximately 13 MB as PDF, exceeding files.export's normal 10 MB limit. Official references: [files.download](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/download), [long-running downloads](https://developers.google.com/workspace/drive/api/guides/long-running-operations).

## Model selection and conversation spaces — October 16 extension

- GET `/ai/models`: authenticated, requesting actor's private worker only. Returns `[{model,label,efforts}]` from managed ChatGPT `model/list`, excluding hidden models/unsupported reasoning values. This does not run inference or certify quota entitlement.
- POST `/chat/threads`: optional `purpose`: `manuscript` (default), `defense`, `questions`, `prototype`; title ≤120 characters.
- POST `/chat/threads/:id/messages`: optional `helperRole`: `editor` (default), `equations`, `evidence`, `defense`, `questions`, `prototype`. Optional `ai:{model,effort}`; effort must be `low|medium|high|xhigh|max` and advertised for that model. Validated again by the personal worker before inference; runtime mismatch fails closed. No owner/paid fallback. Routing and drafting use the same selection. Message metadata retains the requested role/choice.
- POST `/chat/threads/:id/fork`: `{title}`. Copies completed messages with new IDs, same purpose and `branchedFrom`; never copies private provider identity. Failed/running messages are excluded. Existing job links refer to their original shared proposals, not replayed jobs.
- Non-manuscript spaces and discussion helper roles reject operation-bearing model output server-side before creating jobs. General prototype questions can continue from confirmed project context even if no manuscript section matches. The current phase is prototype development with unresolved DP1 design choices, not completed integrated testing.

Spaces are shared team conversation contexts, not document copies or Git worktrees. Each member/model/role binding remains private to its personal worker. Gantt/software integration is outside this extension.

Current laptop private HTTPS figure transport passed native and developer PDF trials; the older hosted GoogleBridge paragraph above remains a description of the separately unaccepted cloud adapter. No Oracle/Docker cloud deployment has passed. Production and scheduling remain off.

## Chat document attachments (October16)

POST `/chat/attachments`: authenticated multipart `file`, PDF/DOCX/TXT/MD/CSV/JSON, 20 MB each. Returns Source with preparedKind=text, extractionNotice, uploadSha256, originalSize and frozen text sha256. PDF/DOCX originals retained privately as `<id>.original`; text-only snapshots exposed via existing authenticated GET `/sources/:id/text`. Standard `/sources` upload also prepares supported text/documents. No public document URL, autoapproval, Drive write or inference on upload. Corrupt/encrypted/no-text/oversized/complexity/timeout documents return actionable failure. Extraction uses a subprocess with25 second timeout,128 MB JS heap,maximum 2 parsers; 250 PDF pages and 200,000 text characters. These are extraction bounds, not a complete OS sandbox or OCR.

POST `/chat/threads/:id/messages` accepts optional `attachmentIds` UUID array, maximum 5, default []. These persist on userMessage; snapshots are verified beforeacceptance and bound/rechecked across inference. Prepared text is untrusted context, limited20,000 characters/attachment and 50,000 total with explicit coverage. Context-only attachments must produce nooperations (enforced server-side). To permit proposals all attachedsources must be reviewed,mapped,and also included in sourceIds so existing proposal/source guards remain authoritative. Discussion remains read-only regardless. Same member's concurrent chat in anotherthread returns PERSONAL_AI_BUSY409 without appending/consuming inference; othermembers remainindependent. Worker409 distinguishes PERSONAL_SIGN_IN_PENDING and PERSONAL_AI_BUSY; oversized context returns PROMPT_TOO_LARGE413. No automatic retry, alternate account or API billing.

## Researched, structured answers and XLSX (October16)

Chat messages accept `research?: boolean` (default true). Automatic section routing stays offline; the final proposal/discussion turn gets built-in `web_search=live` when enabled. Shell/app/MCP connector execution remains disabled and the read-only sandbox verified; the deterministic service remains the only document writer. Default app choice resolves GPT‑6.1 Sol to the highest reasoning effort advertised by the requesting member's runtime. Explicit model/effort choices remain authoritative. Provider bindings include the research-policy version, model, effort and role; no private provider identity is returned.

Private worker `/propose` carries optional `research` and streams observed `research` actions. Assistant Message `ai` records the validated selection; `research` records enabled/search count/opened HTTPS page URLs. Routing does not generate fake research events. UI renders safe Markdown/GFM tables/math/citations with no raw HTML or remote image loads, and exposes actual metadata. Reasoning effort/research counts are configuration/activity, not accuracy certification or hidden chain-of-thought.

Uploads additionally accept XLSX. The isolated reader preserves sheet names/visibility, cell addresses, formula text and saved results; no recalculation, external-link/macro execution, chart/image/layout inspection. Maximum 100 sheets/20,000 nonempty cells, within existing 20 MB/200,000 character/ZIP expansion/time bounds. Original bytes and frozen snapshot hashes use the existing private storage/source-binding policy. XLS is unsupported; export XLSX/CSV. Spreadsheet extraction adds no workbook write or Gantt automation.

### Personal usage and assistant progress

`GET /ai/usage` requires the current workspace session and resolves only its personal worker. Returns `AccountUsage` with status, checkedAt and up to10 reported buckets (primary/secondary usedPercent, optional duration and Unix-second reset).30second per-actor cache; no shared ledger, account IDs, credit balances or inference. Unavailable does not mean zero usage. Personal sign-in/out invalidates the cache.

Assistant messages may include `progress: {phase, actions}`. Up to50 bounded public web actions have an item ID, label, optional HTTPS URL, start/completion status and timestamp. Started/completed events merge by item ID, with completed search calls counted once. `assistant.phase` SSE signals a fresh thread read; existing polling remains a fallback. Only coarse reasoning-item lifecycle stages are exposed, not raw/private reasoning content. Worker NDJSON adds progress and bounded public research action events; failed events carry an allowlisted public code/message.

Section routing provider sessions are separate from answer sessions. The routing pass always starts without a provider ID and cannot overwrite the member's answer binding. Existing answer bindings move to generationresearch-v3, preserving visible messages but not reusing previously offline-created tool context. Research/offline policy remains part of the answer binding.

## Source consolidation and adviser activation — 16 October 2026

`POST /chat/threads/:id/messages` accepts optional `task`: `revise` (default), `reconcile_sources`, `find_visuals`, `figure_brief`; optional `contextSourceIds` (true omission preserves thread context); and optional `analysisMessageId` referencing a validated saved source plan. Planning tasks return no operations/jobs. Sources in context do not become reviewed evidence. The response message may include `workbench`: exact quoted findings, suggested current section IDs, original-source candidates, human edit briefs, next steps, source-content bindings, native revision and server-owned document ID. A changed document/source invalidates drafting from the old plan.

`POST /sources/import-web` takes `pageUrl` and optional exact linked `imageUrl`, description, locator, attribution and reuse. `POST /sources/import-visual` takes `threadId`, `messageId`, `index`; imports only a saved source candidate whose source page was observed. Public fetch is bounded, HTTPS-only, credentials-free and public-address-pinned at every hop. Result is a private, frozen, unreviewed source. `GET /sources/:id/original` downloads hash-checked original bytes behind workspace authentication. `PATCH /sources/:id` additionally accepts description; source evidence approval remains explicit.

`GET /sources/:id/table` returns frozen CSV/TSV/XLSX sheets, header/source row coordinates and first100 nonempty records with totalRows/previewPartial. Rows are records, not participant counts. `POST /sources/:id/row-selection` takes `{sheet, rows:"2-9,12", notes:"eligibility explanation, at least30characters"}`. Header/unavailable rows and malformed/unbounded ranges are rejected. Saving resets evidence review/version. No individual responses enter model context until a valid selection exists; only selected rows then enter. Original and human preview still retain all rows. Changing selection invalidates prior proposal/source-plan bindings.

Host-only `TeamConfig.manuscriptMode` is `trial` (default) or `maintained`. Maintained selects only `1rgMme-k53PQdyBDcAi43mDfrCxrt2LJlIFU-fz5P7NM`, with existing manuscript/school tabs. It requires the verified local connector and startup native/SOP/layout checks; cloud bridge remains trial-scoped. `/manuscript` reports `writeMode:maintained_reviewed`, `productionWrites:true`, `originalWrites:false` only for maintained mode. No web endpoint changes target or enables scheduling. Jobs carry target/documentId; legacy jobs default to their historical trial ID. Cross-document preview/approval/apply/export/layout review and plan reuse fail409. New jobs still need exact human review and Apply. Backups use `SOLAIR app manuscript backup …` in maintained mode, preserving prior trial backups/history.


## Conversational revision contract (October 16 evening)

`POST /chat/threads/:id/messages` accepts task `conversation`. Frontend defaults to this even for retained older planning threads; omitted HTTP task remains legacy `revise` for compatibility. Known project revision files are retained automatically for manuscript spaces. Explicitly excluded unrelated instruments are omitted. Conversation context is durable/shared, while provider bindings remain per authenticated actor/model/policy/target. Full host standing brief is included; source data remains untrusted. Long-source coverage is explicit/partial.

Conversational jobs carry server-created `sourceReviewMode: "proposal_review"`. Supplied frozen source use is reviewed WITH exact changes, so these jobs need no pre-mapping/human-review flag. The server never flips evidenceReviewed. Hash/byte freshness, eligible tabular rows, target/scope, protected sections and native planner guards still apply. Preview is prepared automatically. Legacy jobs preserve their review requirements.

`POST /jobs/:id/approve-and-apply` accepts `{previewHash, baseRevision, acknowledged:true}` and `Idempotency-Key`. It records the authenticated actor’s acknowledgment of every exact displayed change, then calls guarded apply. Only proposal_review jobs use this route. No review essay is required; removed text/risk flags remain visible. Changed bytes/hash/revision block writes; backup/native preservation and PDF-pending semantics remain unchanged. Chat text alone never applies.

`POST /chat/threads/:id/guidance` accepts `{text}` during a running answer. Only its active actor may steer. User messages persist with guidance `delivering|steered|queued|following` plus guidanceFor. Delivery uses a private worker `/steer` forwarding exact provider/thread and expected active turn ID. Routing turns are never steered. Unsupported/ended/pre-main turns queue a following pass (at most ten explicit guidance messages per active answer); writes never auto-approve. Another member waits for the current answer, then continues through their own worker/quota. Failed turns preserve queued history rather than silently consuming more quota. Restart interrupts active answers honestly.
