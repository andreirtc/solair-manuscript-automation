import { chromium } from "playwright";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
const out = ".local/acceptance/visual-refresh";
const b = await chromium.launch({
  executablePath:
    process.env.SOLAIR_CHROME ||
    "/home/ralphandreicastillo326/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome",
  headless: true,
  args: ["--no-sandbox"],
});
const checks = [];
try {
  for (const width of [1440, 390])
    for (const theme of ["light", "dark"]) {
      const c = await b.newContext({
          viewport: { width, height: width === 390 ? 844 : 1000 },
          colorScheme: theme,
        }),
        p = await c.newPage();
      const errors = [];
      p.on("pageerror", (e) => errors.push(e.message));
      await p.route("**/api/v1/**", async (r) => {
        const path = new URL(r.request().url()).pathname.replace("/api/v1", "");
        let data;
        if (path === "/auth/status")
          data = {
            enabled: true,
            configured: true,
            memberLimit: 4,
            actor: {
              id: "qa",
              name: "QA member",
              username: "qa",
              role: "editor",
              slot: 2,
            },
          };
        else if (path === "/manuscript")
          data = { documentId: "qa-fixture", tabId: "qa-tab" };
        else if (path === "/manuscript/sections") data = { sections: [] };
        else if (path === "/jobs") data = [];
        else
          return r.fulfill({
            status: 404,
            contentType: "application/json",
            body: JSON.stringify({ error: { message: "Unmocked " + path } }),
          });
        await r.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data }),
        });
      });
      await p.goto(
        (process.env.SOLAIR_QA_ORIGIN || "http://127.0.0.1:4781") + "/app/help",
      );
      await p
        .getByRole("heading", {
          name: "A little guidance. A clearer next step.",
        })
        .waitFor();
      const topic = p.locator(".help-topics details").first();
      assert(await topic.evaluate((el) => el.open));
      assert.equal(await topic.getByRole("listitem").count(), 6);
      assert.match(await topic.textContent(), /separate setup step/);
      assert.match(await topic.textContent(), /test duplicate/i);
      await topic.locator("summary").click();
      assert.equal(await topic.evaluate((el) => el.open), false);
      await topic.locator("summary").click();
      await p.evaluate(async () => {
        await document.fonts.ready;
        document.activeElement?.blur?.();
        window.scrollTo({ top: 0, behavior: "instant" });
      });
      await p.waitForTimeout(100);
      assert(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      assert.deepEqual(errors, []);
      await p.screenshot({
        path: out + "/help-" + width + "-" + theme + ".png",
        fullPage: true,
      });
      checks.push(
        width +
          "px " +
          theme +
          ": invited-member Help access, six-step team guide, activation boundary, working disclosures, no overflow",
      );
      await c.close();
    }
  writeFileSync(
    out + "/help-result.json",
    JSON.stringify(
      {
        at: new Date().toISOString(),
        scope: "Synthetic signed-in member, no real account or Google writes",
        checks,
      },
      null,
      2,
    ),
  );
  console.log({ checks: checks.length });
} finally {
  await b.close();
}
