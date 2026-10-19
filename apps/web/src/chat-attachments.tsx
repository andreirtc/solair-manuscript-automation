import React, { useState } from "react";
import type { Source } from "../../../packages/contracts/index";
import { api } from "./api";
import { Icon, Notice } from "./ui";

export const attachmentLabel = (source: Source) =>
  source.name === "Pasted text.txt" ? "Pasted text" : source.name;
export function AttachmentPreview({
  source,
  remove,
}: {
  source: Source;
  remove?: () => void;
}) {
  const [open, setOpen] = useState(false),
    [text, setText] = useState<string>(),
    [error, setError] = useState("");
  async function preview() {
    setOpen(!open);
    if (text !== undefined || open) return;
    try {
      const result = await api<{ text: string }>(`/sources/${source.id}/text`);
      setText(result.text);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="chat-attachment">
      <div className="attachment-heading">
        <button
          type="button"
          className="text-button"
          onClick={() => void preview()}
          aria-expanded={open}
        >
          <Icon name="file" />
          <span>{attachmentLabel(source)}</span>
          <Icon name="chevron" />
        </button>
        {remove && (
          <button
            type="button"
            className="icon-button"
            onClick={remove}
            aria-label={`Detach ${attachmentLabel(source)}`}
          >
            <Icon name="close" />
          </button>
        )}
      </div>
      {open && (
        <div className="attachment-preview">
          <p>{source.extractionNotice || "Text snapshot only."}</p>
          <p>
            Up to 20,000 characters per file and 50,000 total are supplied in
            one answer. Longer files need smaller excerpts.
          </p>
          {error ? (
            <Notice error>{error}</Notice>
          ) : text === undefined ? (
            <p role="status">Reading attachment…</p>
          ) : (
            <textarea
              readOnly
              aria-label={`Extracted text of ${attachmentLabel(source)}`}
              value={text}
              rows={8}
            />
          )}
        </div>
      )}
    </div>
  );
}

export function PastePanel({
  onAdd,
  onClose,
  busy,
}: {
  onAdd: (text: string) => void;
  onClose: () => void;
  busy: boolean;
}) {
  const [value, setValue] = useState("");
  return (
    <div className="paste-panel">
      <label htmlFor="paste-attachment">Pasted text</label>
      <textarea
        id="paste-attachment"
        placeholder="Paste notes, adviser feedback or a document excerpt…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={6}
      />
      <small>
        {value.length.toLocaleString()} / 200,000 characters · shared with your
        workspace when attached
      </small>
      <div className="button-row">
        <button
          type="button"
          className="button primary"
          disabled={busy || !value.trim() || value.length > 200000}
          onClick={() => onAdd(value)}
        >
          Attach text
        </button>
        <button
          type="button"
          className="button subtle"
          disabled={busy}
          onClick={onClose}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
