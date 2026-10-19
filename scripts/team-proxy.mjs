/** Tunnel origin is published only while the upstream requires workspace authentication. */
import { createServer, request } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, ".."),
  config = JSON.parse(
    readFileSync(resolve(root, ".local/deployment/team.json"), "utf8"),
  );
if (config.enabled !== true || !config.publicOrigin)
  throw new Error("Authenticated team configuration required.");
const host = new URL(config.publicOrigin).host;
const server = createServer(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (
    ![host, "127.0.0.1:4798", "localhost:4798"].includes(req.headers.host || "")
  ) {
    res.writeHead(403);
    res.end("Use the configured workspace address.");
    return;
  }
  try {
    const status = await fetch("http://127.0.0.1:4781/api/v1/auth/status", {
      signal: AbortSignal.timeout(2000),
    });
    const body = await status.json();
    if (
      !status.ok ||
      body.data?.enabled !== true ||
      body.data?.publicOrigin !== config.publicOrigin
    )
      throw new Error("Authentication is not enabled.");
  } catch {
    res.writeHead(503, { "Content-Type": "text/plain" });
    res.end(
      "The team workspace is offline. Keep the host laptop awake and start the authenticated team service.",
    );
    return;
  }
  const upstream = request(
    {
      hostname: "127.0.0.1",
      port: 4781,
      method: req.method,
      path: req.url,
      headers: {
        ...req.headers,
        host,
        "x-forwarded-proto": "https",
        "x-forwarded-host": host,
      },
    },
    (response) => {
      res.writeHead(response.statusCode || 502, response.headers);
      response.pipe(res);
    },
  );
  upstream.on("error", () => {
    if (!res.headersSent) res.writeHead(502);
    res.end("The host service is temporarily unavailable.");
  });
  req.on("aborted", () => upstream.destroy());
  req.pipe(upstream);
});
server.listen(4798, "127.0.0.1", () =>
  console.log(
    "Authenticated-team guard proxy listening on loopback 4798. AI worker ports remain private.",
  ),
);
for (const s of ["SIGTERM", "SIGINT"])
  process.on(s, () => server.close(() => process.exit(0)));
