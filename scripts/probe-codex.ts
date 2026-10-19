import { Codex } from "../apps/server/src/codex.ts";
const c = new Codex(process.cwd());
try {
  console.log(JSON.stringify(await c.status(), null, 2));
} finally {
  c.stop();
}
