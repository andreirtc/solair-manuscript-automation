import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, ".."),
  dir = resolve(root, ".local/deployment");
const laptop =
  process.argv.includes("--laptop") ||
  (() => {
    try {
      return (
        JSON.parse(readFileSync(resolve(dir, "team.json"), "utf8")).workers?.[
          "1"
        ]?.url === "http://127.0.0.1:4791"
      );
    } catch {
      return false;
    }
  })();
const checks = [];
const add = (name, passed, next) =>
  checks.push({ name, passed, next: passed ? null : next });
const run = (args, env = process.env) => {
  const result = spawnSync("docker", args, {
    cwd: root,
    env,
    encoding: "utf8",
    timeout: 10000,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return !result.error && result.status === 0;
};
add(
  "Node 24 or newer",
  Number(process.versions.node.split(".")[0]) >= 24,
  "Install Node 24 or newer on the host.",
);
const docker = laptop
  ? false
  : run(["version", "--format", "{{.Server.Version}}"]);
const compose = laptop ? false : run(["compose", "version"]);
if (laptop) {
  const cli = spawnSync(
    process.env.SOLAIR_CODEX_BIN || "codex",
    ["--version"],
    { encoding: "utf8", timeout: 10000 },
  );
  add(
    "Local Codex CLI available",
    !cli.error && cli.status === 0,
    "Install the supported Codex CLI; fresh personal sign-ins remain separate.",
  );
} else {
  add(
    "Docker daemon reachable",
    docker,
    "Install/start Docker Engine on the chosen host.",
  );
  add(
    "Docker Compose available",
    compose,
    "Install the Docker Compose plugin.",
  );
}
let config;
try {
  config = JSON.parse(readFileSync(resolve(dir, "team.json"), "utf8"));
  const origin = new URL(config.publicOrigin),
    bridge = config.googleBridge ? new URL(config.googleBridge.url) : undefined;
  if (
    config.enabled !== true ||
    origin.protocol !== "https:" ||
    origin.origin !== config.publicOrigin ||
    (!bridge && !(laptop && config.localGoogleConnector === true)) ||
    (bridge &&
      (bridge.protocol !== "https:" ||
        bridge.hostname !== "script.google.com" ||
        !/^\/macros\/s\/[\w-]+\/exec$/.test(bridge.pathname) ||
        bridge.search ||
        bridge.hash ||
        bridge.username ||
        bridge.password))
  )
    throw new Error("Invalid configuration");
  if (Object.keys(config.workers).sort().join(",") !== "1,2,3,4")
    throw new Error("Four workers required");
  const workers = Object.values(config.workers);
  if (
    workers.some((w) => {
      const u = new URL(w.url);
      return (
        !["http:", "https:"].includes(u.protocol) || u.username || u.password
      );
    })
  )
    throw new Error("Private worker URL rejected");
  if (
    new Set(workers.map((w) => new URL(w.url).href)).size !== 4 ||
    new Set(workers.map((w) => w.key)).size !== 4
  )
    throw new Error("Separate workers required");
  const matching = (file, key) =>
    typeof key === "string" &&
    key.length >= 32 &&
    readFileSync(resolve(dir, file), "utf8").trim() === key;
  if (
    (config.googleBridge &&
      !matching("google-bridge.key", config.googleBridge.key)) ||
    ![1, 2, 3, 4].every((slot) =>
      matching(`worker${slot}.key`, config.workers[slot].key),
    )
  )
    throw new Error("Private keys do not match");
  if (
    process.platform !== "win32" &&
    ([
      "team.json",
      "google-bridge.key",
      ...[1, 2, 3, 4].map((s) => `worker${s}.key`),
    ].some((name) => (statSync(resolve(dir, name)).mode & 0o077) !== 0) ||
      (statSync(dir).mode & 0o077) !== 0)
  )
    throw new Error("Private file permissions required");
  add("Private team configuration and four distinct worker keys", true);
} catch {
  config = undefined;
  add(
    "Private team configuration and four distinct worker keys",
    false,
    "Prepare configuration with your real HTTPS hostname and Google /exec URL using scripts/prepare-team.mjs. If files already exist, recover those credentials instead of regenerating them; keep Unix file permissions private.",
  );
}
const context = [
  "deploy/context/SOLAIR-reconciled-setup-baseline.md",
  "deploy/context/SOLAIR-GUI-Orca-plan.md",
  "deploy/google/Core.gs",
];
add(
  "Deployment context and guarded Google engine",
  context.every((name) => existsSync(resolve(root, name))),
  "Run deployment preparation after bringing the two project context files and guarded engine.",
);
if (laptop) {
  add(
    "Laptop worker configuration and isolated homes",
    !!config &&
      [1, 2, 3, 4].every(
        (slot) =>
          config.workers[slot].url === `http://127.0.0.1:${4790 + slot}` &&
          existsSync(
            resolve(root, `.local/workers/member${slot}/.codex/config.toml`),
          ),
      ),
    "Prepare laptop mode with four distinct loopback workers first.",
  );
} else if (docker && compose && config) {
  const host = new URL(config.publicOrigin).host;
  add(
    "Compose configuration validates",
    run(["compose", "-f", "deploy/compose.yaml", "config", "--quiet"], {
      ...process.env,
      SOLAIR_HOST: host,
    }),
    "Validate the current Compose file and private configuration on this host.",
  );
} else
  add(
    "Compose configuration validates",
    false,
    "Resolve Docker, Compose and private configuration checks above, then rerun.",
  );
const report = {
  readOnly: true,
  preflightPassed: checks.every((c) => c.passed),
  liveAcceptance: false,
  checks,
  stillRequired: [
    "A usable host and HTTPS/DNS reachability",
    laptop
      ? "Project Google connection and live duplicate checks"
      : "Google bridge deployment, script properties and live trial checks",
    "Four separate personal ChatGPT consents and per-member quota checks",
    laptop
      ? "Actual laptop worker startup, HTTPS access and four personal consents"
      : "Actual container build/boot, private-image/PDF checks and phone access",
  ],
};
if (process.argv.includes("--json"))
  console.log(JSON.stringify(report, null, 2));
else {
  console.log(
    "SOLAIR deployment prerequisites (read-only; no keys or containers changed)",
  );
  for (const c of checks)
    console.log(
      `${c.passed ? "PASS" : "PENDING"} ${c.name}${c.next ? "\n  " + c.next : ""}`,
    );
  console.log(
    "Live hosting/account/manuscript acceptance remains separate even when these prerequisites pass.",
  );
}
process.exitCode = report.preflightPassed ? 0 : 2;
