import { Bell } from "lucide-react";
import { useTranslation } from "../../i18n";
import type { NtfyController } from "./useNtfy";
import "./NtfyOverlay.css";

/**
 * Brief ntfy preview that pops in when a new message arrives.
 * Styled to read like a piece of Fly Island's own collapsed message bar:
 * a glass capsule with the ntfy bell as the source icon and `topic · body` inline,
 * the same way QQ / WeChat messages surface in the island.
 */
export function NtfyOverlay({ controller }: { controller: NtfyController }) {
  const t = useTranslation();
  const { preview, previewLeaving, openTopic } = controller;

  if (!preview) return null;

  // The topic acts as the "sender" (like a contact name), so we never get the
  // bracket-on-bracket nesting that title+body produced. Body falls back to title.
  const sender = preview.topic || "ntfy";
  const message = preview.body || preview.title;

  return (
    <div className={`ntfy-overlay${previewLeaving ? " ntfy-overlay--leaving" : ""}`}>
      <button
        type="button"
        className="ntfy-preview"
        aria-label={t.ntfy.preview(preview.topic, preview.title)}
        onClick={() => void openTopic(preview.topic)}
      >
        <span className="ntfy-preview__source" aria-hidden="true">
          <Bell size={14} strokeWidth={2.2} />
        </span>
        <span className="ntfy-preview__text">
          <strong>{sender}</strong>
          {message ? (
            <>
              <span className="ntfy-preview__sep" aria-hidden="true">·</span>
              <span className="ntfy-preview__body">{message}</span>
            </>
          ) : null}
        </span>
      </button>
    </div>
  );
}
