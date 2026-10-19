import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import assert from "node:assert/strict";
const dir = ".local/test-artifacts";
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.SOLAIR_CHROME
    ? { executablePath: process.env.SOLAIR_CHROME }
    : {}),
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto("http://127.0.0.1:4781", { waitUntil: "networkidle" });
  await page
    .getByRole("heading", { name: "Make your next revision." })
    .waitFor();
  await page.getByLabel("Find a paragraph").fill("Significance of the Study");
  await page
    .getByLabel("Target paragraph", { exact: true })
    .selectOption({ label: "Significance of the Study" });
  await page.screenshot({ path: dir + "/chat-desktop.png", fullPage: true });
  await page.getByRole("button", { name: /Review changes/ }).click();
  await page.getByRole("heading", { name: "Every change, clearly." }).waitFor();
  if (await page.locator(".job-item").count()) {
    await page.locator(".job-item").first().click();
    await page.locator(".review-body").waitFor();
    assert(
      (await page.locator(".checks").innerText()).includes(
        "Native verification",
      ),
    );
  }
  await page.screenshot({ path: dir + "/changes-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Sources & mapping" }).click();
  await page
    .getByRole("heading", { name: "Give your evidence a home." })
    .waitFor();
  await page.getByRole("button", { name: "Activity history" }).click();
  await page.getByRole("heading", { name: "See what happened." }).waitFor();
  await page.screenshot({
    path: dir + "/activity-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Manuscript chat" }).click();
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    "Mobile view overflows horizontally",
  );
  await page.screenshot({ path: dir + "/chat-mobile.png", fullPage: true });
  assert.deepEqual(errors, []);
  console.log(
    "PASS desktop navigation, paragraph selection, saved history, mobile width and browser runtime.",
  );
} finally {
  await browser.close();
}
