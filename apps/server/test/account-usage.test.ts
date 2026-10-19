import test from "node:test";
import assert from "node:assert/strict";
import { normalizeUsage } from "../src/account-usage.ts";
import { Codex } from "../src/codex.ts";
test("Quota uses each reported window and omits private account/credit data", () => {
  const r = normalizeUsage({
    rateLimitsByLimitId: {
      codex: {
        primary: {
          usedPercent: 57,
          windowDurationMins: 300,
          resetsAt: 1792141262,
        },
        secondary: {
          usedPercent: 71,
          windowDurationMins: 10080,
          resetsAt: 1792650040,
        },
        credits: { balance: "secret" },
        accountId: "secret",
      },
    },
  });
  assert.equal(r.status, "available");
  assert.equal(r.limits[0].primary?.usedPercent, 57);
  assert.equal(r.limits[0].secondary?.usedPercent, 71);
  assert(!JSON.stringify(r).includes("secret"));
});
test("Legacy one-window results work; missing/invalid values never become a fake 0%", () => {
  assert.equal(
    normalizeUsage({ rateLimits: { primary: { usedPercent: 0 } } }).limits[0]
      .primary?.usedPercent,
    0,
  );
  for (const x of [
    undefined,
    {},
    { rateLimits: { primary: {} } },
    { rateLimits: { primary: { usedPercent: "25" } } },
    { rateLimits: { primary: { usedPercent: -1 } } },
    { rateLimits: { primary: { usedPercent: 101 } } },
  ])
    assert.equal(normalizeUsage(x).status, "unavailable");
  const r = normalizeUsage({
    rateLimits: {
      primary: { usedPercent: 100, resetsAt: null },
      rateLimitReachedType: "primary",
    },
  });
  assert(r.limits[0].reached);
  assert.equal(r.limits[0].primary?.resetsAt, undefined);
});
test("Managed usage read runs no inference and API-only/unsupported runtimes fail honestly", async () => {
  const c = new Codex("."),
    calls: string[] = [];
  c.start = async () => {};
  c.rpc = async (method) => {
    calls.push(method);
    return method === "account/read"
      ? { account: { type: "chatgpt" } }
      : { rateLimits: { primary: { usedPercent: 45 } } };
  };
  assert.equal((await c.usage()).limits[0].primary?.usedPercent, 45);
  assert.deepEqual(calls, ["account/read", "account/rateLimits/read"]);
  c.rpc = async () => ({ account: { type: "apiKey" } });
  assert.equal((await c.usage()).status, "unavailable");
  c.rpc = async () => {
    throw Error("unsupported");
  };
  assert.equal((await c.usage()).status, "unavailable");
});

test("AI failure guidance distinguishes timeout, quota, invalid responses and never leaks vendor error text", async () => {
  const { publicAIError } = await import("../src/ai-errors.ts");
  for (const [message, code] of [
    ["AI turn timed out", "AI_TIMEOUT"],
    ["UsageLimitExceeded", "AI_QUOTA"],
    ["ContextWindowExceeded", "AI_CONTEXT"],
    ["AI disconnected", "AI_DISCONNECTED"],
  ]) {
    const e = publicAIError(new Error(message + " SECRET"));
    assert.equal(e.code, code);
    assert(!e.message.includes("SECRET"));
  }
  assert.equal(
    publicAIError(new SyntaxError("SECRET")).code,
    "AI_INVALID_RESPONSE",
  );
});
