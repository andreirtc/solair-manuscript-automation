import test from "node:test";
import assert from "node:assert/strict";
import { Codex } from "../src/codex.ts";
import { RemoteAI } from "../src/remote-ai.ts";
import { createWorker } from "../../worker/src/app.ts";
class FakeCodex extends Codex {
  calls: { method: string; params: any }[] = [];
  running = false;
  selectedChoice: any;
  fail = false;
  authorizationComplete = false;
  release?: () => void;
  gate?: Promise<void>;
  constructor() {
    super(process.cwd());
  }
  async start() {}
  async status() {
    return {
      codex: { status: "connected", model: "gpt-6.1-sol", effort: "high" },
      google: { status: "unavailable" },
    };
  }
  async models() {
    return [
      {
        model: "personal-model",
        label: "Personal model",
        efforts: ["medium", "high"],
      },
    ];
  }
  async usage() {
    return {
      status: "available" as const,
      checkedAt: new Date().toISOString(),
      limits: [{ id: "codex", reached: false, primary: { usedPercent: 45 } }],
    };
  }
  async rpc(method: string, params: any) {
    this.calls.push({ method, params });
    if (method === "account/read")
      return {
        account: this.authorizationComplete ? { type: "chatgpt" } : null,
      };
    if (method === "account/login/start")
      return {
        type: "chatgptDeviceCode",
        loginId: "test-login",
        verificationUrl: "https://auth.openai.com/codex/device",
        userCode: "TEST-CODE",
      };
    return {};
  }
  async propose(
    provider: string | undefined,
    _prompt: string,
    onDelta: (s: string) => void,
    onProvider: (s: string) => void,
    choice?: { model: string; effort: string },
    research = false,
    onResearch?: (action: { type: string; url?: string }) => void,
    onProgress?: (stage: "thinking" | "answering") => void,
  ) {
    this.selectedChoice = choice;
    this.running = true;
    try {
      if (this.fail) throw new Error("Personal quota exhausted");
      onProgress?.("thinking");
      if (this.gate) await this.gate;
      onProvider(provider || "personal-provider-id");
      onDelta("draft delta");
      onProgress?.("answering");
      if (research)
        onResearch?.({
          type: "openPage",
          url: "https://www.energy.gov/example",
        });
      return "complete proposal";
    } finally {
      this.running = false;
    }
  }
}
async function setup() {
  const codex = new FakeCodex(),
    key = "a-private-test-worker-key-with-32-plus-characters",
    server = createWorker(codex, key).listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.on("listening", r));
  const url = `http://127.0.0.1:${(server.address() as any).port}`;
  return {
    codex,
    key,
    url,
    client: new RemoteAI({ url, key }),
    request: (path: string, body: any = {}, headers: any = {}) =>
      fetch(url + path, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + key,
          "Content-Type": "application/json",
          ...headers,
        },
        body: JSON.stringify(body),
      }),
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}
test("Private worker rejects unauthenticated/direct-browser calls and streams provider/delta/final events to its backend", async () => {
  const s = await setup();
  try {
    assert.equal(
      (await s.request("/status", {}, { Authorization: "Bearer wrong" }))
        .status,
      401,
    );
    assert.equal(
      (await s.request("/status", {}, { Origin: "https://browser.example" }))
        .status,
      403,
    );
    const providers: string[] = [],
      deltas: string[] = [];
    const final = await s.client.propose(
      undefined,
      "Draft only",
      (d) => deltas.push(d),
      (p) => providers.push(p),
    );
    assert.equal(final, "complete proposal");
    assert.deepEqual(providers, ["personal-provider-id"]);
    assert.deepEqual(deltas, ["draft delta"]);
  } finally {
    await s.close();
  }
});
test("A failed personal turn rejects the stream and releases its worker for a later retry", async () => {
  const s = await setup();
  try {
    s.codex.fail = true;
    await assert.rejects(
      s.client.propose(
        undefined,
        "First",
        () => {},
        () => {},
      ),
      (e: any) => e.code === "AI_QUOTA" && /No other member/.test(e.message),
    );
    s.codex.fail = false;
    assert.equal(
      await s.client.propose(
        undefined,
        "Retry",
        () => {},
        () => {},
      ),
      "complete proposal",
    );
  } finally {
    await s.close();
  }
});
test("Worker sign-in uses device-code auth; pending sign-in blocks inference; disconnect cancels pending authorization", async () => {
  const s = await setup();
  try {
    const login = await s.client.beginLogin();
    assert.equal(login.userCode, "TEST-CODE");
    assert.deepEqual(
      s.codex.calls.map((c) => c.method),
      ["account/logout", "account/login/start"],
    );
    assert.deepEqual(s.codex.calls[1].params, { type: "chatgptDeviceCode" });
    assert.equal(
      (await s.request("/propose", { prompt: "Should wait" })).status,
      409,
    );
    assert.equal(s.codex.running, false);
    await s.client.logout();
    assert.deepEqual(
      s.codex.calls.slice(-2).map((c) => c.method),
      ["account/login/cancel", "account/logout"],
    );
    assert.equal(
      await s.client.propose(
        undefined,
        "Allowed after pending login cleared",
        () => {},
        () => {},
      ),
      "complete proposal",
    );
  } finally {
    await s.close();
  }
});
test("An active personal AI turn excludes another turn, sign-in and logout without substituting another account", async () => {
  const s = await setup();
  try {
    s.codex.gate = new Promise<void>((r) => (s.codex.release = r));
    const pending = s.client.propose(
      undefined,
      "First request",
      () => {},
      () => {},
    );
    for (let n = 0; n < 100 && !s.codex.running; n++)
      await new Promise((r) => setTimeout(r, 5));
    assert(s.codex.running);
    assert.equal(
      (await s.request("/propose", { prompt: "Second request" })).status,
      409,
    );
    assert.equal((await s.request("/login")).status, 409);
    assert.equal((await s.request("/logout")).status, 409);
    s.codex.release!();
    assert.equal(await pending, "complete proposal");
    assert.equal(s.codex.calls.length, 0);
  } finally {
    s.codex.release?.();
    await s.close();
  }
});

