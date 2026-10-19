import { readFileSync } from "node:fs";
import { Codex } from "../../server/src/codex.ts";
import { createWorker } from "./app.ts";
const key = process.env.SOLAIR_WORKER_KEY_FILE
  ? readFileSync(process.env.SOLAIR_WORKER_KEY_FILE, "utf8").trim()
  : process.env.SOLAIR_WORKER_KEY;
if (!key || key.length < 32)
  throw new Error("A private worker key is required.");
const codex = new Codex(process.cwd()),
  app = createWorker(codex, key);
const server = app.listen(
  Number(process.env.SOLAIR_WORKER_PORT || 4790),
  process.env.SOLAIR_WORKER_BIND || "127.0.0.1",
);
for (const sig of ["SIGINT", "SIGTERM"] as const)
  process.on(sig, () => {
    server.close();
    codex.stop();
    process.exit(0);
  });
