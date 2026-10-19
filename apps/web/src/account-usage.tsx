import React, { useEffect, useRef, useState } from "react";
import type {
  AccountUsage,
  UsageWindow,
} from "../../../packages/contracts/index";
import { api } from "./api";
import { Icon } from "./ui";
function windowLabel(window: UsageWindow, fallback: string) {
  const mins = window.windowDurationMins;
  return !mins
    ? fallback
    : mins % 1440 === 0
      ? `${mins / 1440}d`
      : mins % 60 === 0
        ? `${mins / 60}h`
        : `${mins}m`;
}
export function UsageMeter({ refreshKey = "" }: { refreshKey?: string }) {
  const [usage, setUsage] = useState<AccountUsage>(),
    [busy, setBusy] = useState(false),
    [failed, setFailed] = useState(false);
  const reload = useRef<() => void>(() => {});
  useEffect(() => {
    let alive = true,
      pending = false;
    async function refresh() {
      if (pending || document.hidden) return;
      pending = true;
      if (alive) setBusy(true);
      try {
        const value = await api<AccountUsage>("/ai/usage");
        if (alive) {
          setUsage(value);
          setFailed(false);
        }
      } catch {
        if (alive) setFailed(true);
      } finally {
        pending = false;
        if (alive) setBusy(false);
      }
    }
    reload.current = () => void refresh();
    void refresh();
    const timer = setInterval(() => void refresh(), 60000);
    const visible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refreshKey]);
  const windows = (usage?.limits || []).flatMap((limit) =>
    [
      limit.primary && {
        ...limit.primary,
        label: windowLabel(limit.primary, "Primary"),
        bucket: limit.name || limit.id,
      },
      limit.secondary && {
        ...limit.secondary,
        label: windowLabel(limit.secondary, "Secondary"),
        bucket: limit.name || limit.id,
      },
    ].filter(Boolean),
  ) as (UsageWindow & { label: string; bucket: string })[];
  const low = windows.some((w) => w.usedPercent >= 80),
    exhausted =
      windows.some((w) => w.usedPercent >= 100) ||
      usage?.limits.some((l) => l.reached);
  return (
    <div className={"account-usage" + (low ? " allowance-low" : "")}>
      <details>
        <summary>
          <Icon name="settings" />
          <span>
            My AI allowance
            {windows.length
              ? " · " +
                windows
                  .map(
                    (w) =>
                      `${w.label} ${Math.round(100 - w.usedPercent)}% left`,
                  )
                  .join(" · ")
              : busy
                ? " · checking…"
                : " · unavailable"}
            {failed && windows.length ? " · last known" : ""}
          </span>
          <Icon name="chevron" />
        </summary>
        <div className="allowance-content">
          {windows.map((w, index) => (
            <div className="allowance-window" key={index}>
              <div>
                <strong>
                  {usage!.limits.length > 1 ? `${w.bucket} · ` : ""}
                  {w.label} window
                </strong>
                <span>
                  {Math.round(w.usedPercent)}% used ·{" "}
                  {Math.round(100 - w.usedPercent)}% left
                </span>
              </div>
              <meter
                min="0"
                max="100"
                value={w.usedPercent}
                aria-label={`${w.bucket} ${w.label} allowance used`}
              />
              <small>
                {w.resetsAt
                  ? "Resets " +
                    new Date(w.resetsAt * 1000).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })
                  : "Reset time unavailable"}
              </small>
            </div>
          ))}
          {!windows.length && (
            <p>
              {usage?.message ||
                "Your account's allowance is unavailable. No percentage has been estimated."}
            </p>
          )}
          <p>
            OpenAI-reported Codex allowance for your connected account,
            including other Codex use. This is not a remaining-token count.
            Lower reasoning does not reset a limit.
          </p>
          <div className="allowance-footer">
            <small>
              {usage
                ? "Checked " +
                  new Date(usage.checkedAt).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  })
                : "Not checked"}
              {failed ? " · refresh failed" : ""}
            </small>
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => reload.current()}
            >
              Refresh allowance <Icon name="refresh" />
            </button>
          </div>
        </div>
      </details>
      {(low || exhausted) && (
        <p className="allowance-warning" role="status">
          {exhausted
            ? "An account limit is reached. Check its reset time; a lower reasoning setting may still be blocked."
            : "Allowance is running low. For routine questions, load your models in Agent & space options, choose a model and select High or Medium reasoning."}
        </p>
      )}
    </div>
  );
}
