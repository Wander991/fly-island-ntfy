import { useEffect, useState } from "react";
import { Bell, ExternalLink, Settings, Trash2, X } from "lucide-react";
import { useTranslation } from "../../i18n";
import type { NtfyController } from "./useNtfy";
import "./NtfyOverlay.css";

function formatTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function priorityClass(priority: number): string {
  if (priority >= 5) return "ntfy-priority--urgent";
  if (priority >= 4) return "ntfy-priority--high";
  if (priority <= 2) return "ntfy-priority--low";
  return "";
}

export function NtfyOverlay({ controller }: { controller: NtfyController }) {
  const t = useTranslation();
  const { snapshot, busy, actionError, preview, setEnabled, saveConfig, clear, openTopic } = controller;
  const [open, setOpen] = useState(false);
  const [serverDraft, setServerDraft] = useState(snapshot.config.server);
  const [topicsDraft, setTopicsDraft] = useState(snapshot.config.topics.join("\n"));
  const [tokenDraft, setTokenDraft] = useState(snapshot.config.token ?? "");
  const { server, topics, token } = snapshot.config;

  useEffect(() => {
    if (!open) {
      setServerDraft(server);
      setTopicsDraft(topics.join("\n"));
      setTokenDraft(token ?? "");
    }
  }, [open, server, topics, token]);

  const previewMessage = preview;
  const count = snapshot.items.length;
  const handleSave = () => {
    const parsedTopics = topicsDraft
      .split(/[\n,]+/)
      .map((topic) => topic.trim())
      .filter((topic) => topic.length > 0);
    void saveConfig(serverDraft, parsedTopics, tokenDraft.trim() || null);
  };

  return (
    <div className="ntfy-overlay">
      {previewMessage && (
        <button
          type="button"
          className="ntfy-preview"
          aria-label={t.ntfy.preview(previewMessage.topic, previewMessage.title)}
          onClick={() => void openTopic(previewMessage.topic)}
        >
          <span className={`ntfy-preview__dot ${priorityClass(previewMessage.priority)}`} />
          <span className="ntfy-preview__text">
            <strong>{previewMessage.title}</strong>
            <span>{previewMessage.body || previewMessage.topic}</span>
          </span>
          <ExternalLink size={13} strokeWidth={1.5} aria-hidden="true" />
        </button>
      )}
      <button
        type="button"
        className={`ntfy-pill${snapshot.status === "error" ? " ntfy-pill--error" : ""}`}
        aria-label={t.ntfy.label}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Bell size={14} strokeWidth={1.5} aria-hidden="true" />
        <span>ntfy</span>
        {count > 0 && <span className="ntfy-pill__count">{count > 99 ? "99+" : count}</span>}
      </button>
      {open && (
        <div className="ntfy-panel" role="dialog" aria-label={t.ntfy.settings}>
          <div className="ntfy-panel__header">
            <strong>ntfy</strong>
            <span className="ntfy-panel__status">{t.ntfy.status(snapshot.status)}</span>
            <button
              type="button"
              className="ntfy-icon-button"
              aria-label={t.ntfy.close}
              onClick={() => setOpen(false)}
            >
              <X size={14} strokeWidth={1.5} aria-hidden="true" />
            </button>
          </div>
          {(snapshot.error || actionError) && (
            <p className="ntfy-panel__error">{snapshot.error ?? actionError}</p>
          )}
          <div className="ntfy-panel__controls">
            <label className="ntfy-field">
              <span>{t.ntfy.server}</span>
              <input
                type="text"
                value={serverDraft}
                autoComplete="off"
                spellCheck={false}
                disabled={busy}
                onChange={(event) => setServerDraft(event.target.value)}
              />
            </label>
            <label className="ntfy-field">
              <span>{t.ntfy.topics}</span>
              <textarea
                rows={3}
                value={topicsDraft}
                spellCheck={false}
                disabled={busy}
                onChange={(event) => setTopicsDraft(event.target.value)}
              />
              <small>{t.ntfy.topicsHint}</small>
            </label>
            <label className="ntfy-field">
              <span>{t.ntfy.token}</span>
              <input
                type="password"
                value={tokenDraft}
                autoComplete="off"
                disabled={busy}
                onChange={(event) => setTokenDraft(event.target.value)}
              />
              <small>{t.ntfy.tokenHint}</small>
            </label>
            <div className="ntfy-panel__actions">
              <button type="button" disabled={busy} onClick={() => void setEnabled(!snapshot.enabled)}>
                {snapshot.enabled ? t.ntfy.disable : t.ntfy.enable}
              </button>
              <button type="button" disabled={busy} onClick={() => void clear()}>
                <Trash2 size={13} strokeWidth={1.5} aria-hidden="true" />
                {t.ntfy.clear}
              </button>
              <button type="button" disabled={busy} onClick={handleSave}>
                <Settings size={13} strokeWidth={1.5} aria-hidden="true" />
                {t.ntfy.save}
              </button>
            </div>
          </div>
          <div className="ntfy-panel__list">
            {snapshot.items.length === 0 ? (
              <p className="ntfy-panel__empty">{t.ntfy.empty}</p>
            ) : (
              snapshot.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="ntfy-item"
                  aria-label={t.ntfy.openTopic}
                  onClick={() => void openTopic(item.topic)}
                >
                  <span className={`ntfy-item__dot ${priorityClass(item.priority)}`} />
                  <span className="ntfy-item__content">
                    <span className="ntfy-item__heading">
                      <strong>{item.title}</strong>
                      <time>{formatTime(item.createdAt)}</time>
                    </span>
                    <span className="ntfy-item__topic">{item.topic}</span>
                    {item.body && <span className="ntfy-item__body">{item.body}</span>}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
