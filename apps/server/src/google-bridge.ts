import { createHmac, randomBytes } from "node:crypto";
import type { Google } from "./manuscript.ts";
import { AppError, TARGET, INBOX } from "./manuscript.ts";
export interface BridgeConfig {
  url: string;
  key: string;
}
/** Signed requests go only to the owner's fixed, scoped Apps Script deployment. */
export class GoogleBridge implements Google {
  privateImages: boolean;
  constructor(
    public config: BridgeConfig,
    public privateImageOrigin?: string,
    enablePrivateImageTrials = false,
  ) {
    if (privateImageOrigin) {
      const origin = new URL(privateImageOrigin);
      if (
        origin.protocol !== "https:" ||
        origin.username ||
        origin.password ||
        origin.pathname !== "/" ||
        origin.search ||
        origin.hash
      )
        throw new Error(
          "Use the exact configured HTTPS app origin for private image transfers.",
        );
    }
    this.privateImages = Boolean(
      privateImageOrigin && enablePrivateImageTrials,
    );
    const u = new URL(config.url);
    if (
      u.protocol !== "https:" ||
      u.hostname !== "script.google.com" ||
      !/^\/macros\/s\/[\w-]+\/exec$/.test(u.pathname) ||
      u.search ||
      u.hash ||
      u.username ||
      u.password ||
      config.key.length < 32
    )
      throw new Error(
        "Use a deployed Google Apps Script URL and a private bridge key.",
      );
  }
  async call(action: string, args: any) {
    const timestamp = Date.now(),
      nonce = randomBytes(24).toString("hex"),
      payload = JSON.stringify({ action, args });
    const signature = createHmac("sha256", this.config.key)
      .update(`${timestamp}.${nonce}.${payload}`)
      .digest("hex");
    // Apps Script ContentService redirects its result to Google's response host. Never put the key in a URL.
    const response = await fetch(this.config.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timestamp, nonce, payload, signature }),
      signal: AbortSignal.timeout(180000),
    });
    const text = await response.text();
    if (!response.ok || text.length > 58 * 1024 * 1024)
      throw new AppError(
        "GOOGLE_BRIDGE_UNAVAILABLE",
        "The Google bridge did not return a supported response.",
        502,
      );
    let result: any;
    try {
      result = JSON.parse(text);
    } catch {
      throw new AppError(
        "GOOGLE_BRIDGE_UNAVAILABLE",
        "Check the Apps Script deployment and access setting.",
        502,
      );
    }
    if (!result.ok)
      throw new AppError(
        "GOOGLE_BRIDGE_REJECTED",
        "The scoped Google bridge rejected this operation. Refresh the document and check deployment authorization.",
        502,
      );
    return result.data;
  }
  async applyJob(job: any, revision: string) {
    return this.call("apply", { job, revision });
  }
  async tool(name: string, args: any) {
    if (name === "get_document" && args.document_id === TARGET.document_id)
      return this.call("get", {});
    if (
      name === "get_source_document" &&
      /^[\w-]+$/.test(args.document_id || "")
    )
      return this.call("source", {
        id: args.document_id,
        inbox: INBOX,
        nativeDocument: true,
      });
    if (
      name === "copy_file" &&
      args.url ===
        `https://docs.google.com/document/d/${TARGET.document_id}/edit`
    )
      return this.call("backup", { title: args.new_title });
    if (name === "search") return this.call("inbox", {});
    if (name === "fetch") {
      if (
        args.url ===
          `https://docs.google.com/document/d/${TARGET.document_id}/edit` &&
        args.raw_export_mime_type === "application/pdf"
      )
        return this.call("pdf", {});
      const m = String(args.url).match(
        /^https:\/\/drive\.google\.com\/file\/d\/([\w-]+)\/view$/,
      );
      if (m) return this.call("source", { id: m[1], inbox: INBOX });
    }
    throw new AppError(
      "GOOGLE_SCOPE_REJECTED",
      "The cloud adapter permits only the trial document and designated inbox.",
      403,
    );
  }
}
