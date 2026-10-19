import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
const maintained = process.env.SOLAIR_QA_MAINTAINED === "1";
const out = ".impeccable/review/editor-upgrade",
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
        else if (path === "/jobs") data = [];
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
      await p
        .getByRole("heading", { name: "Working manuscript plan" })
        .waitFor();
      assert.equal(
        await p
          .getByLabel("Work on the manuscript", { exact: true })
          .inputValue(),
        "reconcile_sources",
      );
      await capture(p, "plan", width, theme);
      await p
        .locator("#message-input")
        .fill("Discuss the unresolved setup without making an edit job");
      await p.locator(".send-button").click();
      await p
        .getByText("Discuss the unresolved setup without making an edit job", {
          exact: true,
        })
        .waitFor();
      const sent = requests.find((r) => r.path.endsWith("/messages"));
      assert.deepEqual(sent.body.contextSourceIds, [sourceId]);
      assert.equal(sent.body.task, "reconcile_sources");
      await p.getByRole("button", { name: "Inspect & map source" }).click();
      await p.getByRole("heading", { name: source.name }).waitFor();
      assert.equal(await p.getByRole("combobox").inputValue(), sid);
      await p.getByRole("button", { name: "Read source text" }).click();
      await p.locator(".source-readable table").waitFor();
      await p
        .getByRole("checkbox", { name: /I inspected this exact source/ })
        .click();
      await p.waitForFunction(() =>
        document.body.textContent.includes("Your source review was recorded"),
      );
      await p
        .getByRole("button", { name: "Read source text", exact: true })
        .click();
      await p.locator(".source-readable table").waitFor();
      await capture(p, "source", width, theme);
      await p.goto(origin + "/app");
      await p
        .getByRole("heading", { name: "Working manuscript plan" })
        .waitFor();
      await p
        .getByRole("button", { name: "Prepare request from this finding" })
        .click();
      assert.equal(await p.locator("#manuscript-task").inputValue(), "revise");
      assert.match(
        await p.locator("#message-input").inputValue(),
        /Prepare one small exact/,
      );
      await p.getByRole("button", { name: "Collect original figure" }).click();
      await p.getByRole("heading", { name: image.name }).waitFor();
      assert(
        await p.getByText("Synthetic publisher", { exact: true }).isVisible(),
      );
      assert.equal(
        await p
          .getByRole("checkbox", { name: /I inspected this exact source/ })
          .isChecked(),
        false,
      );
      await p.goto(origin + "/app/sources?source=" + csv.id);
      await p.getByRole("heading", { name: csv.name }).waitFor();
      await p
        .getByText("Review eligible response records", { exact: true })
        .click();
      await p
        .getByText("Synthetic genuine paired record", { exact: true })
        .waitFor();
      await p.getByLabel("Include these source row numbers").fill("2");
      await p
        .getByLabel("Explain eligibility and respondent groups")
        .fill(
          "Synthetic acceptance: the paired BEMAC record is genuine; exclude the TEST record. Record count is not participant count.",
        );
      await p
        .getByRole("checkbox", { name: /I checked these exact rows/ })
        .click();
      await p
        .getByRole("button", { name: "Save eligible records", exact: true })
        .click();
      await p
        .getByText(
          /Eligible records saved; other rows will not enter model context/,
        )
        .waitFor();
      assert.equal(csv.evidenceReviewed, false);
      await p
        .getByText("Synthetic genuine paired record", { exact: true })
        .waitFor();
      await capture(p, "forms", width, theme);
      await p.goto(origin + "/app/formatting");
      const instructions = p.getByText(
        "Read the school tab’s written instructions",
        { exact: true },
      );
      if (await instructions.count()) {
        await instructions.click();
        assert(
          await p
            .getByText("(6 SPACES BEFORE THE TITLE)", { exact: true })
            .isVisible(),
        );
      }
      assert(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      assert.deepEqual(errors, []);
      checks.push({
        width,
        theme,
        activeTarget: maintained ? "maintained" : "trial",
        retainedSourceFollowup: true,
        quotedPlan: true,
        sourceMappingSuggestion: true,
        semanticMarkdownPreview: true,
        deliberateSourceReview: true,
        originalFigureImport: true,
        deliberateFormsSelection: true,
        generatedImages: false,
        noActualWrites: true,
      });
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
