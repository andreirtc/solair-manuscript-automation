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
const checks = [];
try {
  for (const [width, theme] of [
    [1440, "light"],
    [390, "dark"],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height: 844 },
      colorScheme: theme,
    });
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:4781");
    for (const label of ["Ask", "Review", "Apply", "Pause preview"]) {
      const control = page.getByRole("button", { name: label, exact: true });
      await control.scrollIntoViewIfNeeded();
      assert(
        await control.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return el.contains(
            document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
          );
        }),
        label + " must be reachable",
      );
    }
    await page
      .getByRole("button", { name: "Pause preview", exact: true })
      .click();
    const step = await page
      .locator(".scene-controls [aria-pressed=true]")
      .textContent();
    await page.waitForTimeout(6500);
    assert.equal(
      await page.locator(".scene-controls [aria-pressed=true]").textContent(),
      step,
    );
    await page
      .getByRole("button", { name: "Play preview", exact: true })
      .click();
    await page.waitForFunction(
      (old) =>
        document.querySelector(".scene-controls [aria-pressed=true]")
          ?.textContent !== old,
      step,
      { timeout: 8000 },
    );
    await page.locator(".revision-journey").scrollIntoViewIfNeeded();
    await page.waitForFunction(
      () =>
        getComputedStyle(
          document.querySelector(".scene-character .role-character"),
        ).animationPlayState === "paused",
    );
    assert.equal(
      await page
        .locator(".showcase-copy")
        .evaluate((el) => getComputedStyle(el).filter),
      "none",
    );
    await page
      .getByRole("button", { name: "Say hello to the SolAir companion" })
      .click();
    await page
      .getByText("Solar energy. A fresh perspective.", { exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Enter your workspace", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Pause welcome animation", exact: true })
      .click();
    for (const selector of [
      ".welcome-character .role-character",
      ".welcome-character .air-travel",
      ".welcome-character .turbine-blades",
    ])
      assert.equal(
        await page
          .locator(selector)
          .first()
          .evaluate((el) => getComputedStyle(el).animationPlayState),
        "paused",
      );
    await page
      .getByRole("button", { name: "Play welcome animation", exact: true })
      .click();
    assert.equal(
      await page
        .locator(".welcome-character .role-character")
        .evaluate((el) => getComputedStyle(el).animationPlayState),
      "running",
    );
    checks.push(
      width +
        "px " +
        theme +
        ": all preview controls reachable; timer pause/resume; offscreen motion stops; static text remains clear; greeting and welcome animation work",
    );
    await context.close();
  }
  writeFileSync(
    out + "/motion-result.json",
    JSON.stringify({ at: new Date().toISOString(), checks }, null, 2),
  );
  console.log({ checks: checks.length });
} finally {
  await browser.close();
}
