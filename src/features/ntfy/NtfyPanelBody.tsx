import { useEffect, useState, type ReactNode } from "react";
import { Settings, Trash2 } from "lucide-react";
import { useTranslation } from "../../i18n";
import type { NtfyController } from "./useNtfy";
import "./NtfyOverlay.css";

export function formatTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function priorityClass(priority: number): string {
  if (priority >= 5) return "ntfy-priority--urgent";
  if (priority >= 4) return "ntfy-priority--high";
  if (priority <= 2) return "ntfy-priority--low";
  return "";
}

type NtfyPanelBodyProps = {
  controller: NtfyController;
  /** The message-source tab row shown at the top, so ntfy sits beside QQ / WeChat / Email. */
  navigation?: ReactNode;
};

/**
 * The ntfy panel content: connection status, server/topic/token controls and the message list.
 * Shared by the messages-page tab and (optionally) the floating overlay.
 */
export function NtfyPanelBody({ controller, navigation }: NtfyPanelBodyProps) {
  const t = useTranslation();
  const { snapshot, busy, actionError, setEnabled, saveConfig, clear, openTopic } = controller;
  const [serverDraft, setServerDraft] = useState(snapshot.config.server);
  const [topicsDraft, setTopicsDraft] = useState(snapshot.config.topics.join("\n"));
  const [tokenDraft, setTokenDraft] = useState(snapshot.config.token ?? "");
  const { server, topics, token } = snapshot.config;

  useEffect(() => {
    setServerDraft(server);
    setTopicsDraft(topics.join("\n"));
    setTokenDraft(token ?? "");
  }, [server, topics, token]);

  const handleSave = () => {
    const parsedTopics = topicsDraft
      .split(/[\n,]+/)
      .map((topic) => topic.trim())
      .filter((topic) => topic.length > 0);
    void saveConfig(serverDraft, parsedTopics, tokenDraft.trim() || null);
  };

  return (
    <div className="ntfy-panel-body">
      {navigation}
      <div className="ntfy-panel__status-row">
        <strong>ntfy</strong>
        <span className="ntfy-panel__status">{t.ntfy.status(snapshot.status)}</span>
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
  );
}
