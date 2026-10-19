import { Codex } from "../apps/server/src/codex.ts";
const c = new Codex(process.cwd());
try {
  await c.status();
  const t = await c.rpc("thread/start", {
    cwd: process.cwd(),
    model: "gpt-6.1-sol",
    sandbox: "read-only",
    approvalPolicy: "never",
    ephemeral: true,
    config: {
      features: { shell_tool: false, apps: false },
      web_search: "disabled",
      apps: { _default: { enabled: false } },
      mcp_servers: Object.fromEntries(
        c.servers.map((name) => [
          name,
          { command: process.execPath, enabled: false },
        ]),
      ),
    },
  });
  const s = await c.rpc("mcpServerStatus/list", {
    threadId: t.thread.id,
    detail: "toolsAndAuthOnly",
  });
  console.log(
    JSON.stringify(
      {
        model: t.model,
        sandbox: t.sandbox,
        servers: s.data.map((x: any) => ({
          name: x.name,
          count: Object.keys(x.tools).length,
          toolsErrorPresent: !!x.toolsError,
        })),
      },
      null,
      2,
    ),
  );
} finally {
  c.stop();
}
