import { spawn } from "node:child_process";
import {
  existsSync,
  readFileSync,
  mkdirSync,
  openSync,
  closeSync,
} from "node:fs";
import { resolve } from "node:path";
import { createServer, createConnection } from "node:net";
const root = resolve(import.meta.dirname, ".."),
  configPath = resolve(root, ".local/deployment/team.json");
if (!existsSync(configPath))
  throw new Error(
    "Prepare the laptop team configuration with your actual HTTPS origin first.",
  );
const config = JSON.parse(readFileSync(configPath, "utf8"));
if (
  config.enabled !== true ||
  (!config.googleBridge && !config.localGoogleConnector) ||
  Object.keys(config.workers || {})
    .sort()
    .join(",") !== "1,2,3,4"
)
  throw new Error(
    "A real Google adapter and four isolated workers are required.",
  );
const origin = new URL(config.publicOrigin);
if (origin.protocol !== "https:" || origin.origin !== config.publicOrigin)
  throw new Error("Use an exact HTTPS origin.");
const ports = [4781];
for (const slot of [1, 2, 3, 4]) {
  const w = config.workers[slot],
    u = new URL(w.url);
  if (
    u.href !== `http://127.0.0.1:${4790 + slot}/` ||
    typeof w.key !== "string" ||
    w.key.length < 32 ||
    readFileSync(
      resolve(root, `.local/deployment/worker${slot}.key`),
      "utf8",
    ).trim() !== w.key
  )
    throw new Error(
      "Laptop workers require matching private keys and their distinct loopback ports.",
    );
  if (
    !existsSync(
      resolve(root, `.local/workers/member${slot}/.codex/config.toml`),
    )
  )
    throw new Error("Prepare each isolated worker configuration first.");
  ports.push(4790 + slot);
}
if (new Set(Object.values(config.workers).map((w) => w.key)).size !== 4)
  throw new Error("Personal worker keys must be distinct.");
// Refuse before spawning anything when the verified single-user service or another worker is already running.
for (const port of ports)
  await new Promise((resolveCheck, reject) => {
    const socket = createServer();
    socket.once("error", () =>
      reject(
        new Error(
          `Port ${port} is in use. Stop the existing service deliberately before starting team mode.`,
        ),
      ),
    );
    socket.listen(port, "127.0.0.1", () => socket.close(resolveCheck));
  });
mkdirSync(resolve(root, ".local/logs"), { recursive: true, mode: 0o700 });
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const p of children) p.kill("SIGTERM");
  setTimeout(() => {
    for (const p of children) if (p.exitCode === null) p.kill("SIGKILL");
    process.exit(code);
  }, 1500).unref();
  process.exitCode = code;
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
function start(name, entry, env) {
  const fd = openSync(resolve(root, `.local/logs/${name}.log`), "a", 0o600);
  const p = spawn(process.execPath, ["--import", "tsx", entry], {
    cwd: root,
    stdio: ["ignore", fd, fd],
    env: { ...process.env, ...env },
  });
  closeSync(fd);
  children.push(p);
  p.once("error", () => {
    console.error(`${name} could not start; check its private log.`);
    stop(1);
  });
  p.once("exit", (code) => {
    if (!stopping) {
      console.error(
        `${name} stopped (${code}); stopping the remaining team processes.`,
      );
      stop(1);
    }
  });
  return p;
}
async function ready(port, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && !stopping) {
    if (
      await new Promise((r) => {
        const c = createConnection({ host: "127.0.0.1", port });
        c.once("connect", () => {
          c.destroy();
          r(true);
        });
        c.once("error", () => r(false));
        c.setTimeout(200, () => {
          c.destroy();
          r(false);
        });
      })
    )
      return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(
    `Port ${port} did not become ready. Check .local/logs privately.`,
  );
}
try {
  for (const slot of [1, 2, 3, 4])
    start(`worker${slot}`, "apps/worker/src/index.ts", {
      CODEX_HOME: resolve(root, `.local/workers/member${slot}/.codex`),
      SOLAIR_WORKER_BIND: "127.0.0.1",
      SOLAIR_WORKER_PORT: String(4790 + slot),
      SOLAIR_WORKER_KEY_FILE: resolve(
        root,
        `.local/deployment/worker${slot}.key`,
      ),
      SOLAIR_WORKER_KEY: "",
    });
  await Promise.all([1, 2, 3, 4].map((slot) => ready(4790 + slot)));
  start("team-server", "apps/server/src/index.ts", {
    SOLAIR_TEAM_CONFIG: configPath,
    SOLAIR_BIND: "127.0.0.1",
    SOLAIR_PORT: "4781",
  });
  await ready(4781, config.manuscriptMode === "maintained" ? 150000 : 10000);
  console.log(
    `Team service is listening on loopback 4781; four isolated workers are listening privately. HTTPS origin: ${config.publicOrigin}`,
  );
  console.log(
    "Start the configured HTTPS tunnel separately. Create the workspace owner account using the private setup key, then invite the team. Each member must connect their own ChatGPT account. Laptop must stay awake and online.",
  );
} catch (e) {
  console.error(e.message);
  stop(1);
}
