import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { useTranslation } from "../../i18n";
import { MailPanel, type MailController } from "./mail/MailPanel";
import { QQNotificationPanel, type QQNotificationsController } from "./qq-notifications/QQNotifications";
import { WeChatReminderPanel, type WeChatRemindersController } from "./wechat/WeChatReminders";
import { MessageSourceIcon } from "./MessageSourceIcon";
import { mailBadgeCount, type MessageSource } from "./messagePreview";
import type { NtfyController } from "../ntfy/useNtfy";
import { NtfyPanelBody } from "../ntfy/NtfyPanelBody";

export type MessageView = MessageSource;

type MessagesProps = {
  qqMail: MailController;
  qqNotifications: QQNotificationsController;
  wechatReminders: WeChatRemindersController;
  /** The ntfy tab lives alongside the other message sources; its panel shows here. */
  ntfy: NtfyController;
  source: MessageView;
  /** Sources switched on; the tabs of the others are hidden. */
  enabledSources: Record<MessageSource, boolean>;
  onSourceChange: (source: MessageView) => void;
  /** Opens the settings window on the mail page, where mailboxes are added. */
  onOpenMailSettings?: () => void;
};

export function messagePanelHeight(source: MessageView, readingMail = false) {
  return source === "qqMail" && readingMail ? 450 : 350;
}

export function MessagesPanel({ qqMail, qqNotifications, wechatReminders, ntfy, source, enabledSources, onSourceChange, onOpenMailSettings }: MessagesProps) {
  const t = useTranslation();
  const [view, setView] = useState<MessageView>(source);

  // Keep the local tab in step with the active source set from outside (island preview, header bell, etc.).
  useEffect(() => {
    setView(source);
  }, [source]);

  const { snapshot: qq } = qqNotifications;
  const navigate = (next: MessageView) => {
    setView(next);
    onSourceChange(next);
  };
  // ntfy is a first-class message source now, so keep the outer source in sync
  // when the tab is picked (and when a preview on the island is clicked).
  const openNtfy = () => navigate("ntfy");
  const ntfyCount = ntfy.snapshot.items.length;
  const navigation = (
    <div className="message-sources" role="group" aria-label={t.messages.sources}>
      {enabledSources.qq && <button type="button" aria-label={t.messages.qqNotifications} aria-pressed={view === "qq"} onClick={() => navigate("qq")}><MessageSourceIcon source="qq" /><span>QQ</span>{qq.items.length > 0 && <span className="message-source-count">{mailBadgeCount(qq.items.length)}</span>}</button>}
      {enabledSources.wechat && <button type="button" aria-label={t.messages.wechatReminders} aria-pressed={view === "wechat"} onClick={() => navigate("wechat")}><MessageSourceIcon source="wechat" /><span>{t.messages.wechat}</span>{wechatReminders.snapshot.pending && <span className="message-source-dot" aria-label={t.messages.newReminder} />}</button>}
      {enabledSources.qqMail && <button type="button" aria-label={t.messages.qqMail} aria-pressed={view === "qqMail"} onClick={() => navigate("qqMail")}><MessageSourceIcon source="qqMail" /><span>{t.messages.mail}</span>{qqMail.unreadTotal > 0 && <span className="message-source-count">{mailBadgeCount(qqMail.unreadTotal)}</span>}</button>}
      <button type="button" aria-label={t.ntfy.label} aria-pressed={view === "ntfy"} onClick={openNtfy}><Bell size={16} strokeWidth={1.5} className="message-brand-icon" aria-hidden="true" /><span>ntfy</span>{ntfyCount > 0 && <span className="message-source-count">{mailBadgeCount(ntfyCount)}</span>}</button>
    </div>
  );

  if (view === "ntfy") return <NtfyPanelBody controller={ntfy} navigation={navigation} />;
  if (source === "qqMail") return <MailPanel controller={qqMail} navigation={navigation} onOpenSettings={onOpenMailSettings} />;
  if (source === "wechat") return <WeChatReminderPanel controller={wechatReminders} navigation={navigation} />;
  return <QQNotificationPanel controller={qqNotifications} navigation={navigation} />;
}
