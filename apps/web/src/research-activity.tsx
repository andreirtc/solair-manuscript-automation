import React from "react";
import type { Message } from "../../../packages/contracts/index";
import { Icon } from "./ui";
function pageLink(value?: string) {
  if (!value || /\s/.test(value)) return;
  try {
    const u = new URL(value || "");
    return u.protocol === "https:" && !u.username && !u.password
      ? u
      : undefined;
  } catch {
    return undefined;
  }
}
export function ResearchActivity({ message }: { message: Message }) {
  const running = message.status === "running",
    actions = message.progress?.actions || [];
  if (!running && !actions.length) return null;
  return (
    <div className="research-activity">
      {running && (
        <p className="thinking" role="status">
          {message.progress?.phase || "Waiting for your personal AI worker"}
          <span className="thinking-dots" />
        </p>
      )}
      {running && message.ai && (
        <small>
          {message.ai.model} · {message.ai.effort} reasoning
        </small>
      )}
      {!!actions.length && (
        <details open={running || undefined}>
          <summary>
            <Icon name="link" />
            Research activity · {actions.length} actions
            <Icon name="chevron" />
          </summary>
          <ol>
            {actions.map((action) => {
              const link = pageLink(action.url);
              return (
                <li key={action.id}>
                  <span className="research-action-state">
                    {action.status === "started" ? "In progress" : "Finished"}
                  </span>
                  <span>
                    {action.type === "search" ? "Search: " : ""}
                    {action.label}
                  </span>
                  {link && (
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {link.hostname}
                      <Icon name="link" />
                    </a>
                  )}
                </li>
              );
            })}
          </ol>
        </details>
      )}
      {running && !actions.length && (
        <small>
          Searches and opened pages appear here when the worker reports them.
        </small>
      )}
    </div>
  );
}
