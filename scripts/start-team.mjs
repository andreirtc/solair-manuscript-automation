import { spawn } from "node:child_process";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  openSync,
  closeSync,
  appendFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { createServer } from "node:net";
const root = resolve(import.meta.dirname, ".."),
  file = resolve(root, ".local/deployment/team.json"),
  cloud = resolve(root, ".local/bin/cloudflared");
if (!existsSync(file) || !existsSync(cloud))
  throw new Error(
    "Laptop preparation or cloudflared is missing. Read LAPTOP-TEAM.md; existing keys must not be regenerated.",
  );
const config = JSON.parse(readFileSync(file, "utf8"));
if (
  config.enabled !== true ||
  config.localGoogleConnector !== true ||
  Object.keys(config.workers || {})
    .sort()
    .join(",") !== "1,2,3,4"
)
  throw new Error(
    "Expected authenticated laptop configuration and four separate workers.",
  );
for (const port of [4781, 4791, 4792, 4793, 4794, 4798])
  await new Promise((ok, no) => {
    const server = createServer();
    server.once("error", () =>
      no(
        new Error(
          `Port ${port} is already in use. The app may already be running. Open its current address; do not launch a duplicate.`,
        ),
      ),
    );
    server.listen(port, "127.0.0.1", () => server.close(ok));
  });
mkdirSync(resolve(root, ".local/logs"), { recursive: true, mode: 0o700 });
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  const timer = setTimeout(() => {
    for (const child of children)
      if (child.exitCode === null) child.kill("SIGKILL");
    process.exit(code);
  }, 2500);
  timer.unref();
  process.exitCode = code;
}
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop());
function start(command, args, name, capture = false) {
  const fd = openSync(resolve(root, ".local/logs", name + ".log"), "a", 0o600);
  const child = spawn(command, args, {
    cwd: root,
    stdio: ["ignore", capture ? "pipe" : fd, capture ? "pipe" : fd],
  });
  closeSync(fd);
  if (capture)
    for (const stream of [child.stdout, child.stderr])
      stream.on("data", (chunk) =>
        appendFileSync(resolve(root, ".local/logs", name + ".log"), chunk, {
          mode: 0o600,
        }),
      );
  children.push(child);
  child.once("error", () => {
    console.error(name + " could not start. Check its private log.");
    stop(1);
  });
  child.once("exit", () => {
    if (!stopping) {
      console.error(name + " stopped; stopping the session.");
      stop(1);
    }
  });
  return child;
}
async function ready() {
  for (let i = 0; i < 600 && !stopping; i++) {
    try {
      const r = await fetch("http://127.0.0.1:4781/api/v1/auth/status", {
          signal: AbortSignal.timeout(1500),
        }),
        s = await r.json();
      if (
        r.ok &&
        s.data?.enabled === true &&
        s.data.publicOrigin === config.publicOrigin
      )
        return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(
    "The authenticated team server did not become ready. Check .local/logs.",
  );
}
try {
  console.log(
    "Starting a free temporary HTTPS tunnel. This can take a minute.",
  );
  const tunnel = start(
    cloud,
    [
      "tunnel",
      "--url",
      "http://127.0.0.1:4798",
      "--protocol",
      "http2",
      "--no-autoupdate",
    ],
    "cloudflared",
    true,
  );
  const origin = await new Promise((ok, no) => {
    const timer = setTimeout(
      () =>
        no(
          new Error(
            "Cloudflare did not provide a temporary address. Check internet access and retry after stopping this session.",
          ),
        ),
      120000,
    );
    function consume(chunk) {
      const match = String(chunk).match(
        /https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/,
      );
      if (match && match[0] !== "https://api.trycloudflare.com") {
        clearTimeout(timer);
        ok(match[0]);
      }
    }
    tunnel.stdout.on("data", consume);
    tunnel.stderr.on("data", consume);
    tunnel.once("exit", () => {
      clearTimeout(timer);
      no(new Error("Cloudflare exited before the address was ready."));
    });
  });
  config.publicOrigin = origin;
  writeFileSync(file, JSON.stringify(config, null, 2), { mode: 0o600 });
  start(process.execPath, ["scripts/run-laptop-team.mjs"], "laptop-session");
  await ready();
  start(process.execPath, ["scripts/team-proxy.mjs"], "guard-proxy");
  writeFileSync(resolve(root, ".local/team-address.txt"), origin + "\n", {
    mode: 0o600,
  });
  console.log("Open on this laptop: http://127.0.0.1:4781");
  console.log("Share with your team: " + origin);
  console.log(
    "Leave this terminal running and keep the laptop awake. Ctrl+C stops this session. Sign-in instructions are in the website. Each member must authorize their own ChatGPT.",
  );
} catch (error) {
  console.error(error.message);
  stop(1);
}
