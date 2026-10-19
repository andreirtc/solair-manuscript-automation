import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
const out = ".local/acceptance/chat-attachments";
mkdirSync(out, { recursive: true });
const b = await chromium.launch({
  executablePath:
    process.env.SOLAIR_CHROME ||
    "/home/ralphandreicastillo326/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome",
  headless: true,
  args: ["--no-sandbox"],
});
const checks = [],
  errors = [];
try {
  for (const width of [1440, 390])
    for (const theme of ["light", "dark"]) {
      const c = await b.newContext({
        viewport: { width, height: width === 390 ? 844 : 1000 },
        colorScheme: theme,
      });
      const p = await c.newPage();
      p.on("pageerror", (e) => errors.push(e.message));
      const sources = [],
        texts = new Map(),
        sent = [];
      let thread = {
        id: "22222222-2222-4222-8222-222222222222",
        title: "Attachment QA",
        purpose: "questions",
        createdAt: new Date().toISOString(),
        messages: [],
      };
      await p.route("**/api/v1/**", async (r) => {
        const req = r.request(),
          path = new URL(req.url()).pathname.replace("/api/v1", ""),
          method = req.method();
        let data, body;
        try {
          body = req.postDataJSON();
        } catch {}
        if (path === "/auth/status")
          data = {
            enabled: true,
            configured: true,
            authenticated: true,
            actor: {
              id: "fixture-member",
              name: "Teammate",
              username: "fixture",
              role: "editor",
              slot: 2,
            },
          };
        else if (path === "/manuscript")
          data = {
            documentId: "qa",
            tabId: "qa",
            readState: "cached_snapshot",
          };
        else if (path === "/manuscript/sections") data = { sections: [] };
        else if (path === "/jobs") data = [];
        else if (path === "/sources") data = sources;
        else if (path === "/chat/attachments") {
          const raw = req.postDataBuffer().toString("utf8"),
            name = /filename="([^"]+)"/.exec(raw)?.[1] || "notes.txt",
            text = raw
              .split("\r\n\r\n")
              .slice(1)
              .join("\r\n\r\n")
              .split("\r\n--")[0];
          data = {
            id: `11111111-1111-4111-8111-${String(sources.length + 1).padStart(12, "0")}`,
            name,
            preparedKind: "text",
            mime: "text/plain",
            origin: "upload",
            status: "needs_mapping",
            evidenceReviewed: false,
            createdAt: new Date().toISOString(),
            extractionNotice:
              "Text only. Native equations and figures need original inspection.",
          };
          sources.push(data);
          texts.set(data.id, text);
        } else if (/^\/sources\/[^/]+\/text$/.test(path))
          data = { text: texts.get(path.split("/")[2]) };
        else if (path === "/chat/threads") {
          if (method !== "GET") thread = { ...thread, purpose: body.purpose };
          data = method === "GET" ? [thread] : thread;
        } else if (path === `/chat/threads/${thread.id}/messages`) {
          sent.push(body);
          thread = {
            ...thread,
            messages: [
              {
                id: "u",
                role: "user",
                text: body.text,
                attachmentIds: body.attachmentIds,
                status: "complete",
                createdAt: thread.createdAt,
              },
              {
                id: "a",
                role: "assistant",
                text: "Fixture discussion only.",
                status: "complete",
                createdAt: thread.createdAt,
              },
            ],
          };
          data = { status: "accepted" };
        } else if (path === `/chat/threads/${thread.id}`) data = thread;
        else
          return r.fulfill({
            status: 404,
            contentType: "application/json",
            body: JSON.stringify({ error: { message: "Unmocked " + path } }),
          });
        await r.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data }),
        });
      });
      await p.goto("http://127.0.0.1:4781/app");
      await p
        .getByRole("button", { name: /Questions/ })
        .first()
        .click();
      const input = p.locator("#message-input"),
        long = "Adviser notes: proposed work only.\n".repeat(500);
      await input.evaluate((el, text) => {
        const dt = new DataTransfer();
        dt.setData("text/plain", text);
        el.dispatchEvent(
          new ClipboardEvent("paste", {
            clipboardData: dt,
            bubbles: true,
            cancelable: true,
          }),
        );
      }, long);
      await p
        .locator(".attachment-tray")
        .getByRole("button", { name: "Pasted text", exact: true })
        .waitFor();
      assert.equal(await input.inputValue(), "");
      assert.equal(sent.length, 0);
      await p
        .locator(".attachment-tray")
        .getByRole("button", { name: "Pasted text", exact: true })
        .click();
      await p
        .getByRole("textbox", { name: "Extracted text of Pasted text" })
        .waitFor();
      assert.equal(
        await p
          .getByRole("textbox", { name: "Extracted text of Pasted text" })
          .inputValue(),
        long,
      );

      await p
        .locator("input[type=file]")
        .setInputFiles({
          name: "adviser-feedback.docx",
          mimeType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          buffer: Buffer.from("Synthetic document upload UI fixture"),
        });
      await p
        .locator(".attachment-tray")
        .getByRole("button", { name: "adviser-feedback.docx", exact: true })
        .waitFor();
      assert.equal(sent.length, 0);
      await input.fill("Explain these notes without changing the manuscript.");
      await p.evaluate(async () => {
        await document.fonts.ready;
        document.activeElement?.blur?.();
      });
      assert(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await p.evaluate(() => {
        document.activeElement?.blur?.();
        document.documentElement.style.scrollBehavior = "auto";
        window.scrollTo({ top: 0, behavior: "instant" });
      });
      await p.evaluate(() => {
        document.body.tabIndex = -1;
        document.body.focus({ preventScroll: true });
        window.scrollTo({ top: 0, behavior: "instant" });
      });
      await p.waitForFunction(
        () => scrollY === 0 && document.activeElement === document.body,
      );
      await p.screenshot({
        path: `${out}/composer-${width}-${theme}.png`,
        fullPage: true,
      });
      await p.getByRole("button", { name: "Send manuscript request" }).click();
      await p.getByText("Fixture discussion only.", { exact: true }).waitFor();
      assert.equal(sent.length, 1);
      assert.equal(sent[0].attachmentIds.length, 2);
      assert.deepEqual(sent[0].sourceIds, []);
      assert.equal(sent[0].helperRole, "questions");
      assert.equal(await p.locator(".attachment-tray").count(), 0);
      await p.getByRole("button", { name: "Paste text", exact: true }).click();
      await p.locator("#paste-attachment").fill("Short explicit pasted note");
      await p.getByRole("button", { name: "Attach text", exact: true }).click();
      await p
        .getByRole("button", { name: "Detach Pasted text", exact: true })
        .click();
      assert.equal(await p.locator(".attachment-tray").count(), 0);
      await input.evaluate((el) => {
        const dt = new DataTransfer();
        dt.setData("text/plain", "x".repeat(200001));
        el.dispatchEvent(
          new ClipboardEvent("paste", {
            clipboardData: dt,
            bubbles: true,
            cancelable: true,
          }),
        );
      });
      await p.getByText(/Pasted text exceeds 200,000/).waitFor();
      assert.equal(sources.length, 3);
      assert.equal(sent.length, 1);
      checks.push(
        `${width}px ${theme}: automatic full long-paste attachment, preview, DOCX upload, explicit send, context IDs, manual paste/detach, oversized rejection, no overflow`,
      );
      await c.close();
    }
  assert.deepEqual(errors, []);
  writeFileSync(
    out + "/result.json",
    JSON.stringify(
      {
        at: new Date().toISOString(),
        scope: "Browser fixtures, no real account/Google write",
        checks,
        errors,
      },
      null,
      2,
    ),
  );
  console.log({ checks: checks.length });
} finally {
  await b.close();
}
