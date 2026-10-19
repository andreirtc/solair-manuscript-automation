import type {
  Connections,
  AccountUsage,
} from "../../../packages/contracts/index.ts";
import type { Actor, Team, WorkerConfig } from "./team.ts";
import type { Codex } from "./codex.ts";
import { AppError } from "./manuscript.ts";
import { AIRequestError } from "./ai-errors.ts";
export interface AIChoice {
  model: string;
  effort: string;
}
export interface ResearchAction {
  type: string;
  id?: string;
  status?: "started" | "completed";
  query?: string;
  queries?: string[];
  url?: string;
}
export type AIProgress = "thinking" | "answering";
export interface AIClient {
  steer?(text: string, providerId: string): Promise<{ delivered: boolean }>;
  usage?(): Promise<AccountUsage>;
  models?(): Promise<{ model: string; label: string; efforts: string[] }[]>;
  status(): Promise<Connections>;
  propose(
    providerId: string | undefined,
    prompt: string,
    onDelta: (s: string) => void,
    onProvider: (id: string) => void,
    choice?: AIChoice,
    research?: boolean,
    onResearch?: (action: ResearchAction) => void,
    onProgress?: (stage: AIProgress) => void,
  ): Promise<string>;
  beginLogin?(): Promise<any>;
  cancelLogin?(loginId: string): Promise<any>;
  logout?(): Promise<any>;
}
export class RemoteAI implements AIClient {
  constructor(public config: WorkerConfig) {
    const u = new URL(config.url);
    if (!["http:", "https:"].includes(u.protocol) || u.username || u.password)
      throw new Error("Invalid private worker endpoint.");
  }
  async request(path: string, body: any = {}) {
    const r = await fetch(this.config.url + path, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + this.config.key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(660000),
    });
    if (!r.ok) {
      const detail = (await r.json().catch(() => ({}))) as any;
      if (r.status === 409)
        throw new AppError(
          detail.code === "PERSONAL_SIGN_IN_PENDING"
            ? "PERSONAL_SIGN_IN_PENDING"
            : "PERSONAL_AI_BUSY",
          detail.code === "PERSONAL_SIGN_IN_PENDING"
            ? "Finish connecting your own ChatGPT in Settings, check connections, then resend this request."
            : "Your ChatGPT account is already answering another conversation. Wait for that answer to finish, then resend this request.",
          409,
        );
      if (r.status === 413 || detail.code === "PROMPT_TOO_LARGE")
        throw new AppError(
          "PROMPT_TOO_LARGE",
          "This request has too much context. Use fewer sources or a smaller section, then resend it.",
          413,
        );
      if (r.status === 401)
        throw new AppError(
          "WORKER_CONFIGURATION",
          "Your private worker connection needs host repair. Ask the workspace host to check Settings; signing out of ChatGPT will not repair it.",
          502,
        );
      throw new AppError(
        "MEMBER_AI_UNAVAILABLE",
        "Your personal AI worker is unavailable. Your request has not been sent through another member’s account.",
        502,
      );
    }
    return r;
  }
  async steer(text: string, providerId: string) {
    return (await this.request("/steer", { text, providerId })).json() as Promise<{ delivered: boolean }>;
  }
  async status(): Promise<Connections> {
    return (await this.request("/status")).json();
  }
  async models() {
    return (await this.request("/models")).json();
  }
  async usage(): Promise<AccountUsage> {
    return (await this.request("/usage")).json();
  }
  async beginLogin() {
    return (await this.request("/login")).json();
  }
  async cancelLogin(loginId: string) {
    return (await this.request("/login/cancel", { loginId })).json();
  }
  async logout() {
    return (await this.request("/logout")).json();
  }
  async propose(
    providerId: string | undefined,
    prompt: string,
    onDelta: (s: string) => void,
    onProvider: (id: string) => void,
    choice?: AIChoice,
    research?: boolean,
    onResearch?: (action: ResearchAction) => void,
    onProgress?: (stage: AIProgress) => void,
  ) {
    const r = await this.request("/propose", {
      providerId,
      prompt,
      ...(choice ? { choice } : {}),
      research: !!research,
    });
    if (!r.body) throw new Error("Your AI worker returned no response.");
    const reader = r.body.getReader(),
      decoder = new TextDecoder();
    let buffer = "",
      final: string | undefined,
      total = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > 2 * 1024 * 1024)
          throw new Error("Your AI response exceeded the safe limit.");
        buffer += decoder.decode(value, { stream: true });
        let i: number;
        while ((i = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, i);
          buffer = buffer.slice(i + 1);
          if (!line) continue;
          const e = JSON.parse(line);
          if (e.type === "provider") onProvider(e.id);
          else if (e.type === "delta") onDelta(e.text);
          else if (e.type === "research") onResearch?.(e.action);
          else if (
            e.type === "progress" &&
            ["thinking", "answering"].includes(e.stage)
          )
            onProgress?.(e.stage);
          else if (e.type === "completed") final = e.text;
          else if (e.type === "failed")
            throw new AIRequestError(
              typeof e.code === "string" ? e.code : "AI_FAILED",
            );
        }
      }
      if (final === undefined)
        throw new Error("Your AI worker disconnected before completion.");
      return final;
    } finally {
      await reader.cancel().catch(() => {});
    }
  }
}
export class MemberAI {
  clients = new Map<number, RemoteAI>();
  constructor(
    public team: Team,
    public local: Codex,
  ) {}
  forActor(actor: Actor): AIClient {
    if (!this.team.config.enabled) return this.local;
    const config = this.team.config.workers[String(actor.slot)];
    if (!config?.url || !config?.key)
      throw new AppError(
        "PERSONAL_AI_NOT_CONFIGURED",
        "Your personal AI worker is not configured yet. No other member’s account will be used.",
        409,
      );
    let client = this.clients.get(actor.slot);
    if (!client) {
      client = new RemoteAI(config);
      this.clients.set(actor.slot, client);
    }
    return client;
  }
}