test("Personal worker discovery and selected model/effort survive the private transport", async () => {
  const s = await setup();
  try {
    assert.equal(
      (await s.request("/models", {}, { Authorization: "Bearer wrong" }))
        .status,
      401,
    );
    assert.deepEqual(await s.client.models(), [
      {
        model: "personal-model",
        label: "Personal model",
        efforts: ["medium", "high"],
      },
    ]);
    const choice = { model: "personal-model", effort: "medium" };
    await s.client.propose(
      undefined,
      "Use my selected model",
      () => {},
      () => {},
      choice,
    );
    assert.deepEqual(s.codex.selectedChoice, choice);
    assert.equal(
      (
        await s.request("/propose", {
          prompt: "Invalid choice",
          choice: { model: "personal-model", effort: "invented" },
        })
      ).status,
      400,
    );
  } finally {
    await s.close();
  }
});

test("Completed device authorization clears a missed pending-login notification without re-authenticating", async () => {
  const s = await setup();
  try {
    await s.client.beginLogin();
    await assert.rejects(
      s.client.propose(
        undefined,
        "Still pending",
        () => {},
        () => {},
      ),
      (e: any) => e.code === "PERSONAL_SIGN_IN_PENDING",
    );
    s.codex.authorizationComplete = true;
    const status: any = await s.client.status();
    assert.equal(status.worker.loginPending, false);
    assert.equal(
      await s.client.propose(
        undefined,
        "Now connected",
        () => {},
        () => {},
      ),
      "complete proposal",
    );
    assert.equal(
      s.codex.calls.filter((c) => c.method === "account/logout").length,
      1,
    );
  } finally {
    await s.close();
  }
});

test("Busy and oversized personal-worker requests return actionable errors rather than unavailable", async () => {
  const s = await setup();
  try {
    s.codex.gate = new Promise<void>((r) => (s.codex.release = r));
    const pending = s.client.propose(
      undefined,
      "First",
      () => {},
      () => {},
    );
    for (let n = 0; n < 100 && !s.codex.running; n++)
      await new Promise((r) => setTimeout(r, 5));
    await assert.rejects(
      s.client.propose(
        undefined,
        "Second",
        () => {},
        () => {},
      ),
      (e: any) =>
        e.code === "PERSONAL_AI_BUSY" && /another conversation/.test(e.message),
    );
    const state: any = await s.client.status();
    assert.equal(state.worker.busy, true);
    s.codex.release!();
    await pending;
    await assert.rejects(
      s.client.request("/propose", { prompt: "x".repeat(300000) }),
      (e: any) => e.code === "PROMPT_TOO_LARGE",
    );
  } finally {
    s.codex.release?.();
    await s.close();
  }
});

test("Personal worker carries explicit live-research permission and observed actions without widening account routing", async () => {
  const s = await setup();
  try {
    const actions: any[] = [];
    await s.client.propose(
      undefined,
      "Research",
      () => {},
      () => {},
      undefined,
      true,
      (action) => actions.push(action),
    );
    assert.deepEqual(actions, [
      { type: "openPage", url: "https://www.energy.gov/example" },
    ]);
    const offlineActions: any[] = [];
    await s.client.propose(
      undefined,
      "Offline",
      () => {},
      () => {},
      undefined,
      false,
      (action) => offlineActions.push(action),
    );
    assert.deepEqual(offlineActions, []);
  } finally {
    await s.close();
  }
});

test("Personal quota crosses only the authenticated private worker transport without inference", async () => {
  const s = await setup();
  try {
    const r = await s.client.usage();
    assert.equal(r.limits[0].primary?.usedPercent, 45);
    assert.equal(s.codex.running, false);
    assert.equal(s.codex.selectedChoice, undefined);
  } finally {
    await s.close();
  }
});

test("Only coarse thinking/answering stages cross the personal progress stream", async () => {
  const s = await setup();
  try {
    const stages: string[] = [];
    await s.client.propose(
      undefined,
      "Public discussion",
      () => {},
      () => {},
      undefined,
      false,
      undefined,
      (stage) => stages.push(stage),
    );
    assert.deepEqual(stages, ["thinking", "answering"]);
  } finally {
    await s.close();
  }
});
