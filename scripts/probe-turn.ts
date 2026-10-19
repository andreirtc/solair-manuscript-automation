import { Codex } from "../apps/server/src/codex.ts";
const c = new Codex(process.cwd());
try {
  const text = await c.propose(
    undefined,
    "Connection test. Return answer READY and an empty operations array.",
    () => {},
    () => {},
  );
  console.log(text);
} catch (e) {
  console.error(
    (e as Error).message.replace(/https?:\/\/\S+/g, "[URL omitted]"),
  );
  process.exitCode = 1;
} finally {
  c.stop();
}
