export type NtfyText = {
  label: string;
  enable: string;
  disable: string;
  status: (status: string) => string;
  server: string;
  topics: string;
  topicsHint: string;
  token: string;
  tokenHint: string;
  save: string;
  clear: string;
  openTopic: string;
  empty: string;
  desktopOnly: string;
  preview: (topic: string, title: string) => string;
  count: (count: number) => string;
  settings: string;
  close: string;
  error: string;
  mute: string;
  unmute: string;
  topicMuteHint: string;
};

export const zhCN: NtfyText = {
  label: "ntfy 通知",
  enable: "启用",
  disable: "停用",
  status: (status) =>
    status === "listening"
      ? "已连接"
      : status === "connecting"
        ? "连接中"
        : status === "error"
          ? "连接错误"
          : "已停用",
  server: "服务器",
  topics: "订阅 topic",
  topicsHint: "每行一个，或用逗号分隔",
  token: "令牌",
  tokenHint: "可选，Bearer 令牌；留空表示不需要鉴权",
  save: "保存",
  clear: "清空",
  openTopic: "打开 topic",
  empty: "暂无通知",
  desktopOnly: "此功能仅在桌面端可用",
  preview: (topic, title) => `${topic}：${title}`,
  count: (count) => `${count} 条通知`,
  settings: "ntfy 设置",
  close: "关闭",
  error: "错误",
  mute: "静音",
  unmute: "取消静音",
  topicMuteHint: "关闭某个订阅的弹窗提醒（仍保留在列表中）",
};

export const en: NtfyText = {
  label: "ntfy notifications",
  enable: "Enable",
  disable: "Disable",
  status: (status) =>
    status === "listening"
      ? "Connected"
      : status === "connecting"
        ? "Connecting"
        : status === "error"
          ? "Connection error"
          : "Disabled",
  server: "Server",
  topics: "Topics",
  topicsHint: "One per line, or comma-separated",
  token: "Token",
  tokenHint: "Optional bearer token; leave blank for no auth",
  save: "Save",
  clear: "Clear",
  openTopic: "Open topic",
  empty: "No notifications yet",
  desktopOnly: "This feature is desktop-only",
  preview: (topic, title) => `${topic}: ${title}`,
  count: (count) => `${count} notification${count === 1 ? "" : "s"}`,
  settings: "ntfy settings",
  close: "Close",
  error: "Error",
  mute: "Mute",
  unmute: "Unmute",
  topicMuteHint: "Turn off the popup alert for a subscription (kept in the list)",
};
