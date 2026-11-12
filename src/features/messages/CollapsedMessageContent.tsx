import { useEffect, useRef, useState, type ReactNode } from "react";
import { MessageSourceIcon } from "./MessageSourceIcon";
import { messagePreviewText, type MessagePreview } from "./messagePreview";
import { useTranslation } from "../../i18n";
import "./CollapsedMessageContent.css";

type ContentTransition = {
  key: string;
  current: MessagePreview | null;
  previous: MessagePreview | null | undefined;
  version: number;
  animated: boolean;
  previousAnimated: boolean;
};

/**
 * ntfy shows only the notification body on the island (no topic prefix — island
 * space is tight). When the body is wider than the island it scrolls horizontally;
 * short text stays put. Two identical copies sit in the track so the animation can
 * loop seamlessly by translating exactly -50%.
 */
function NtfyScrollBody({ text }: { text: string }) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const trackRef = useRef<HTMLSpanElement>(null);
  const [scroll, setScroll] = useState(false);

  useEffect(() => {
    const wrap = wrapRef.current;
    const track = trackRef.current;
    if (!wrap || !track) return;
    // The track holds two identical copies; one copy's width is half of scrollWidth.
    const single = track.scrollWidth / 2;
    setScroll(single > wrap.clientWidth + 1);
  }, [text]);

  return (
    <span ref={wrapRef} className={`island-message-preview__ntfy${scroll ? " is-scroll" : ""}`}>
      <span ref={trackRef} className="ntfy-scroll-track">
        <span className="ntfy-scroll-text">{text}</span>
        <span className="ntfy-scroll-text" aria-hidden="true">{text}</span>
      </span>
    </span>
  );
}

function MessageContent({ preview }: { preview: MessagePreview }) {
  const t = useTranslation();
  if (preview.source === "qq") {
    return <>
      <MessageSourceIcon source={preview.source} size={16} />
      <span className="island-message-preview__text">
        <strong className="island-message-preview__sender">{preview.title.trim() || "QQ"}</strong>
        <span className="island-message-preview__separator" aria-hidden="true">·</span>
        <span className="island-message-preview__body">{preview.body.trim() || t.messages.newMessage}</span>
      </span>
    </>;
  }
  if (preview.source === "ntfy") {
    return <>
      <MessageSourceIcon source={preview.source} size={16} />
      <NtfyScrollBody text={preview.body.trim() || t.messages.newMessage} />
    </>;
  }
  return <>
    <MessageSourceIcon source={preview.source} size={16} />
    <span className="island-message-preview__body">{messagePreviewText(preview, t.messages)}</span>
  </>;
}

export function CollapsedMessageContent({
  preview,
  enabled,
  children,
}: {
  preview: MessagePreview | null;
  enabled: boolean;
  children: ReactNode;
}) {
  const t = useTranslation();
  const current = enabled ? preview : null;
  const key = current ? JSON.stringify([current.source, current.receivedAt, current.title, current.body]) : "idle";
  const [transition, setTransition] = useState<ContentTransition>({ key, current, previous: undefined, version: 0, animated: false, previousAnimated: false });

  // Retain just the departing row; identical snapshots must not restart the entrance.
  if (key !== transition.key || (!enabled && (transition.previous !== undefined || transition.animated))) {
    setTransition({
      key, current, previous: enabled ? transition.current : undefined, version: transition.version + 1,
      animated: enabled, previousAnimated: transition.animated,
    });
  }

  const { previous, version } = transition;
  const moving = previous !== undefined;
  const settle = () => setTransition((state) => state.version === version && state.previous !== undefined
    ? { ...state, previous: undefined } : state);

  useEffect(() => {
    if (!moving) return;
    const finish = () => setTransition((state) => state.version === version
      ? { ...state, previous: undefined } : state);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setTransition((state) => state.version === version
        ? { ...state, previous: undefined, animated: false } : state);
      return;
    }
    // Hidden webviews may skip animationend; never retain an old message indefinitely.
    const timer = window.setTimeout(finish, 720);
    return () => window.clearTimeout(timer);
  }, [moving, version]);

  const label = current
    ? current.source === "ntfy"
      ? current.body.trim() || t.messages.newMessage
      : t.messages.qqPreview(t.messages.sourceLabels[current.source], messagePreviewText(current, t.messages))
    : undefined;
  const row = (message: MessagePreview | null) => message ? <MessageContent preview={message} /> : children;

  return (
    <span className="island__summary" role="status" aria-live="polite" aria-atomic="true" aria-label={label}
      data-direction={current ? "message" : "restore"}>
      {moving && (
        <span key={version - 1} className="island__summary-layer island__summary-layer--outgoing" aria-hidden="true">
          <span className={`island__summary-row${transition.previousAnimated ? " island__summary-row--animated" : ""}${previous ? " island-message-preview" : ""}`}>
            {row(previous)}
          </span>
        </span>
      )}
      <span key={version} className={`island__summary-layer${moving ? " island__summary-layer--incoming" : ""}`}>
        <span className={`island__summary-row${transition.animated ? " island__summary-row--animated" : ""}${current ? " island-message-preview" : ""}`}
          onAnimationEnd={(event) => { if (event.target === event.currentTarget) settle(); }}>
          {row(current)}
        </span>
      </span>
    </span>
  );
}
