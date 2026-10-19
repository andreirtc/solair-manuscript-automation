import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
const maintained = process.env.SOLAIR_QA_MAINTAINED === "1";
const out = ".impeccable/review/conversation",
  origin = process.env.SOLAIR_QA_ORIGIN || "http://127.0.0.1:4781";
mkdirSync(out, { recursive: true });
const b = await chromium.launch({
  executablePath:
    process.env.SOLAIR_CHROME ||
    "/home/ralphandreicastillo326/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome",
  headless: true,
  args: ["--no-sandbox"],
});
async function capture(page, kind, width, theme) {
  await page.evaluate(async () => {
    document.body.tabIndex = -1;
    document.body.focus({ preventScroll: true });
    window.scrollTo(0, 0);
    await new Promise((r) =>
      requestAnimationFrame(() => requestAnimationFrame(r)),
    );
  });
  await page.screenshot({
    path: `${out}/${kind}-viewport-${width}-${theme}.png`,
  });
  await page.screenshot({
    path: `${out}/${kind}-${width}-${theme}.png`,
    fullPage: true,
    style:
      ".composer-area{position:static!important}.mobile-nav{display:none!important}.sidebar{position:absolute!important;top:0!important;bottom:auto!important;height:100vh!important}.skip-link:not(:focus){visibility:hidden!important}",
  });
}
const checks = [];
try {
  for (const width of [1440, 390])
    for (const theme of ["light", "dark"]) {
      const c = await b.newContext({
          viewport: { width, height: width === 390 ? 844 : 1100 },
          colorScheme: theme,
        }),
        p = await c.newPage(),
        errors = [],
        requests = [];
      p.on("pageerror", (e) => errors.push(e.message));
      const sid = "a".repeat(20),
        aid = "b".repeat(20),
        tid = "22222222-2222-4222-8222-222222222222",
        sourceId = "33333333-3333-4333-8333-333333333333",
        imageId = "44444444-4444-4444-8444-444444444444",
        mid = "55555555-5555-4555-8555-555555555555";
      const sections = [
        {
          id: sid,
          title: "Description of Research Instrument",
          kind: "subsection",
          path: [
            "Chapter 3",
            "Research Instrument",
            "Description of Research Instrument",
          ],
          level: 3,
          start: 1,
          end: 20,
          readOnly: false,
          containsProtected: false,
          paragraphCount: 2,
          children: [],
        },
      ];
      let source = {
        id: sourceId,
        name: "Synthetic messy notes.md",
        mime: "text/markdown",
        origin: "upload",
        preparedKind: "text",
        sha256: "a".repeat(64),
        evidenceReviewed: false,
        status: "needs_mapping",
        createdAt: new Date().toISOString(),
        provenance: { kind: "team_notes" },
      };
      const image = {
        id: imageId,
        name: "Synthetic original-source figure.png",
        mime: "image/png",
        image: { width: 10, height: 10, mime: "image/png" },
        origin: "upload",
        preparedKind: "image",
        evidenceReviewed: false,
        status: "needs_mapping",
        createdAt: new Date().toISOString(),
        provenance: {
          kind: "public_source",
          pageUrl: "https://publisher.example/study",
          locator: "Figure 2",
          attribution: "Synthetic publisher",
          reuse: "Unknown — check source",
        },
      };
      let csv = {
        id: "77777777-7777-4777-8777-777777777777",
        name: "Synthetic Forms.csv",
        mime: "text/csv",
        origin: "upload",
        preparedKind: "text",
        evidenceReviewed: false,
        status: "needs_mapping",
        createdAt: new Date().toISOString(),
      };
      let imported = false;
      let thread = {
        id: tid,
        title: "Synthetic consolidation",
        purpose: "manuscript",
        createdAt: new Date().toISOString(),
        contextSourceIds: [sourceId],
        messages: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            role: "user",
            text: "Consolidate our source notes",
            task: "reconcile_sources",
            sourceIds: [],
            status: "complete",
            createdAt: new Date().toISOString(),
          },
          {
            id: mid,
            role: "assistant",
            text: "This is synthetic browser acceptance. The seller claim remains separate from a measured result.",
            status: "complete",
            createdAt: new Date().toISOString(),
            workbench: {
              sourceBindings: { [sourceId]: "a".repeat(64) },
              manuscriptRevision: "synthetic-r1",
              findings: [
                {
                  statement: "Synthetic seller rating remains unmeasured",
                  kind: "seller_rating",
                  references: [
                    {
                      sourceId,
                      quote: "Wind listing: 300 W; no confirming label.",
                    },
                  ],
                  sectionIds: [sid],
                  disposition: "use_with_attribution",
                  rationale:
                    "A seller rating is not an observed continuous output.",
                },
              ],
              figures: [
                {
                  title: "Synthetic source visual candidate",
                  kind: "source_visual",
                  sectionId: sid,
                  anchorId: aid,
                  figureId: null,
                  sourceId: null,
                  pageUrl: "https://publisher.example/study",
                  imageUrl: "https://publisher.example/figure.png",
                  pageObserved: true,
                  locator: "Figure 2, original source",
                  caption: "Proposed synthetic caption",
                  attribution: "Synthetic publisher",
                  reuse: "Unknown — check original licence",
                  instructions: [
                    "Inspect the actual figure and source caption.",
                  ],
                  checks: ["Confirm source attribution and reuse permission."],
                },
                {
                  title: "Synthetic Chapter 3 block-diagram brief",
                  kind: "human_edit",
                  sectionId: sid,
                  anchorId: null,
                  figureId: null,
                  sourceId,
                  pageUrl: null,
                  imageUrl: null,
                  locator: "Team-supplied diagram, not inspected by the model",
                  caption: "Proposed conceptual system diagram",
                  attribution: "Team original, subject to confirmation",
                  reuse: "Team-owned original, confirm",
                  instructions: [
                    "Keep the existing solar and wind blocks separate.",
                    "Mark the unresolved wind charging connection as pending; do not draw an approved wiring connection.",
                  ],
                  checks: [
                    "Human verifies arrow directions and labels against the actual design.",
                    "Export PNG/JPEG and upload for deliberate replacement review.",
                  ],
                },
              ],
              nextSteps: [
                "Inspect the source, clarify the unresolved setup, then request a small draft.",
              ],
            },
          },
        ],
      };
      let job = { id: "88888888-8888-4888-8888-888888888888", sourceReviewMode: "proposal_review", status: "dry_run_ready", baseRevision: "fixture-revision", blockers: [], operations: [], sourceIds: [sourceId], review: { hash: "a".repeat(64), riskFlags: ["substantial_revision"], changes: [{ id: "a".repeat(20), type: "replace_text", sectionPath: ["Chapter 1", "Scope and Limitations"], before: "Synthetic: this study is limited to the first development milestone.", after: "Synthetic: this study covers the hybrid system design, development and evaluation. Planned testing remains subject to documented evidence.", removedText: "limited to the first development milestone", evidence: "Synthetic user-approved whole-study scope correction; messy notes source.", riskFlags: ["substantial_revision", "research_scope_or_method"] }] } };
      thread.messages[1].jobId = job.id;
      await p.addInitScript(
        ({ theme, tid }) => {
          localStorage.setItem("solair-theme", theme);
          sessionStorage.setItem("solair-current-thread", tid);
        },
        { theme, tid },
      );
      await p.route("**/api/v1/**", async (r) => {
        const req = r.request(),
          path = new URL(req.url()).pathname.replace("/api/v1", ""),
          method = req.method();
        let body = {};
        try {
          body = req.postDataJSON() || {};
        } catch {}
        if (method !== "GET") requests.push({ path, body });
        let data;
        if (path === "/auth/status")
          data = {
            enabled: true,
            configured: true,
            memberLimit: 4,
            actor: {
              id: "fixture-member",
              name: "Synthetic reviewer",
              role: "owner",
              slot: 1,
            },
            publicOrigin: origin,
            allMembersMayApply: true,
          };
        else if (path === "/manuscript")
          data = {
            documentId: "synthetic-trial",
            tabId: "synthetic-tab",
            writeMode: maintained ? "maintained_reviewed" : "trial_only",
          };
        else if (path === "/manuscript/sections") data = { sections };
        else if (path === "/jobs") data = [job];
        else if (path === `/jobs/${job.id}`) data = job;
        else if (path === `/jobs/${job.id}/approve-and-apply`) {
          assert.equal(body.acknowledged, true); assert.equal(body.previewHash, job.review.hash);
          job = {...job, status: "needs_layout_review", verification: {native:true,layout:"pending"}}; data=job;
        } else if (path === `/chat/threads/${tid}/guidance`) {
          thread.messages.push({id:"guidance",role:"user",text:body.text,status:"complete",guidance:"steered",createdAt:new Date().toISOString()}); data={delivery:"steered"};
        }
        else if (path === "/sources")
          data = imported ? [source, image, csv] : [source, csv];
        else if (path === `/sources/${csv.id}/table`)
          data = {
            tables: [
              {
                sheet: "CSV",
                headerRow: 1,
                columns: ["Respondent code", "Answer"],
                rows: [
                  {
                    row: 2,
                    values: ["1 and 2", "Synthetic genuine paired record"],
                  },
                  { row: 3, values: ["TEST", "Synthetic excluded record"] },
                ],
                totalRows: 2,
                previewPartial: false,
              },
            ],
          };
        else if (path === `/sources/${csv.id}/row-selection`) {
          assert.equal(body.rows, "2");
          csv = {
            ...csv,
            rowSelection: { sheet: body.sheet, rows: [2], notes: body.notes },
            reviewVersion: "rows-reviewed",
            evidenceReviewed: false,
          };
          data = csv;
        } else if (path === `/sources/${sourceId}/text`)
          data = {
            text: "# Synthetic notes\n\n| Claim | Status |\n| --- | --- |\n| 300 W | Seller listing only |\n\nWind listing: 300 W; no confirming label.",
          };
        else if (path === `/sources/${sourceId}`) {
          source = {
            ...source,
            ...body,
            reviewVersion: source.reviewVersion
              ? "second-review"
              : "first-review",
            status: body.evidenceReviewed
              ? "mapped_reviewed"
              : "needs_evidence_review",
          };
          data = source;
        } else if (path === "/sources/import-visual") {
          assert.equal(body.threadId, tid);
          assert.equal(body.messageId, mid);
          assert.equal(body.index, 0);
          imported = true;
          data = image;
        } else if (path === `/sources/${imageId}/image`)
          return r.fulfill({
            contentType: "image/png",
            body: readFileSync("../work/manuscript-automation/trial-image.png"),
          });
        else if (path === "/chat/threads") data = [thread];
        else if (path === `/chat/threads/${tid}`) data = thread;
        else if (path === `/chat/threads/${tid}/messages`) {
          thread = {
            ...thread,
            contextSourceIds: body.contextSourceIds,
            messages: [
              ...thread.messages,
              {
                id: "66666666-6666-4666-8666-666666666666",
                role: "user",
                text: body.text,
                task: body.task,
                sourceIds: body.sourceIds,
                status: "complete",
                createdAt: new Date().toISOString(),
              },
            ],
          };
          data = { status: "accepted" };
        } else if (path === "/ai/usage")
          data = {
            status: "unavailable",
            checkedAt: new Date().toISOString(),
            limits: [],
          };
        else if (path === "/manuscript/layout")
          data = {
            profile: {
              roles: {
                body: {
                  textStyle: {
                    weightedFontFamily: { fontFamily: "Arial" },
                    fontSize: { magnitude: 11 },
                  },
                  paragraphStyle: { lineSpacing: 200 },
                },
              },
              writtenInstructions: [
                {
                  start: 1,
                  text: "Insert Text (It should be Arial, 11, and double spaced)",
                },
                { start: 2, text: "(6 SPACES BEFORE THE TITLE)" },
              ],
              writtenConflicts: [],
              manualChecks: [
                "Inspect actual pagination and two full lines with subheadings.",
              ],
            },
            issues: [],
            pageIssues: [],
          };
        else
          return r.fulfill({
            status: 404,
            contentType: "application/json",
            body: JSON.stringify({
              error: { message: "Unmocked fixture " + path },
            }),
          });
        return r.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data }),
        });
      });
      await p.goto(origin + "/app");
      await p.getByRole("heading", {name: "Review this update"}).waitFor();
      assert.equal(await p.locator("#manuscript-task").inputValue(), "conversation");
      assert.equal(await p.getByRole("button", {name:"Inspect & map source"}).isVisible(), false);
      await capture(p, "proposal", width, theme);
      await p.getByRole("button", {name:"Approve and apply this batch"}).click();
      await p.getByRole("heading", {name:"Applied to the manuscript"}).waitFor();
      await capture(p, "applied", width, theme);
      thread.messages.push({id:"active",role:"assistant",text:"",status:"running",createdAt:new Date().toISOString(),progress:{phase:"Thinking through the request",actions:[]}});
      await p.reload();
      if(width === 390) { await p.getByRole("button",{name:"Add guidance",exact:true}).click(); assert(await p.locator("#message-input").evaluate(el=>el===document.activeElement)); }
      await p.locator("#message-input").fill("Keep the whole-study scope and include relevant SDGs");
      await p.getByRole("button", {name:"Send guidance"}).click();
      await p.getByText("Delivered to the active answer", {exact:true}).waitFor();
      await capture(p, "guidance", width, theme);
      assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.deepEqual(errors, []);
      checks.push({width,theme,inlineProposal:true,oneApproval:true,activeGuidance:true,defaultConversation:true,noManualMapping:true});
      await c.close();
    }
  writeFileSync(
    `${out}/browser-result.json`,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        scope:
          "Synthetic protected fixtures only; no real membership, AI inference or Google writes",
        checks,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ checks: checks.length }));
} finally {
  await b.close();
}
