import { randomBytes } from "node:crypto";
import {
  mkdirSync,
  writeFileSync,
  existsSync,
  copyFileSync,
  chmodSync,
} from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, ".."),
  dir = resolve(root, ".local/deployment");
const laptop = process.env.SOLAIR_PREPARE_LAPTOP === "1";
const origin = process.argv[2],
  bridgeUrl = process.argv[3];
if (!origin || (!bridgeUrl && !laptop))
  throw new Error(
    "Usage: node scripts/prepare-team.mjs https://YOUR_HOST https://script.google.com/macros/s/DEPLOYMENT/exec",
  );
const u = new URL(origin),
  b = bridgeUrl ? new URL(bridgeUrl) : undefined;
if (
  u.protocol !== "https:" ||
  u.origin !== origin ||
  (b &&
    (b.protocol !== "https:" ||
      b.hostname !== "script.google.com" ||
      !/^\/macros\/s\/[\w-]+\/exec$/.test(b.pathname) ||
      b.search ||
      b.hash ||
      b.username ||
      b.password))
)
  throw new Error(
    "Use an exact HTTPS origin and deployed Google Apps Script URL.",
  );
const privateFiles = [
  "team.json",
  "google-bridge.key",
  ...[1, 2, 3, 4].map((slot) => `worker${slot}.key`),
];
if (privateFiles.some((name) => existsSync(resolve(dir, name))))
  throw new Error(
    "Deployment configuration or keys already exist. Keep the existing credentials; do not regenerate them, including after a partial setup.",
  );
const contextNames = [
  "SOLAIR-reconciled-setup-baseline.md",
  "SOLAIR-GUI-Orca-plan.md",
];
for (const name of contextNames)
  if (
    !existsSync(resolve(root, "../outputs", name)) &&
    !existsSync(resolve(root, "deploy/context", name))
  )
    throw new Error(
      "Bring the two project context files into deploy/context before preparing a standalone checkout. No keys have been generated.",
    );
if (laptop && !existsSync(resolve(root, "deploy/worker-config.toml")))
  throw new Error(
    "Bring the isolated worker configuration first. No keys have been generated.",
  );
if (!existsSync(resolve(root, "packages/engine/Core.cjs")))
  throw new Error(
    "Bring the guarded manuscript engine before preparing deployment. No keys have been generated.",
  );
mkdirSync(resolve(root, ".local/cloud-state"), {
  recursive: true,
  mode: 0o700,
});
mkdirSync(resolve(root, "deploy/context"), { recursive: true });
mkdirSync(resolve(root, "deploy/google"), { recursive: true });
for (const name of contextNames)
  if (existsSync(resolve(root, "../outputs", name)))
    copyFileSync(
      resolve(root, "../outputs", name),
      resolve(root, "deploy/context", name),
    );
copyFileSync(
  resolve(root, "packages/engine/Core.cjs"),
  resolve(root, "deploy/google/Core.gs"),
);
mkdirSync(dir, { recursive: true, mode: 0o700 });
chmodSync(dir, 0o700);
const workers = {};
for (let slot = 1; slot <= 4; slot++) {
  const key = randomBytes(32).toString("hex");
  workers[slot] = {
    url: laptop ? `http://127.0.0.1:${4790 + slot}` : `http://ai-${slot}:4790`,
    key,
  };
  if (laptop) {
    const home = resolve(root, `.local/workers/member${slot}/.codex`);
    mkdirSync(home, { recursive: true, mode: 0o700 });
    copyFileSync(
      resolve(root, "deploy/worker-config.toml"),
      resolve(home, "config.toml"),
    );
  }
  writeFileSync(resolve(dir, `worker${slot}.key`), key, {
    mode: 0o600,
    flag: "wx",
  });
}
const key = randomBytes(32).toString("hex");
writeFileSync(resolve(dir, "google-bridge.key"), key, {
  mode: 0o600,
  flag: "wx",
});
writeFileSync(
  resolve(dir, "team.json"),
  JSON.stringify(
    {
      enabled: true,
      publicOrigin: origin,
      privateImageTrials: false,
      workers,
      ...(b
        ? { googleBridge: { url: bridgeUrl, key } }
        : { localGoogleConnector: true }),
    },
    null,
    2,
  ),
  { mode: 0o600, flag: "wx" },
);
console.log(
  laptop
    ? "Prepared private laptop configuration and four isolated account homes. Keys were not printed. Start npm run team:laptop; personal ChatGPT authorization remains separate."
    : "Prepared private deployment files. Keys were not printed. Set the Google script property from .local/deployment/google-bridge.key. Docker deployment is a separate, unverified step.",
);
