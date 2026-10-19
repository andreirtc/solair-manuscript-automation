import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { writeFileSync, unlinkSync, readFileSync } from "node:fs";
import { Store } from "./store.ts";
import { Codex } from "./codex.ts";
import { Manuscript } from "./manuscript.ts";
import { createApp } from "./app.ts";
import { importHistory, importBackupCleanup } from "./history.ts";
import { importProjectSources } from "./project-sources.ts";
import { Team, type TeamConfig } from "./team.ts";
import { GoogleBridge } from "./google-bridge.ts";
import { z } from "zod";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const project = resolve(root, "..");
const store = new Store(resolve(root, ".local"));
importHistory(store, project);
importBackupCleanup(store, project);
importProjectSources(store, project);
const config: TeamConfig = process.env.SOLAIR_TEAM_CONFIG
  ? z
      .object({
        enabled: z.boolean(),
        manuscriptMode: z.enum(["trial", "maintained"]).default("trial"),
        publicOrigin: z.string().optional(),
        privateImageTrials: z.boolean().default(false),
        localGoogleConnector: z.boolean().default(false),
        workers: z.record(
          z.enum(["1", "2", "3", "4"]),
          z.object({ url: z.string().url(), key: z.string().min(32) }).strict(),
        ),
        googleBridge: z
          .object({ url: z.string(), key: z.string().min(32) })
          .strict()
          .optional(),
      })
      .strict()
      .parse(JSON.parse(readFileSync(process.env.SOLAIR_TEAM_CONFIG, "utf8")))
  : { enabled: false, workers: {} };
if (config.publicOrigin && !config.enabled)
  throw new Error("Public hosting requires team authentication.");
if (config.googleBridge && config.localGoogleConnector)
  throw new Error("Choose one Google adapter; automatic fallback is disabled.");
if (config.publicOrigin && !config.googleBridge && !config.localGoogleConnector)
  throw new Error(
    "Public hosting requires the scoped Google adapter. The Orca connector does not transfer automatically.",
  );
if (
  config.manuscriptMode === "maintained" &&
  (!config.localGoogleConnector || config.googleBridge)
)
  throw new Error(
    "Adviser-review activation currently requires the verified local Google connector; the cloud bridge remains trial-scoped.",
  );
const codex = new Codex(root),
  manuscript = new Manuscript(
    store,
    config.googleBridge
      ? new GoogleBridge(
          config.googleBridge,
          config.publicOrigin,
          config.privateImageTrials,
        )
      : codex,
    project,
    config.manuscriptMode,
  );
if (
  config.localGoogleConnector &&
  config.privateImageTrials &&
  config.publicOrigin
) {
  codex.privateImages = true;
  codex.privateImageOrigin = config.publicOrigin;
}
// Fail closed before serving if the maintained document, protected SOP or school tab cannot be read.
if (config.manuscriptMode === "maintained") {
  await manuscript.refresh();
  manuscript.layoutProfile();
}
const team = new Team(store, config);
const port = Number(process.env.SOLAIR_PORT || 4781);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Use a valid local port.");
const pidPath = resolve(root, ".local/server.pid");
const bind = process.env.SOLAIR_BIND || "127.0.0.1";
if (
  bind !== "127.0.0.1" &&
  !(bind === "0.0.0.0" && config.enabled && config.publicOrigin)
)
  throw new Error(
    "External binding requires an authenticated HTTPS team deployment.",
  );
const server = createApp(store, codex, manuscript, project, team).listen(
  port,
  bind,
  () => {
    writeFileSync(pidPath, String(process.pid), { mode: 0o600 });
    console.log(`SOLAIR manuscript app: http://127.0.0.1:${port}`);
  },
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    server.close();
    codex.stop();
    store.close();
    try {
      unlinkSync(pidPath);
    } catch {}
    process.exit(0);
  });
