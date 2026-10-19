import { chromium } from "playwright";
import { createServer } from "node:http";
import { request as httpRequest } from "node:https";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import assert from "node:assert/strict";
const origin = readFileSync(".local/team-address.txt", "utf8").trim(),
  out = ".local/acceptance/shared-link";
mkdirSync(out, { recursive: true });
const source = createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(`<a href="${origin}">Open shared workspace</a>`);
}).listen(0, "127.0.0.1");
await new Promise((r) => source.on("listening", r));
const b = await chromium.launch({
  executablePath:
    process.env.SOLAIR_CHROME ||
    "/home/ralphandreicastillo326/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome",
  headless: true,
  args: ["--no-sandbox"],
});
const checks = [];
try {
  const page = await b.newPage();
  let navigation;
  page.on("request", async (req) => {
    if (req.url() === origin + "/") navigation = await req.allHeaders();
  });
  await page.goto(`http://127.0.0.1:${source.address().port}`);
  const response = page.waitForResponse((r) => r.url() === origin + "/");
  await page.getByRole("link", { name: "Open shared workspace" }).click();
  assert.equal((await response).status(), 200);
  await page
    .getByRole("heading", { name: "A clearer manuscript. A calmer defense." })
    .waitFor();
  assert.equal(navigation["sec-fetch-site"], "cross-site");
  assert.equal(navigation["sec-fetch-mode"], "navigate");
  assert.equal(navigation["sec-fetch-dest"], "document");
  checks.push(
    "Real browser cross-site shared-link click opens landing with navigate/document metadata",
  );
  await page.getByRole("button", { name: "Enter your workspace" }).click();
  await page.getByRole("heading", { name: "Welcome back" }).waitFor();
  checks.push(
    "Landing continues into existing workspace sign-in without ORIGIN_REJECTED; no credentials submitted",
  );
  const raw = (path, method = "GET", extra = {}) =>
    new Promise((resolve, reject) => {
      const req = httpRequest(
        origin + path,
        {
          method,
          headers: {
            "Sec-Fetch-Site": "cross-site",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Dest": "document",
            ...extra,
          },
        },
        (res) => {
          res.resume();
          res.on("end", () => resolve(res.statusCode));
        },
      );
      req.on("error", reject);
      req.end();
    });
  assert.equal(await raw("/api/v1/sources"), 403);
  assert.equal(await raw("/API/v1/auth/status"), 403);
  assert.equal(
    await raw("/api/v1/auth/logout", "POST", { "X-SOLAIR-Client": "web" }),
    403,
  );
  checks.push("Public cross-site API navigation and POST remain denied");
  const privateStatus = await fetch(origin + "/api/v1/sources");
  assert.equal(privateStatus.status, 401);
  checks.push("Anonymous source data stays session-protected");
  const result = {
    at: new Date().toISOString(),
    origin,
    checks,
    scope:
      "Anonymous real browser navigation and public HTTP security checks only; no account sign-in, AI inference or Google write.",
  };
  writeFileSync(out + "/live-result.json", JSON.stringify(result, null, 2), {
    mode: 0o600,
  });
  console.log(result);
} finally {
  await b.close();
  await new Promise((r) => source.close(r));
}
