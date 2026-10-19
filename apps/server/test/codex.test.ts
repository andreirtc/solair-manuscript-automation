import test from "node:test";
import assert from "node:assert/strict";
import { Codex } from "../src/codex.ts";
test("Native source alias calls the full Google Docs reader, preserving normal response unwrapping", async () => {
  const c = new Codex(".");
  c.start = async () => {};
  c.bridgeThread = "read-only-bridge";
  c.rpc = async (method, args) => {
    assert.equal(method, "mcpServer/tool/call");
    assert.equal(args.tool, "google_drive.get_document");
    assert.deepEqual(args.arguments, { document_id: "source-id" });
    return { structuredContent: { documentId: "source-id", tabs: [] } };
  };
  assert.deepEqual(
    await c.tool("get_source_document", { document_id: "source-id" }),
    { documentId: "source-id", tabs: [] },
  );
});
class Fake extends Codex {
  calls: { method: string; params: any }[] = [];
  unsafe = false;
  wrongModel = false;
  limited = false;
  async status() {
    this.servers = ["codex_apps", "node_repl"];
    return {
      codex: {
        status: this.limited ? "unavailable" : "connected",
        model: "gpt-6.1-sol",
        effort: "high",
        accountType: this.limited ? "apiKey" : "chatgpt",
      },
      google: { status: "available" },
    };
  }
  async rpc(method: string, params: any = {}): Promise<any> {
    this.calls.push({ method, params });
    if (method === "thread/start" || method === "thread/resume")
      return {
        thread: { id: "provider-thread" },
        model: this.wrongModel ? "different-model" : "gpt-6.1-sol",
        sandbox: { type: "readOnly", networkAccess: false },
      };
    if (method === "mcpServerStatus/list")
      return {
        data: [
          { name: "node_repl", tools: this.unsafe ? { execute: {} } : {} },
        ],
      };
    if (method === "turn/start") {
      setTimeout(() => {
        this.emit("item/completed", {
          threadId: "provider-thread",
          item: {
            type: "agentMessage",
            text: '{"answer":"Ready","operations":[]}',
          },
        });
        this.emit("turn/completed", {
          threadId: "provider-thread",
          turn: { status: "completed" },
        });
      }, 1);
      return { turn: { id: "turn" } };
    }
    throw new Error("Unexpected RPC");
  }
}
test("Chat uses exact requested model/high, read-only sandbox and disables connector execution tools", async () => {
  const c = new Fake(".");
  const r = await c.propose(
    undefined,
    "Test",
    () => {},
    () => {},
  );
  assert.equal(JSON.parse(r).answer, "Ready");
  const start = c.calls.find((c) => c.method === "thread/start")!.params;
  assert.equal(start.allowProviderModelFallback, false);
  assert.equal(start.config.mcp_servers.node_repl.enabled, false);
  assert.equal(start.config.mcp_servers.codex_apps.enabled, false);
  const turn = c.calls.find((c) => c.method === "turn/start")!.params;
  assert.equal(turn.effort, "high");
  assert.equal(turn.model, "gpt-6.1-sol");
  assert(
    turn.outputSchema.properties.operations.items.anyOf.some((v: any) =>
      v.properties.type.enum.includes("insert_figure"),
    ),
  );
  const format = turn.outputSchema.properties.operations.items.anyOf.find(
    (v: any) => v.properties.type.enum.includes("format_paragraph"),
  );
  assert(format.properties.paragraph_style.properties.lineSpacing);
  assert(format.properties.anchorId);
});
test("The actual managed-model routing turn accepts section IDs instead of enforcing the edit schema", async () => {
  const c = new Fake(".");
  await c.propose(
    undefined,
    "SOLAIR_SCOPE_ROUTING\nLocate an instrument subsection.",
    () => {},
    () => {},
  );
  const turn = c.calls.find((c) => c.method === "turn/start")!.params;
  assert.deepEqual(turn.outputSchema.required, ["sectionIds", "answer"]);
  assert(!turn.outputSchema.properties.operations);
});
test("Fail closed when runtime exposes tools or changes model; no inference is sent", async () => {
  for (const setting of ["unsafe", "wrongModel"] as const) {
    const c = new Fake(".");
    c[setting] = true;
    await assert.rejects(
      c.propose(
        undefined,
        "Test",
        () => {},
        () => {},
      ),
    );
    assert(!c.calls.some((c) => c.method === "turn/start"));
  }
});
test("An API-key account is rejected instead of silently changing billing", async () => {
  const c = new Fake(".");
  c.limited = true;
  await assert.rejects(
    c.propose(
      undefined,
      "Test",
      () => {},
      () => {},
    ),
    /API-key billing is disabled/,
  );
  assert.equal(c.calls.length, 0);
});
test("Selected models validate catalogue and reasoning before inference, with no silent substitution", async () => {
  class Choices extends Fake {
    async start() {}
    async rpc(method: string, params: any = {}): Promise<any> {
      if (method === "account/read") return { account: { type: "chatgpt" } };
      if (method === "model/list")
        return {
          data: [
            {
              model: "account-model",
              displayName: "Account model",
              supportedReasoningEfforts: [{ reasoningEffort: "medium" }],
            },
          ],
        };
      const result = await super.rpc(method, params);
      if (method === "thread/start" || method === "thread/resume")
        result.model = params.model;
      return result;
    }
  }
  const c = new Choices(".");
  await c.propose(
    undefined,
    "Test",
    () => {},
    () => {},
    { model: "account-model", effort: "medium" },
  );
  assert.equal(
    c.calls.find((c) => c.method === "turn/start")?.params.model,
    "account-model",
  );
  assert.equal(
    c.calls.find((c) => c.method === "turn/start")?.params.effort,
    "medium",
  );
  for (const choice of [
    { model: "not-listed", effort: "medium" },
    { model: "account-model", effort: "high" },
  ]) {
    const denied = new Choices(".");
    await assert.rejects(
      denied.propose(
        undefined,
        "Test",
        () => {},
        () => {},
        choice,
      ),
      /not advertised/,
    );
    assert(!denied.calls.some((c) => c.method === "turn/start"));
  }
});

test("Live research enables only built-in web search, preserves proposal isolation and exposes actual search actions", async () => {
  const c = new Fake("."),
    actions: any[] = [];
  const original = c.rpc.bind(c);
  c.rpc = async (method, args) => {
    const result = await original(method, args);
    if (method === "turn/start")
      c.emit("item/completed", {
        threadId: "provider-thread",
        item: {
          type: "webSearch",
          action: { type: "openPage", url: "https://www.energy.gov/example" },
        },
      });
    return result;
  };
  await c.propose(
    undefined,
    "Research public sources",
    () => {},
    () => {},
    undefined,
    true,
    (a) => actions.push(a),
  );
  const start = c.calls.find((c) => c.method === "thread/start")!.params;
  assert.equal(start.config.web_search, "live");
  assert.equal(start.config.features.shell_tool, false);
  assert.equal(start.config.mcp_servers.codex_apps.enabled, false);
  assert.equal(start.sandbox, "read-only");
  assert.match(start.developerInstructions, /Never execute shell/);
  assert.equal(actions[0].type, "openPage");
});
