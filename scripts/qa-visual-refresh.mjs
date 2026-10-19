import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
const out = ".local/acceptance/visual-refresh";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath:
    process.env.SOLAIR_CHROME ||
    "/home/ralphandreicastillo326/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome",
  headless: true,
  args: ["--no-sandbox"],
});
const origin = "http://127.0.0.1:4781";
const checks = [],
  errors = [];
async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images]
        .filter((i) => i.complete)
        .map((i) => i.decode().catch(() => {})),
    );
    document.activeElement?.blur?.();
    document.documentElement.style.scrollBehavior = "auto";
    window.scrollTo({ top: 0, behavior: "instant" });
  });
  await page.waitForTimeout(700);
}
async function noOverflow(page) {
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "No horizontal overflow",
  );
}
try {
  for (const [width, height] of [
    [1440, 1000],
    [1366, 768],
    [1920, 1080],
    [390, 844],
  ])
    for (const theme of ["light", "dark"]) {
      const context = await browser.newContext({
        viewport: { width, height },
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
      await settle(page);
      await noOverflow(page);
      assert(
        await page
          .getByRole("button", { name: "Enter your workspace" })
          .evaluate((el) => {
            const r = el.getBoundingClientRect();
            return r.top >= 0 && r.bottom <= innerHeight;
          }),
        "Entry action visible at arrival",
      );
      await page
        .getByRole("button", { name: "Pause preview", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Play preview", exact: true })
        .waitFor();
      for (const selector of [
        ".scene-character .role-character",
        ".revision-scene .air-travel",
        ".revision-scene .turbine-blades",
        ".revision-scene .solar-light i",
      ])
        assert.equal(
          await page
            .locator(selector)
            .first()
            .evaluate((el) => getComputedStyle(el).animationPlayState),
          "paused",
        );
      await settle(page);
      await page.screenshot({
        path: out + "/landing-" + width + "-" + theme + ".png",
        fullPage: true,
      });
      await page.screenshot({
        path: out + "/arrival-" + width + "-" + theme + ".png",
      });
      if (width === 1440 || width === 390) {
        for (const [space, label] of [
          ["manuscript", "Manuscript editor"],
          ["defense", "Defense coach"],
          ["questions", "Questions"],
          ["prototype", "Prototype planner"],
        ]) {
          await page
            .locator(".role-showcase")
            .getByRole("button", { name: label, exact: true })
            .click();
          const character = page.locator(".showcase-art .role-character");
          await character.evaluate((i) => i.decode());
          assert(
            (await character.getAttribute("src")).includes(
              "companion-" + space,
            ),
          );
          await noOverflow(page);
        }
        await page.locator(".role-showcase").scrollIntoViewIfNeeded();
        await page.screenshot({
          path: out + "/roles-" + width + "-" + theme + ".png",
        });
      }
      checks.push(
        width +
          "px " +
          theme +
          ": expanded landing, visible entry, role switching, motion pause, no overflow",
      );
      await context.close();
    }
  for (const [width, theme, space, label] of [
    [1440, "light", "prototype", "Prototype planner"],
    [1440, "dark", "defense", "Defense coach"],
    [390, "light", "manuscript", "Manuscript editor"],
    [390, "dark", "questions", "Questions"],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height: width === 390 ? 844 : 1000 },
      colorScheme: theme,
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    let actor = null,
      attempts = 0;
    await page.route("**/api/v1/**", async (route) => {
      const path = new URL(route.request().url()).pathname.replace(
        "/api/v1",
        "",
      );
      let data,
        status = 200;
      if (path === "/auth/status")
        data = { enabled: true, configured: true, memberLimit: 4, actor };
      else if (path === "/auth/login") {
        attempts++;
        if (attempts === 1)
          return route.fulfill({
            status: 401,
            contentType: "application/json",
            body: JSON.stringify({
              error: {
                message:
                  "Synthetic sign-in error. Check your workspace credentials.",
              },
            }),
          });
        actor = {
          id: "qa",
          name: "QA member",
          username: "qa",
          role: "editor",
          slot: 2,
        };
        data = { actor };
      } else if (path === "/manuscript")
        data = {
          documentId: "qa-fixture",
          tabId: "qa-tab",
          readState: "cached_snapshot",
        };
      else if (path === "/manuscript/sections") data = { sections: [] };
      else if (["/jobs", "/sources", "/chat/threads"].includes(path)) data = [];
      else
        return route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({
            error: { message: "Unmocked route " + path },
          }),
        });
      await route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify({ data }),
      });
    });
    await page.goto(origin);
    await page
      .locator(".role-showcase")
      .getByRole("button", { name: label, exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Start with " + label.toLowerCase(),
        exact: true,
      })
      .click();
    await page.getByRole("heading", { name: "Welcome back." }).waitFor();
    assert.equal(
      await page
        .locator(".welcome-character .role-character")
        .getAttribute("src"),
      "/assets/companion-" + space + ".png",
    );
    await page.getByRole("button", { name: "Pause welcome animation" }).click();
    assert.equal(
      await page
        .locator(".welcome-character .role-character")
        .evaluate((el) => getComputedStyle(el).animationPlayState),
      "paused",
    );
    await settle(page);
    await noOverflow(page);
    await page.screenshot({
      path: out + "/signin-" + width + "-" + theme + ".png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "I have an invitation" }).click();
    await page.getByLabel("Invitation code").waitFor();
    await page.getByLabel("Your name").waitFor();
    await page
      .getByRole("button", { name: "I already have an account" })
      .click();
    await page.getByLabel("Workspace username").fill("qa_member");
    await page.getByLabel("Workspace password").fill("synthetic-password-only");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Synthetic sign-in error" })
      .waitFor();
    assert.equal(
      await page
        .locator(".welcome-character .role-character")
        .evaluate((el) => getComputedStyle(el).animationPlayState),
      "paused",
    );
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page
      .getByRole("heading", { name: "What shall we make clearer?" })
      .waitFor();
    await page.getByText("Agent & space options", { exact: true }).click();
    assert.equal(await page.getByLabel("New space").inputValue(), space);
    await page.getByText("Agent & space options", { exact: true }).click();
    await settle(page);
    await noOverflow(page);
    await page.screenshot({
      path: out + "/home-" + width + "-" + theme + ".png",
      fullPage: true,
    });
    await page
      .locator(".role-home")
      .getByRole("button", { name: "Prototype planner", exact: true })
      .click();
    await page.locator(".prompt-suggestions button").click();
    assert.match(
      await page
        .getByRole("textbox", { name: "Your manuscript request" })
        .inputValue(),
      /exact components and ratings/,
    );
    checks.push(
      width +
        "px " +
        theme +
        ": " +
        space +
        " intent → sign-in/invitation/error → correct chat purpose; editable prompt",
    );
    await context.close();
  }
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.goto(origin);
  await page
    .getByRole("button", { name: "Play preview", exact: true })
    .waitFor();
  assert.equal(
    await page
      .locator(".scene-character .role-character")
      .evaluate((el) => getComputedStyle(el).animationName),
    "none",
  );
  assert.equal(
    await page
      .locator(".revision-scene .air-travel")
      .first()
      .evaluate((el) => getComputedStyle(el).animationName),
    "none",
  );
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await page
    .getByRole("heading", { name: "The decision stays yours." })
    .waitFor();
  await context.close();
  checks.push("Reduced motion static, manual preview navigation works");
  assert.deepEqual(errors, []);
  writeFileSync(
    out + "/qa-result.json",
    JSON.stringify(
      {
        at: new Date().toISOString(),
        scope:
          "Real public pages, synthetic protected/auth flows. No real account creation, consent or Google writes.",
        checks,
        errors,
      },
      null,
      2,
    ),
  );
  console.log({ checks: checks.length, errors: errors.length, out });
} finally {
  await browser.close();
}
