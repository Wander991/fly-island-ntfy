import { Bell } from "lucide-react";
import qqIcon from "../../assets/brands/qq.png";
import wechatIcon from "../../assets/brands/wechat.png";
import qqMailIcon from "../../assets/brands/qq-mail.png";
import type { MessageSource } from "./messagePreview";
import "./MessageSourceIcon.css";

const SOURCE_ICONS: Partial<Record<MessageSource, string>> = {
  qq: qqIcon,
  wechat: wechatIcon,
  qqMail: qqMailIcon,
};

export function MessageSourceIcon({ source, size = 16 }: { source: MessageSource; size?: number }) {
  // ntfy has no bundled brand bitmap; the messages tab uses the same Bell glyph.
  if (source === "ntfy") {
    return <Bell className="message-brand-icon message-brand-icon--ntfy" size={size} strokeWidth={1.8} aria-hidden="true" />;
  }
  const icon = SOURCE_ICONS[source];
  if (!icon) return null;
  return <img className={`message-brand-icon message-brand-icon--${source}`} src={icon} alt="" aria-hidden="true" width={size} height={size} draggable={false} />;
}
