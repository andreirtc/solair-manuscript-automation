import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import type { Actor } from "../../../packages/contracts/index.ts";
export const now = () => new Date().toISOString();
export const id = () => randomUUID();
/** Small durable JSON records in SQLite; writes commit before acknowledging HTTP. */
export class Store {
  db: DatabaseSync;
  context = new AsyncLocalStorage<Actor>();
  actor() {
    return this.context.getStore();
  }
  constructor(public dir: string) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    chmodSync(dir, 0o700);
    const path = join(dir, "manuscript.sqlite");
    this.db = new DatabaseSync(path);
    chmodSync(path, 0o600);
    this.db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL, id TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(kind,id));",
    );
  }
  get<T = any>(kind: string, key: string): T | undefined {
    const r = this.db
      .prepare("SELECT value FROM records WHERE kind=? AND id=?")
      .get(kind, key);
    return r ? JSON.parse(String(r.value)) : undefined;
  }
  list<T = any>(kind: string): T[] {
    return this.db
      .prepare("SELECT value FROM records WHERE kind=? ORDER BY rowid DESC")
      .all(kind)
      .map((r) => JSON.parse(String(r.value)));
  }
  put<T extends { id: string }>(kind: string, value: T): T {
    this.db
      .prepare(
        "INSERT INTO records VALUES (?,?,?) ON CONFLICT(kind,id) DO UPDATE SET value=excluded.value",
      )
      .run(kind, value.id, JSON.stringify(value));
    return value;
  }
  activity(kind: string, message: string, jobId?: string, origin = "gui") {
    return this.put("activity", {
      id: id(),
      at: now(),
      kind,
      message,
      jobId,
      origin,
      actor: this.actor(),
    });
  }
  close() {
    this.db.close();
  }
}
