import { ExternalLink } from "lucide-react";
import { useTranslation } from "../../i18n";
import type { NtfyController } from "./useNtfy";
import { priorityClass } from "./NtfyPanelBody";
import "./NtfyOverlay.css";

/**
 * The floating ntfy preview card that pops above the island when a new message arrives.
 * The persistent pill and the full panel moved into the messages page (beside QQ / WeChat / Email),
 * so this overlay only surfaces the brief preview.
 */
export function NtfyOverlay({ controller }: { controller: NtfyController }) {
  const t = useTranslation();
  const { preview, openTopic } = controller;

  if (!preview) return null;

  return (
    <div className="ntfy-overlay">
      <button
        type="button"
        className="ntfy-preview"
        aria-label={t.ntfy.preview(preview.topic, preview.title)}
        onClick={() => void openTopic(preview.topic)}
      >
        <span className={`ntfy-preview__dot ${priorityClass(preview.priority)}`} />
        <span className="ntfy-preview__text">
          <strong>{preview.title}</strong>
          <span>{preview.body || preview.topic}</span>
        </span>
        <ExternalLink size={13} strokeWidth={1.5} aria-hidden="true" />
      </button>
    </div>
  );
}
