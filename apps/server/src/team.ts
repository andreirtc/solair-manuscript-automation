import {
  randomBytes,
  createHash,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Request, Response } from "express";
import { Store, id, now } from "./store.ts";
import { AppError } from "./manuscript.ts";
import type { Actor } from "../../../packages/contracts/index.ts";
import type { BridgeConfig } from "./google-bridge.ts";
export type { Actor } from "../../../packages/contracts/index.ts";
const scrypt = promisify(scryptCallback);
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
interface Member extends Actor {
  passwordHash: string;
  salt: string;
  createdAt: string;
}
export interface WorkerConfig {
  url: string;
  key: string;
}
export interface TeamConfig {
  manuscriptMode?: "trial" | "maintained";
  localGoogleConnector?: boolean;
  enabled: boolean;
  publicOrigin?: string;
  workers: Record<string, WorkerConfig>;
  googleBridge?: BridgeConfig;
  privateImageTrials?: boolean;
}
export const localActor: Actor = {
  id: "local-owner",
  name: "Research leader",
  username: "local",
  role: "owner",
  slot: 0,
};
export class Team {
  attempts = new Map<string, { count: number; until: number }>();
  constructor(
    public store: Store,
    public config: TeamConfig,
  ) {
    const workers = Object.values(config.workers);
    if (
      new Set(workers.map((w) => new URL(w.url).href)).size !==
        workers.length ||
      new Set(workers.map((w) => w.key)).size !== workers.length
    )
      throw new Error(
        "Each member needs a distinct AI worker endpoint and private key.",
      );
    if (config.publicOrigin) {
      const u = new URL(config.publicOrigin);
      if (u.protocol !== "https:" || u.origin !== config.publicOrigin)
        throw new Error("The public origin must be an exact HTTPS origin.");
    }
    if (config.enabled && !store.list("member").length) {
      const p = join(store.dir, "team-bootstrap.txt");
      if (!existsSync(p))
        writeFileSync(p, randomBytes(32).toString("base64url"), {
          mode: 0o600,
        });
    }
  }
  publicMember(m: Member): Actor {
    return {
      id: m.id,
      name: m.name,
      username: m.username,
      role: m.role,
      slot: m.slot,
    };
  }
  members() {
    return this.store.list<Member>("member").map((m) => this.publicMember(m));
  }
  actor(req: Request): Actor | undefined {
    if (!this.config.enabled) return localActor;
    const cookie = String(req.headers.cookie || "")
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("solair_session="));
    if (!cookie) return;
    const token = cookie.slice("solair_session=".length);
    if (!/^[\w-]{40,60}$/.test(token)) return;
    const session = this.store.get("session", hash(token));
    if (!session || session.expiresAt < Date.now()) return;
    const member = this.store.get<Member>("member", session.memberId);
    return member ? this.publicMember(member) : undefined;
  }
  require(req: Request) {
    const a = this.actor(req);
    if (!a)
      throw new AppError(
        "SIGN_IN_REQUIRED",
        "Sign in to the team workspace.",
        401,
      );
    return a;
  }
  owner(req: Request) {
    const a = this.require(req);
    if (a.role !== "owner")
      throw new AppError(
        "OWNER_REQUIRED",
        "Only the workspace owner can manage invitations.",
        403,
      );
    return a;
  }
  status(req: Request) {
    return {
      enabled: this.config.enabled,
      configured: this.members().length > 0,
      memberLimit: 4,
      actor: this.actor(req) || null,
      publicOrigin: this.config.publicOrigin || null,
      allMembersMayApply: true,
      aiQuota: "individual_only_no_cross_member_fallback",
    };
  }
  rate(req: Request) {
    for (const [k, v] of this.attempts)
      if (v.until <= Date.now()) this.attempts.delete(k);
    const key = String(req.ip || "unknown"),
      entry = this.attempts.get(key);
    if (entry && entry.until > Date.now() && entry.count >= 12)
      throw new AppError(
        "TRY_LATER",
        "Too many sign-in attempts. Wait 15 minutes.",
        429,
      );
    if (this.attempts.size >= 5000 && !entry)
      throw new AppError("TRY_LATER", "Sign-in is busy. Retry later.", 429);
    this.attempts.set(key, {
      count: entry && entry.until > Date.now() ? entry.count + 1 : 1,
      until: Date.now() + 15 * 60 * 1000,
    });
  }
  session(res: Response, m: Member) {
    const token = randomBytes(32).toString("base64url");
    this.store.put("session", {
      id: hash(token),
      memberId: m.id,
      expiresAt: Date.now() + 12 * 60 * 60 * 1000,
    });
    res.cookie("solair_session", token, {
      httpOnly: true,
      secure: !!this.config.publicOrigin,
      sameSite: "lax",
      path: "/",
      maxAge: 12 * 60 * 60 * 1000,
    });
    return this.publicMember(m);
  }
  async password(password: string, salt: string) {
    return ((await scrypt(password, salt, 64)) as Buffer).toString("hex");
  }
  async setup(
    req: Request,
    res: Response,
    b: { key: string; name: string; username: string; password: string },
  ) {
    this.rate(req);
    if (!this.config.enabled)
      throw new AppError("TEAM_DISABLED", "Team mode is not enabled.", 409);
    if (this.members().length)
      throw new AppError(
        "ALREADY_CONFIGURED",
        "This workspace already has an owner.",
        409,
      );
    const expected = readFileSync(
      join(this.store.dir, "team-bootstrap.txt"),
      "utf8",
    ).trim();
    if (!timingSafeEqual(Buffer.from(hash(expected)), Buffer.from(hash(b.key))))
      throw new AppError("SIGN_IN_FAILED", "The setup key is incorrect.", 401);
    const salt = randomBytes(16).toString("hex"),
      passwordHash = await this.password(b.password, salt);
    // Check again after asynchronous password hashing: only one request may claim the owner.
    if (this.members().length)
      throw new AppError(
        "ALREADY_CONFIGURED",
        "This workspace already has an owner.",
        409,
      );
    const m: Member = {
      id: id(),
      name: b.name,
      username: b.username.toLowerCase(),
      role: "owner",
      slot: 1,
      passwordHash,
      salt,
      createdAt: now(),
    };
    this.store.put("member", m);
    this.store.activity(
      "team_owner_created",
      "Created the team owner workspace account.",
    );
    return this.session(res, m);
  }
  async login(
    req: Request,
    res: Response,
    b: { username: string; password: string },
  ) {
    if (!this.config.enabled)
      throw new AppError("TEAM_DISABLED", "Team mode is not enabled.", 409);
    this.rate(req);
    const m = this.store
      .list<Member>("member")
      .find((m) => m.username === b.username.toLowerCase());
    // Always hash, including unknown usernames, rather than leaking account presence.
    const computed = await this.password(
      b.password,
      m?.salt || "unregistered-account",
    );
    if (
      !m ||
      !timingSafeEqual(
        Buffer.from(computed, "hex"),
        Buffer.from(m.passwordHash, "hex"),
      )
    )
      throw new AppError(
        "SIGN_IN_FAILED",
        "Username or password is incorrect.",
        401,
      );
    return this.session(res, m);
  }
  invite(req: Request) {
    if (!this.config.enabled)
      throw new AppError("TEAM_DISABLED", "Team mode is not enabled.", 409);
    this.owner(req);
    const current = this.members().length,
      active = this.store
        .list("invite")
        .filter((i) => !i.used && i.expiresAt > Date.now());
    if (current + active.length >= 4)
      throw new AppError(
        "TEAM_FULL",
        "This workspace supports four members, including reserved invitations.",
        409,
      );
    const token = randomBytes(32).toString("base64url");
    const invite = {
      id: hash(token),
      used: false,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    };
    this.store.put("invite", invite);
    return { code: token, expiresAt: invite.expiresAt };
  }
  async join(
    req: Request,
    res: Response,
    b: { code: string; name: string; username: string; password: string },
  ) {
    if (!this.config.enabled)
      throw new AppError("TEAM_DISABLED", "Team mode is not enabled.", 409);
    this.rate(req);
    const sid = hash(b.code),
      inv = this.store.get("invite", sid);
    if (!inv || inv.used || inv.expiresAt < Date.now())
      throw new AppError(
        "INVITE_INVALID",
        "This invitation is invalid or expired.",
        401,
      );
    const salt = randomBytes(16).toString("hex"),
      passwordHash = await this.password(b.password, salt);
    const fresh = this.store.get("invite", sid);
    const members = this.store.list<Member>("member");
    if (!fresh || fresh.used || fresh.expiresAt < Date.now())
      throw new AppError(
        "INVITE_INVALID",
        "This invitation has already been used.",
        409,
      );
    if (members.length >= 4)
      throw new AppError("TEAM_FULL", "All four memberships are in use.", 409);
    if (members.some((m) => m.username === b.username.toLowerCase()))
      throw new AppError("USERNAME_TAKEN", "Choose another username.", 409);
    const occupied = new Set(members.map((m) => m.slot)),
      slot = [1, 2, 3, 4].find((s) => !occupied.has(s))!;
    const m: Member = {
      id: id(),
      name: b.name,
      username: b.username.toLowerCase(),
      role: "editor",
      slot,
      passwordHash,
      salt,
      createdAt: now(),
    };
    this.store.db.exec("BEGIN IMMEDIATE");
    try {
      this.store.put("member", m);
      this.store.put("invite", { ...fresh, used: true, memberId: m.id });
      this.store.db.exec("COMMIT");
    } catch (e) {
      this.store.db.exec("ROLLBACK");
      throw e;
    }
    this.store.activity(
      "team_member_joined",
      `${m.name} joined the four-member workspace.`,
    );
    return this.session(res, m);
  }
  logout(req: Request, res: Response) {
    const cookie = String(req.headers.cookie || "")
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("solair_session="));
    if (cookie)
      this.store.db
        .prepare("DELETE FROM records WHERE kind=? AND id=?")
        .run("session", hash(cookie.slice("solair_session=".length)));
    res.clearCookie("solair_session", {
      httpOnly: true,
      secure: !!this.config.publicOrigin,
      sameSite: "lax",
      path: "/",
    });
  }
}
