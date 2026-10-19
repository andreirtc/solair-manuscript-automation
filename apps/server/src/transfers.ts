import { randomBytes, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Store } from "./store.ts";
import type { Job, Source } from "../../../packages/contracts/index.ts";
const hash = (v: string | Buffer) =>
  createHash("sha256").update(v).digest("hex");
/** A short-lived bearer capability used only by Google's image fetch, never listed or returned to a browser. */
export function issueTransfer(
  store: Store,
  job: Job,
  source: Source,
  origin: string,
) {
  const url = new URL(origin);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error(
      "Private image transfer requires the configured HTTPS app origin.",
    );
  if (
    job.status !== "applying" ||
    !job.backup ||
    !job.review ||
    job.review.status !== "approved" ||
    !source.image ||
    !source.sha256
  )
    throw new Error(
      "Private transfer requires a backed-up, reviewed write in progress.",
    );
  const token = randomBytes(32).toString("hex"),
    id = hash(token);
  store.put("private_transfer", {
    id,
    jobId: job.id,
    sourceId: source.id,
    sha256: source.sha256,
    previewHash: job.review.hash,
    revision: job.baseRevision,
    expires: Date.now() + 300000,
    remaining: 5,
  });
  return {
    url: origin.replace(/\/$/, "") + "/api/v1/private-transfer/" + token,
    revoke() {
      store.db
        .prepare("DELETE FROM records WHERE kind=? AND id=?")
        .run("private_transfer", id);
    },
  };
}
export function readTransfer(store: Store, token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return;
  const grant = store.get("private_transfer", hash(token));
  if (!grant || grant.expires < Date.now() || grant.remaining < 1) return;
  const job = store.get<Job>("job", grant.jobId),
    source = store.get<Source>("source", grant.sourceId);
  if (
    !source ||
    job?.status !== "applying" ||
    job.review?.status !== "approved" ||
    job.review.hash !== grant.previewHash ||
    job.baseRevision !== grant.revision ||
    source.sha256 !== grant.sha256 ||
    !source.image
  )
    return;
  const path = resolve(
    store.dir,
    "sources",
    source.id + (source.image.mime === "image/png" ? ".png" : ".jpg"),
  );
  let bytes: Buffer;
  try {
    bytes = readFileSync(path);
  } catch {
    return;
  }
  if (hash(bytes) !== grant.sha256) return;
  grant.remaining--;
  store.put("private_transfer", grant);
  return { bytes, mime: source.image.mime };
}
