import { chromium } from "playwright";
import { mkdtempSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import assert from "node:assert/strict";
import { Store } from "../apps/server/src/store.ts";
import { Team } from "../apps/server/src/team.ts";
import { Codex } from "../apps/server/src/codex.ts";
import { Manuscript } from "../apps/server/src/manuscript.ts";
import { createApp } from "../apps/server/src/app.ts";
const dir = mkdtempSync(join(tmpdir(), "solair-browser-team-")),
  store = new Store(dir),
  team = new Team(store, { enabled: true, workers: {} }),
  project = resolve("..");
const fixture = JSON.parse(
  readFileSync(
    resolve(
      project,
      "work/manuscript-automation/trial-before/document-result.json",
    ),
    "utf8",
  ),
);
const manuscript = new Manuscript(
  store,
  {
    tool: async (name) => {
      if (name === "get_document") return fixture;
      throw new Error("No live Google operations in this browser check.");
    },
  },
  project,
);
const server = createApp(
  store,
  new Codex(process.cwd()),
  manuscript,
  project,
  team,
).listen(0, "127.0.0.1");
await new Promise<void>((r) => server.on("listening", r));
const browser = await chromium.launch({
  headless: true,
  ...(process.env.SOLAIR_CHROME
    ? { executablePath: process.env.SOLAIR_CHROME }
    : {}),
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } }),
  errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
const artifacts = resolve(".local/test-artifacts");
mkdirSync(artifacts, { recursive: true });
try {
  await page.goto(`http://127.0.0.1:${(server.address() as any).port}`, {
    waitUntil: "networkidle",
  });
  await page
    .getByRole("heading", { name: "Create the owner account" })
    .waitFor();
  await page.screenshot({
    path: join(artifacts, "team-setup-mobile.png"),
    fullPage: true,
  });
  await page
    .getByLabel("Setup key from your server")
    .fill(readFileSync(join(dir, "team-bootstrap.txt"), "utf8"));
  await page.getByLabel("Your name").fill("Test owner");
  await page.getByLabel("Workspace username").fill("testowner");
  await page.getByLabel("Workspace password").fill("a-separate-test-password");
  await page
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Make your next revision." })
    .waitFor();
  await page.getByRole("button", { name: "Test owner · Team" }).click();
  await page
    .getByRole("button", { name: "Connect my ChatGPT", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "No other member’s account will be used" })
    .waitFor();
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "Team panel overflows on a phone",
  );
  await page.screenshot({
    path: join(artifacts, "team-account-mobile.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Create one-use invitation" }).click();
  await page.locator(".invite-code").waitFor();
  await page.getByRole("button", { name: "Sign out of workspace" }).click();
  await page.getByRole("heading", { name: "Sign in", exact: true }).waitFor();
  assert.equal(
    await page.locator(".shell").count(),
    0,
    "Signed-out page still exposes manuscript UI",
  );
  await page.getByLabel("Workspace username").fill("testowner");
  await page.getByLabel("Workspace password").fill("a-separate-test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page
    .getByRole("heading", { name: "Make your next revision." })
    .waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "PASS phone setup, workspace sign-in/out, private invitation display, missing-account failure and no horizontal overflow. Uses temporary workspace accounts and a read-only Google mock; no live ChatGPT sign-ins claimed.",
  );
} catch (e) {
  await page.screenshot({
    path: join(artifacts, "team-check-failure.png"),
    fullPage: true,
  });
  console.log({
    url: page.url(),
    headings: await page.locator("h1,h2").allTextContents(),
    alerts: await page.getByRole("alert").allTextContents(),
    errors,
  });
  throw e;
} finally {
  await browser.close();
  await new Promise<void>((r) => server.close(() => r()));
  store.close();
  rmSync(dir, { recursive: true, force: true });
}
