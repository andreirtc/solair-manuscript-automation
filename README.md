# SolAir Manuscript Automation

A self-hosted workspace for four-person, evidence-based Google Docs revision. It combines manuscript chat, source intake, exact before/after review, deliberate approval, backed-up native updates, activity history and PDF review.

## Stack

- React 19, TypeScript and Vite; custom CSS/SVG, light/dark themes and responsive layouts.
- Express backend, SQLite state and a guarded native Google Docs update engine.
- Separate managed ChatGPT/Codex workers for each team member. No paid API fallback or shared-account quota routing.
- Markdown and KaTeX rendering; PDF/DOCX/XLSX text extraction with explicit limitations.

## Build and checks

Use Node.js 24 or newer:

```bash
npm ci
npm run typecheck
npm run test:unit
npm run build
```

`npm run test:unit` runs the portable tests that require no private manuscript fixtures. The full `npm test` integration suite also requires the authorized project's private native-document fixtures under the parent project's `work/manuscript-automation/` directory. Those fixtures are intentionally not published. Browser QA scripts use synthetic APIs; configure `SOLAIR_CHROME` with an installed Chromium executable when needed.

## Run an already configured installation

```bash
npm run team:start
```

Open `http://127.0.0.1:4781/app`. The launcher also prints a temporary HTTPS team address. Keep the host awake and online. Use existing workspace credentials; each member separately connects their own ChatGPT account.

A fresh clone contains source code, not a configured account or running service. Team startup requires a private `.local/deployment/team.json`, four separately authorized workers, the local cloudflared executable, and an authorized Google connection. Never copy or publish cached account tokens to configure another member. See [deployment notes](deploy/README.md) and [API contracts](API.md).

The current application is scoped to the original SolAir document/tab allowlist. Changing document targets requires an explicit guarded configuration/code review and a duplicate trial; cloning the code does not grant Google Drive access. Do not expose the unauthenticated local mode or worker ports to the internet.

## Revision workflow

1. Sign into the team workspace and connect your own ChatGPT account.
2. Attach sources or select retained evidence; review extraction and source eligibility.
3. Discuss revisions in chat, optionally limiting chapters or sections.
4. Read the exact proposed changes and explicitly approve the batch.
5. The server checks source hashes and document revision, creates a backup and verifies native preservation after application.
6. Inspect the affected PDF pages before final printing.

Native Google Docs equations are preserved; formula editing remains a manual Google Docs step. Source extraction does not establish scientific accuracy, inspect every image or recalculate spreadsheet formulas. Human scientific and final layout review remain necessary.

## Private data

This publication excludes research manuscripts, source PDFs, respondent records, project-specific findings/assessment notes, private handoffs, account credentials, runtime databases, generated reports and prior private development history. Keep operator context, uploads and state outside Git. `.local/`, `.env*`, `deploy/context/`, build output and dependency directories are ignored.

The host supplies its own reviewed context files privately when deployment preparation requests them. Existing private installations retain their data and configuration; this repository does not activate scheduling or change manuscript permissions.

## Source layout

- `apps/web/`: interface, design documentation, original decorative assets and licensed fonts.
- `apps/server/`: authenticated API, sources, review, document and PDF workflows.
- `apps/worker/`: isolated personal AI workers.
- `packages/contracts/`: shared contracts.
- `packages/engine/`: scoped native update and preservation engine.
- `scripts/`: startup, diagnostics, tests and explicitly invoked acceptance utilities.
- `deploy/`: optional container and Apps Script bridge source; no running cloud server is implied.

Decorative illustration provenance and font licenses are retained in `apps/web/public/assets/`. `SOURCE_VERSION` records the local source checkpoint used for this clean publication. No general software license is granted by this README.
