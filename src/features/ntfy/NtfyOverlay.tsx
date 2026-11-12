import { Bell } from "lucide-react";
import { useTranslation } from "../../i18n";
import type { NtfyController } from "./useNtfy";
import { priorityClass } from "./NtfyPanelBody";
import "./NtfyOverlay.css";

/**
 * The floating ntfy preview that pops in the top-right when a new message arrives.
 * Styled to match Fly Island's native message banner: a dark, near-black capsule
 * with a status/source dot + icon on the left, the sender·body inline on the
 * right, and a subtle accent on the far right — flat, minimal, OS-notification feel.
 */
export function NtfyOverlay({ controller }: { controller: NtfyController }) {
  const t = useTranslation();
  const { preview, previewLeaving, openTopic } = controller;

  if (!preview) return null;

  return (
    <div className={`ntfy-overlay${previewLeaving ? " ntfy-overlay--leaving" : ""}`}>
      <button
        type="button"
        className="ntfy-preview"
        aria-label={t.ntfy.preview(preview.topic, preview.title)}
        onClick={() => void openTopic(preview.topic)}
      >
        <span className={`ntfy-preview__dot ${priorityClass(preview.priority)}`} aria-hidden="true" />
        <span className="ntfy-preview__source" aria-hidden="true">
          <Bell size={13} strokeWidth={2.2} />
        </span>
        <span className="ntfy-preview__text">
          <strong>{preview.title}</strong>
          <span className="ntfy-preview__sep" aria-hidden="true">·</span>
          <span className="ntfy-preview__body">{preview.body || preview.topic}</span>
        </span>
        <span className="ntfy-preview__dots" aria-hidden="true">
          <i /><i /><i />
        </span>
      </button>
    </div>
  );
}
