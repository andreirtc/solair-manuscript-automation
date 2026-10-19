import type {
  AccountUsage,
  UsageWindow,
} from "../../../packages/contracts/index.ts";
export function unavailableUsage(): AccountUsage {
  return {
    status: "unavailable",
    checkedAt: new Date().toISOString(),
    limits: [],
    message:
      "Your account's allowance is unavailable. No percentage has been estimated.",
  };
}
/** Only documented quota fields cross the personal-worker boundary; never tokens, credit balances or account identifiers. */
export function normalizeUsage(raw: any): AccountUsage {
  const window = (value: any): UsageWindow | undefined => {
    if (
      typeof value?.usedPercent !== "number" ||
      !Number.isFinite(value.usedPercent) ||
      value.usedPercent < 0 ||
      value.usedPercent > 100
    )
      return;
    return {
      usedPercent: value.usedPercent,
      ...(Number.isFinite(value.windowDurationMins) &&
      value.windowDurationMins > 0
        ? { windowDurationMins: value.windowDurationMins }
        : {}),
      ...(Number.isFinite(value.resetsAt) &&
      value.resetsAt > 0 &&
      value.resetsAt < 8640000000000
        ? { resetsAt: value.resetsAt }
        : {}),
    };
  };
  const buckets =
    raw?.rateLimitsByLimitId && typeof raw.rateLimitsByLimitId === "object"
      ? Object.entries(raw.rateLimitsByLimitId)
      : [];
  if (!buckets.length && raw?.rateLimits)
    buckets.push([raw.rateLimits.limitId || "codex", raw.rateLimits]);
  const limits: AccountUsage["limits"] = [];
  for (const [id, value] of buckets.slice(0, 10) as [string, any][]) {
    const primary = window(value?.primary),
      secondary = window(value?.secondary);
    if (!primary && !secondary) continue;
    limits.push({
      id: String(id).slice(0, 128),
      ...(typeof value.limitName === "string" && value.limitName
        ? { name: value.limitName.slice(0, 128) }
        : {}),
      reached:
        typeof value.rateLimitReachedType === "string" &&
        !!value.rateLimitReachedType,
      ...(primary ? { primary } : {}),
      ...(secondary ? { secondary } : {}),
    });
  }
  return limits.length
    ? { status: "available", checkedAt: new Date().toISOString(), limits }
    : unavailableUsage();
}
