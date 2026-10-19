import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
const out = ".local/acceptance/redesign";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath:
    process.env.SOLAIR_CHROME ||
    "/home/ralphandreicastillo326/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome",
  headless: true,
  args: ["--no-sandbox"],
});
const errors = [],
  checks = [];
const origin = process.env.SOLAIR_QA_ORIGIN || "http://127.0.0.1:4781";
try {
  for (const width of [1440, 390])
    for (const theme of ["light", "dark"]) {
      const context = await browser.newContext({
        viewport: { width, height: width === 390 ? 844 : 1000 },
        colorScheme: theme,
      });
      const page = await context.newPage();
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(origin);
      await page
        .getByRole("heading", {
          name: "A clearer manuscript. A calmer defense.",
        })
        .waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => {
        document.activeElement?.blur?.();
        document.documentElement.style.scrollBehavior = "auto";
        window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      });
      await page.waitForFunction(
        () => scrollY === 0 && document.activeElement === document.body,
      );
      await page.waitForTimeout(100);
      for (const scene of await page.locator(".tour-scene").all())
        await scene.scrollIntoViewIfNeeded();
      await page.waitForTimeout(650);
      await page.evaluate(() =>
        window.scrollTo({ top: 0, behavior: "instant" }),
      );
      await page.screenshot({
        path: `${out}/landing-${width}-${theme}.png`,
        fullPage: true,
      });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "Landing overflow",
      );
      await page.getByRole("button", { name: "Enter your workspace" }).click();
      await page
        .getByRole("heading", { name: /Create your workspace|Welcome back/ })
        .waitFor();
      await page.evaluate(() => {
        document.activeElement?.blur?.();
        document.documentElement.style.scrollBehavior = "auto";
        window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      });
      await page.waitForFunction(
        () => scrollY === 0 && document.activeElement === document.body,
      );
      await page.waitForTimeout(100);
      await page.screenshot({
        path: `${out}/signin-${width}-${theme}.png`,
        fullPage: true,
      });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "Sign-in overflow",
      );
      checks.push(`Real server landing → setup form, ${width}px ${theme}`);
      await context.close();
    }
  const actor = {
    id: "qa-actor",
    name: "Test Reviewer",
    username: "qa",
    role: "owner",
    slot: 1,
  };
  const sid = "a".repeat(20),
    jid = "11111111-1111-4111-8111-111111111111",
    tid = "22222222-2222-4222-8222-222222222222",
    sourceId = "33333333-3333-4333-8333-333333333333";
  const sections = [
    {
      id: sid,
      title: "Description of Research Instrument",
      kind: "subsection",
      level: 3,
      path: [
        "Chapter 3",
        "Research Instrument",
        "Description of Research Instrument",
      ],
      start: 1,
      end: 20,
      readOnly: false,
      containsProtected: false,
      paragraphCount: 2,
      children: [],
    },
  ];
  let job = {
    id: jid,
    request: "Synthetic QA revision: clarify the instrument description",
    status: "dry_run_ready",
    target: "trial",
    baseRevision: "qa-r1",
    operations: [],
    sourceIds: [],
    proposedChanges: [],
    blockers: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    origin: "qa_fixture",
    createdBy: actor,
    review: {
      hash: "b".repeat(64),
      revision: "qa-r1",
      status: "needs_review",
      riskFlags: ["important_wording_change"],
      requiresNotes: true,
      changes: [
        {
          id: "c".repeat(20),
          type: "replace_text",
          sectionPath: sections[0].path,
          before: "Synthetic text: the instrument proved every result.",
          after:
            "Synthetic text: the instrument records measurements for analysis.",
          removedText: "proved every result",
          evidence: "Synthetic fixture only. No real research claims.",
          riskFlags: ["important_wording_change"],
        },
      ],
    },
  };
  let source = {
    id: sourceId,
    name: "Synthetic QA notes.txt",
    mime: "text/plain",
    origin: "upload",
    status: "needs_mapping",
    evidenceReviewed: false,
    createdAt: new Date().toISOString(),
  };
  let thread = {
    id: tid,
    title: "QA conversation",
    createdAt: new Date().toISOString(),
    messages: [],
  };
  let candidate;
  const bodies = [];
  for (const width of [1440, 390])
    for (const theme of ["light", "dark"]) {
      const context = await browser.newContext({
        viewport: { width, height: width === 390 ? 844 : 1000 },
        colorScheme: theme,
      });
      const page = await context.newPage();
      page.on("pageerror", (e) => errors.push(e.message));
      await page.route("**/api/v1/**", async (route) => {
        const req = route.request(),
          path = new URL(req.url()).pathname.replace("/api/v1", ""),
          method = req.method();
        let data;
        let b = {};
        try {
          b = req.postDataJSON() || {};
        } catch {}
        if (method !== "GET") bodies.push({ path, method, body: b });
        if (path === "/auth/status")
          data = {
            enabled: true,
            configured: true,
            memberLimit: 4,
            actor,
            publicOrigin: "https://example.trycloudflare.com",
            allMembersMayApply: true,
          };
        else if (path === "/manuscript")
          data = {
            documentId: "qa-fixture",
            tabId: "qa-tab",
            readState: "cached_snapshot",
          };
        else if (path === "/manuscript/sections") data = { sections };
        else if (path === "/jobs") data = [job];
        else if (path === `/jobs/${jid}/review`) {
          assert.equal(b.previewHash, job.review.hash);
          assert.deepEqual(b.acknowledgedChangeIds, ["c".repeat(20)]);
          assert(b.notes.length >= 30);
          job = { ...job, review: { ...job.review, status: "approved" } };
          data = job;
        } else if (path === `/jobs/${jid}/apply`) {
          assert(req.headers()["idempotency-key"]);
          assert.equal(b.baseRevision, "qa-r1");
          job = {
            ...job,
            status: "needs_layout_review",
            verification: {
              native: true,
              layout: "pending",
              revision: "qa-r2",
            },
          };
          data = job;
        } else if (path === `/jobs/${jid}`) data = job;
        else if (path === "/ai/models")
          data = [
            {
              model: "qa-model",
              label: "QA model",
              efforts: ["medium", "high"],
            },
          ];
        else if (path === "/sources")
          data = method === "POST" ? source : [source];
        else if (path === `/sources/${sourceId}/text`)
          data = {
            text: "Synthetic QA evidence only. This text demonstrates preview gating.",
            sha256: "d".repeat(64),
          };
        else if (path === `/sources/${sourceId}`) {
          source = {
            ...source,
            ...b,
            status: b.evidenceReviewed
              ? "mapped_reviewed"
              : "needs_evidence_review",
          };
          data = source;
        } else if (path === "/chat/threads") {
          if (method !== "GET")
            thread = {
              ...thread,
              purpose: b.purpose || "manuscript",
              messages: [],
            };
          data = method === "GET" ? [thread] : thread;
        } else if (path === `/chat/threads/${tid}/fork`) {
          thread = { ...thread, title: b.title, branchedFrom: tid };
          data = thread;
        } else if (path === `/chat/threads/${tid}/messages`) {
          assert.equal(b.scope, "general");
          assert.deepEqual(b.sectionIds, []);
          assert.deepEqual(b.ai, { model: "qa-model", effort: "medium" });
          assert.equal(
            b.helperRole,
            thread.purpose === "prototype" ? "prototype" : "equations",
          );
          thread = {
            ...thread,
            messages: [
              {
                id: "u",
                role: "user",
                text: b.text,
                status: "complete",
                createdAt: new Date().toISOString(),
              },
              {
                id: "a",
                role: "assistant",
                text: "Synthetic QA answer. Read the proposed changes before applying.",
                status: "complete",
                ...(thread.purpose === "prototype" ? {} : { jobId: jid }),
                createdAt: new Date().toISOString(),
              },
            ],
          };
          data = { status: "accepted" };
        } else if (path === `/chat/threads/${tid}`) data = thread;
        else if (path === "/activity")
          data = [
            {
              id: "qa",
              at: new Date().toISOString(),
              kind: "qa",
              message: "Synthetic QA activity; no manuscript writes.",
              origin: "qa_fixture",
              actor,
            },
          ];
        else if (path === "/backups") data = [];
        else if (path === "/team/members") data = [actor];
        else if (path === "/connections" || path === "/connections/check")
          data = {
            codex: { status: method === "POST" ? "connected" : "not_checked" },
            google: { status: "not_checked" },
          };
        else if (path === "/manuscript/equations")
          data = {
            nativeCount: 1,
            equations: [
              {
                id: "qa-eq",
                label: "Display equation",
                isStandalone: true,
                readOnly: false,
                sectionPath: ["Chapter 2", "Wind Energy"],
                surroundingText:
                  "Synthetic QA context [native equation]. No formula correctness is implied.",
                manualEditGuidance:
                  "Native formulas need editing in Google Docs.",
              },
            ],
          };
        else if (path === "/manuscript/layout")
          data = {
            profile: { captionPlacement: "above_image" },
            issues: [],
            pageIssues: [],
          };
        else if (path === "/manuscript/print-readiness")
          data = {
            requiredChecks: [
              {
                id: "scope",
                label: "Only intended manuscript pages are included.",
              },
              {
                id: "facts",
                label: "Equations and claims match reviewed evidence.",
              },
            ],
            requiredPhysicalCopies: 4,
          };
        else if (path === "/manuscript/prepare-print-pdf") {
          candidate = {
            id: jid,
            revisionId: "qa-r1",
            sha256: "e".repeat(64),
            pageCount: 12,
            letterPages: 12,
            fileSizeBytes: 1024,
            url: "/qa-only-pdf",
          };
          data = candidate;
        } else if (path === `/manuscript/print-candidates/${jid}/extract`) {
          assert.deepEqual(b, { from: 3, to: 12 });
          candidate = {
            ...candidate,
            pageCount: 10,
            letterPages: 10,
            sourcePageRange: b,
          };
          data = candidate;
        } else if (path === "/manuscript/freeze-print-pdf") {
          assert.equal(b.candidateId, jid);
          assert(b.notes.length >= 30);
          assert.equal(b.acknowledgedChecks.length, 2);
          data = { frozen: true };
        } else
          return route.fulfill({
            status: 404,
            contentType: "application/json",
            body: JSON.stringify({
              error: { message: "Unmocked QA route " + path },
            }),
          });
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data, requestId: "qa" }),
        });
      });
      source = { ...source, evidenceReviewed: false, status: "needs_mapping" };
      thread = { ...thread, messages: [] };
      job = {
        ...job,
        status: "dry_run_ready",
        review: { ...job.review, status: "needs_review" },
      };
      await page.goto(origin + "/app");
      await page
        .getByRole("heading", { name: "What shall we make clearer?" })
        .waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.getByText("Agent & space options", { exact: true }).click();
      await page.getByLabel("New space").selectOption("prototype");
      await page.getByLabel("New space").selectOption("manuscript");
      await page.getByLabel("Helper role").selectOption("equations");
      await page.getByRole("button", { name: "Load my models" }).click();
      await page
        .getByRole("option", { name: "QA model", exact: true })
        .waitFor({ state: "attached" });
      await page.getByLabel(/^Model/).selectOption("qa-model");
      await page.getByLabel(/^Reasoning/).selectOption("medium");
      await page.screenshot({
        path: `${out}/agent-options-${width}-${theme}.png`,
        fullPage: true,
      });
      await page.getByText("Agent & space options", { exact: true }).click();
      await page.evaluate(() => {
        document.activeElement?.blur?.();
        document.documentElement.style.scrollBehavior = "auto";
        window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      });
      await page.waitForFunction(
        () => scrollY === 0 && document.activeElement === document.body,
      );
      await page.waitForTimeout(100);
      await page.screenshot({
        path: `${out}/chat-${width}-${theme}.png`,
        fullPage: true,
      });
      await page
        .getByRole("textbox", { name: "Your manuscript request" })
        .fill(
          "Clarify our instrument description using only the reviewed evidence.",
        );
      await page
        .getByRole("button", { name: "Send manuscript request" })
        .click();
      await page
        .getByRole("button", { name: "Read the proposed changes" })
        .waitFor();
      await page.getByRole("button", { name: "Branch conversation" }).click();
      await page.getByText("Branched conversation", { exact: true }).waitFor();
      assert.equal(bodies.at(-1).path, `/chat/threads/${tid}/fork`);
      await page
        .getByRole("button", { name: "New conversation", exact: true })
        .click();
      await page.getByText("Agent & space options", { exact: true }).click();
      await page.getByLabel("New space").selectOption("prototype");
      assert.equal(
        await page.getByLabel("Helper role").inputValue(),
        "prototype",
      );
      assert(await page.getByLabel("Helper role").isDisabled());
      await page.getByText("Agent & space options", { exact: true }).click();
      await page
        .getByRole("textbox", { name: "Your manuscript request" })
        .fill("Help us decide our DP1 demonstration.");
      await page
        .getByRole("button", { name: "Send manuscript request" })
        .click();
      await page
        .getByText(
          "Synthetic QA answer. Read the proposed changes before applying.",
          { exact: true },
        )
        .waitFor();
      assert.equal(
        await page
          .getByRole("button", { name: "Read the proposed changes" })
          .count(),
        0,
      );
      assert(
        bodies.some(
          (v) => v.path === "/chat/threads" && v.body.purpose === "prototype",
        ),
      );
      await page.goto(origin + "/app/review?job=" + jid);
      await page.getByRole("heading", { name: job.request }).waitFor();
      const approve = page.getByRole("button", {
        name: "Approve this exact proposal",
      });
      assert(await approve.isDisabled());
      await page.evaluate(() => {
        document.activeElement?.blur?.();
        document.documentElement.style.scrollBehavior = "auto";
        window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      });
      await page.waitForFunction(
        () => scrollY === 0 && document.activeElement === document.body,
      );
      await page.waitForTimeout(100);
      await page.screenshot({
        path: `${out}/review-${width}-${theme}.png`,
        fullPage: true,
      });
      await page
        .getByLabel(
          "I read this change, including its removals and supporting evidence.",
        )
        .check();
      assert(await approve.isDisabled());
      await page
        .getByLabel(/Explain your review/)
        .fill(
          "I checked the synthetic removal and its evidence; this is only a QA fixture.",
        );
      await approve.click();
      const apply = page.getByRole("button", {
        name: "Apply approved update to test duplicate",
      });
      await apply.waitFor();
      await apply.click();
      await page
        .getByRole("heading", { name: "Check the printed layout" })
        .waitFor();
      for (const [path, title] of [
        ["sources", "Give revisions solid ground."],
        ["equations", "Make the hard parts explainable."],
        ["formatting", "Keep the school’s layout in view."],
        ["print", "The final read before print."],
        ["settings", "Your account. Your team."],
        ["history", "Every revision has a story."],
        ["help", "A little guidance. A clearer next step."],
      ]) {
        await page.goto(origin + "/app/" + path);
        await page.getByRole("heading", { name: title }).waitFor();
        assert(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          path + " overflow",
        );
        if (path === "sources") {
          await page
            .getByRole("button", { name: /Synthetic QA notes/ })
            .click();
          const review = page.getByLabel(/I inspected this exact source/);
          assert(await review.isDisabled());
          await page.getByRole("button", { name: "Read source text" }).click();
          await page
            .getByText("Synthetic QA evidence only.", { exact: false })
            .waitFor();
          await page
            .getByLabel("Relevant chapter, section or subsection")
            .selectOption(sid);
          await review.click();
          await page
            .getByRole("status")
            .getByText("Your source review was recorded.", { exact: false })
            .waitFor();
        }
        if (path === "print") {
          await page
            .getByRole("button", { name: "Prepare current PDF" })
            .click();
          await page
            .getByRole("heading", { name: "12 pages in this candidate" })
            .waitFor();
          const freeze = page.getByRole("button", {
            name: "Save approved PDF",
          });
          assert(await freeze.isDisabled());
          await page
            .getByText("Select manuscript page range", { exact: true })
            .click();
          await page.getByLabel("First PDF page").fill("3");
          await page
            .getByRole("button", { name: "Prepare these pages" })
            .click();
          await page
            .getByRole("heading", { name: "10 pages in this candidate" })
            .waitFor();
          await page
            .getByLabel("Only intended manuscript pages are included.")
            .check();
          await page
            .getByLabel("Equations and claims match reviewed evidence.")
            .check();
          await page
            .getByLabel("Final review notes")
            .fill(
              "I inspected these synthetic QA PDF pages and checked the fixture content.",
            );
          await freeze.click();
          await page
            .getByText("Your approval is recorded.", { exact: false })
            .waitFor();
        }
        await page.evaluate(() => {
          document.activeElement?.blur?.();
          document.documentElement.style.scrollBehavior = "auto";
          window.scrollTo({ top: 0, left: 0, behavior: "instant" });
        });
        await page.waitForFunction(
          () => scrollY === 0 && document.activeElement === document.body,
        );
        await page.waitForTimeout(100);
        await page.screenshot({
          path: `${out}/${path}-${width}-${theme}.png`,
          fullPage: true,
        });
      }
      checks.push(
        `Fixture-only model/role selection → branch → Prototype discussion without job; exact review → separate apply; source/print/help gates, ${width}px ${theme}`,
      );
      await context.close();
    }
  assert.deepEqual(errors, []);
  writeFileSync(
    out + "/qa-result.json",
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        scope:
          "Real landing/setup server; synthetic browser API fixtures for protected views. No live user sign-ins or Google writes.",
        checks,
        consoleErrors: errors,
        mutationContracts: bodies.map((x) => ({
          path: x.path,
          method: x.method,
        })),
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      checks: checks.length,
      consoleErrors: errors.length,
      screenshots: out,
    }),
  );
} finally {
  await browser.close();
}
