import { useEffect, useState, type ReactNode } from "react";
import { Bell, BellOff, Settings, Trash2 } from "lucide-react";
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
 * The ntfy tab in the messages page. Tabs and status stay pinned; everything
 * else lives in one scroll container so the whole form and the message list
 * remain reachable even though the island panel has a fixed height.
 */
export function NtfyPanelBody({ controller, navigation }: NtfyPanelBodyProps) {
  const t = useTranslation();
  const { snapshot, busy, actionError, setEnabled, saveConfig, clear, openTopic, toggleMute, muted } =
    controller;
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
    // The backend splits / validates the multi-server text itself, so the
    // draft passes through unchanged (one address per line or comma-separated).
    void saveConfig(serverDraft, parsedTopics, tokenDraft.trim() || null);
  };

  return (
    <div className="ntfy-panel-body">
      {navigation}
      <div className="ntfy-panel__status-row">
        <strong>ntfy</strong>
        <span className="ntfy-panel__status">{t.ntfy.status(snapshot.status)}</span>
      </div>
      <div className="ntfy-panel__scroll">
        {(snapshot.error || actionError) && (
          <p className="ntfy-panel__error">{snapshot.error ?? actionError}</p>
        )}
        <div className="ntfy-panel__controls">
          {/* 1. Per-subscription alert switches — the section the user checks
              most often, so it goes to the very top. */}
          <section className="ntfy-section" aria-label={t.ntfy.muteSection}>
            <div className="ntfy-section__head">
              <span className="ntfy-section__title">{t.ntfy.muteSection}</span>
              {topics.length > 0 && <span className="ntfy-section__count">{topics.length}</span>}
            </div>
            {topics.length > 0 ? (
              <div className="ntfy-mute-list" aria-label={t.ntfy.topicMuteHint}>
                {topics.map((topic) => {
                  const isMuted = muted.includes(topic);
                  return (
                    <div className="ntfy-mute-row" key={topic}>
                      <span className="ntfy-mute-row__topic">{topic}</span>
                      <button
                        type="button"
                        className="ntfy-mute-row__toggle"
                        disabled={busy}
                        aria-pressed={isMuted}
                        aria-label={isMuted ? t.ntfy.unmute : t.ntfy.mute}
                        onClick={() => void toggleMute(topic)}
                      >
                        {isMuted ? (
                          <BellOff size={14} strokeWidth={1.75} aria-hidden="true" />
                        ) : (
                          <Bell size={14} strokeWidth={1.75} aria-hidden="true" />
                        )}
                        <span>{isMuted ? t.ntfy.unmute : t.ntfy.mute}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="ntfy-section__hint">{t.ntfy.noTopics}</p>
            )}
            {topics.length > 0 && <p className="ntfy-section__hint">{t.ntfy.topicMuteHint}</p>}
          </section>

          {/* 2. Topics */}
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

          {/* 3. Servers: same multi-line input style as topics. */}
          <label className="ntfy-field">
            <span>{t.ntfy.server}</span>
            <textarea
              rows={2}
              value={serverDraft}
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
              onChange={(event) => setServerDraft(event.target.value)}
            />
            <small>{t.ntfy.serversHint}</small>
          </label>

          {/* 4. Token */}
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

        {/* 5. Recent notifications */}
        <div className="ntfy-panel__list" aria-label={t.ntfy.recent}>
          {snapshot.items.length === 0 ? (
            <p className="ntfy-panel__empty">{t.ntfy.empty}</p>
          ) : (
            snapshot.items.map((item) => (
              <button
                key={item.id}
                type="button"
                className="ntfy-item"
                aria-label={t.ntfy.openTopic}
                onClick={() => void openTopic(item.topic, item.server || undefined)}
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
    </div>
  );
}
