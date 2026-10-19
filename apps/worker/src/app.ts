import express from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Codex } from "../../server/src/codex.ts";
import { unavailableUsage } from "../../server/src/account-usage.ts";
import { publicAIError } from "../../server/src/ai-errors.ts";
export function createWorker(codex: Codex, key: string) {
  if (key.length < 32) throw new Error("A private worker key is required.");
  const app = express();
  let busy = false,
    loginId: string | undefined;
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.set({
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    const received = String(req.headers.authorization || "");
    const digest = (v: string) => createHash("sha256").update(v).digest();
    if (!timingSafeEqual(digest(received), digest("Bearer " + key)))
      return res.status(401).json({ error: "Worker authorization required." });
    if (req.headers.origin)
      return res
        .status(403)
        .json({ error: "Direct browser access is disabled." });
    next();
  });
  app.use(express.json({ limit: "250kb" }));
  async function reconcileLogin() {
    // A completed device authorization can arrive before/without its notification.
    // Read managed account state; never inspect/copy auth caches or start inference.
    if (loginId && !busy) {
      await codex.start();
      const result = await codex.rpc("account/read", { refreshToken: false });
      if (result.account?.type === "chatgpt") loginId = undefined;
    }
  }
  app.post("/usage", async (_req, res) => {
    await reconcileLogin();
    res.json(loginId ? unavailableUsage() : await codex.usage());
  });
  app.post("/models", async (_req, res) => {
    await reconcileLogin();
    if (busy || loginId)
      return res.status(409).json({
        code: loginId ? "PERSONAL_SIGN_IN_PENDING" : "PERSONAL_AI_BUSY",
        error: "Finish your current action or sign-in first.",
      });
    res.json(await codex.models());
  });
  app.post("/status", async (_req, res) => {
    await reconcileLogin();
    res.json({
      ...(await codex.status()),
      worker: { busy, loginPending: !!loginId },
    });
  });
  codex.on("account/login/completed", (r: any) => {
    if (r.loginId === loginId) loginId = undefined;
  });
  app.post("/login", async (_req, res) => {
    if (busy)
      return res.status(409).json({ error: "An AI action is running." });
    busy = true;
    try {
      await codex.start();
      if (loginId)
        await codex.rpc("account/login/cancel", { loginId }).catch(() => {});
      loginId = undefined;
      await codex.rpc("account/logout", {});
      const r = await codex.rpc("account/login/start", {
          type: "chatgptDeviceCode",
        }),
        u = new URL(r.verificationUrl);
      if (
        u.protocol !== "https:" ||
        !["auth.openai.com", "chatgpt.com", "auth0.openai.com"].includes(
          u.hostname,
        )
      )
        throw new Error("Unexpected verification endpoint.");
      loginId = r.loginId;
      res.json({
        type: r.type,
        loginId: r.loginId,
        verificationUrl: r.verificationUrl,
        userCode: r.userCode,
      });
    } finally {
      busy = false;
    }
  });
  app.post("/login/cancel", async (req, res) => {
    if (busy)
      return res.status(409).json({ error: "An AI action is running." });
    busy = true;
    try {
      const b = z.object({ loginId: z.string() }).strict().parse(req.body);
      if (b.loginId !== loginId)
        return res
          .status(409)
          .json({ error: "Login does not match this worker." });
      res.json(await codex.rpc("account/login/cancel", b));
      loginId = undefined;
    } finally {
      busy = false;
    }
  });
  app.post("/logout", async (_req, res) => {
    if (busy) return res.status(409).json({ error: "An AI turn is running." });
    busy = true;
    try {
      await codex.start();
      if (loginId) await codex.rpc("account/login/cancel", { loginId });
      loginId = undefined;
      res.json(await codex.rpc("account/logout", {}));
    } finally {
      busy = false;
    }
  });
  app.post("/steer", async (req, res) => {
    const b = z.object({ text: z.string().trim().min(1).max(12000), providerId: z.string().min(1) }).strict().parse(req.body);
    res.json(busy ? await codex.steer(b.text, b.providerId) : { delivered: false });
  });
  app.post("/propose", async (req, res) => {
    await reconcileLogin();
    const b = z
      .object({
        providerId: z.string().optional(),
        research: z.boolean().default(false),
        choice: z
          .object({
            model: z.string().min(1).max(100),
            effort: z.enum(["low", "medium", "high", "xhigh", "max"]),
          })
          .strict()
          .optional(),
        prompt: z.string().min(1).max(180000),
      })
      .strict()
      .parse(req.body);
    if (busy || loginId)
      return res.status(409).json({
        code: loginId ? "PERSONAL_SIGN_IN_PENDING" : "PERSONAL_AI_BUSY",
        error: "Your AI worker is busy or sign-in is pending.",
      });
    busy = true;
    res.set({ "Content-Type": "application/x-ndjson" });
    res.flushHeaders();
    const emit = (e: any) => res.write(JSON.stringify(e) + "\n");
    const heartbeat = setInterval(() => emit({ type: "heartbeat" }), 15000);
    try {
      const text = await codex.propose(
        b.providerId,
        b.prompt,
        (text) => emit({ type: "delta", text }),
        (id) => emit({ type: "provider", id }),
        b.choice,
        b.research,
        (action) => emit({ type: "research", action }),
        (stage) => emit({ type: "progress", stage }),
      );
      emit({ type: "completed", text });
    } catch (error) {
      emit({
        type: "failed",
        ...publicAIError(error),
      });
    } finally {
      clearInterval(heartbeat);
      busy = false;
      res.end();
    }
  });
  app.use(
    (
      _e: any,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (_e?.type === "entity.too.large")
        return res.status(413).json({
          code: "PROMPT_TOO_LARGE",
          error: "The request context is too large.",
        });
      if (_e instanceof z.ZodError)
        return res.status(400).json({
          code: "INVALID_AI_REQUEST",
          error: "The AI request did not match the supported contract.",
        });
      return res.status(502).json({
        code: "PERSONAL_WORKER_FAILED",
        error: "Personal AI worker request failed.",
      });
    },
  );

  return app;
}
