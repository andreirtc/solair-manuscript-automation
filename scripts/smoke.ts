const base = "http://127.0.0.1:4781/api/v1";
const statusRes = await fetch(base + "/auth/status");
if (!statusRes.ok) throw new Error("/auth/status failed");
const authStatus = await statusRes.json();
if (authStatus.data?.enabled) {
  console.log(
    "PASS /auth/status (team mode active, origin: " +
      (authStatus.data.publicOrigin || "local") +
      ")",
  );
  for (const path of [
    "/health",
    "/manuscript",
    "/jobs",
    "/sources",
    "/chat/threads",
    "/activity",
    "/manuscript/print-readiness",
  ]) {
    const r = await fetch(base + path),
      j = await r.json();
    if (r.status !== 401 || j.error?.code !== "SIGN_IN_REQUIRED")
      throw new Error("Anonymous route was not guarded: " + path);
    console.log("PASS anonymous access denied: " + path);
  }
  console.log(
    "This smoke check verifies anonymous route guards only. Personal account consent and authenticated manuscript workflows remain separate.",
  );
  process.exit(0);
}

for (const path of [
  "/health",
  "/manuscript",
  "/automation",
  "/jobs",
  "/sources",
  "/chat/threads",
  "/manuscript/equations",
  "/manuscript/print-readiness",
]) {
  const r = await fetch(base + path);
  if (!r.ok) throw new Error(path + " failed");
  const j = await r.json();
  if (!j.data) throw new Error("Invalid envelope");
  console.log("PASS " + path);
}
