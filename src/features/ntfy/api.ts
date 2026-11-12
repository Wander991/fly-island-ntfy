import { invoke } from "@tauri-apps/api/core";
import { listen, type EventCallback } from "@tauri-apps/api/event";

// Mirrors src-tauri/src/ntfy/config.rs and src-tauri/src/ntfy/mod.rs.
export type NtfyConfig = {
  enabled: boolean;
  /** One address per line (commas also accepted); all servers subscribe to all topics. */
  server: string;
  topics: string[];
  muted: string[];
  token: string | null;
};

export type NtfyMessage = {
  id: string;
  topic: string;
  title: string;
  body: string;
  priority: number;
  createdAt: number;
  /** Server root this message arrived on, so opening a topic uses the right host. */
  server: string;
};

export type NtfyStatus = "disabled" | "connecting" | "listening" | "error";

export type NtfySnapshot = {
  revision: number;
  enabled: boolean;
  status: NtfyStatus;
  items: NtfyMessage[];
  error: string | null;
  config: NtfyConfig;
};

export type NtfyEvent = {
  snapshot: NtfySnapshot;
  newestId: string | null;
  windowVisible: boolean;
};

// Keep in sync with EVENT_NAME in src-tauri/src/ntfy/mod.rs.
export const NTFY_CHANGED_EVENT = "ntfy-notifications-changed";

export function getNtfyState() {
  return invoke<NtfySnapshot>("get_ntfy_state");
}

export function setNtfyEnabled(enabled: boolean) {
  return invoke<NtfySnapshot>("set_ntfy_enabled", { enabled });
}

export function setNtfyConfig(server: string, topics: string[], token: string | null) {
  return invoke<NtfySnapshot>("set_ntfy_config", { server, topics, token });
}

export function clearNtfyNotifications() {
  return invoke<NtfySnapshot>("clear_ntfy_notifications");
}

export function openNtfyTopic(topic: string, server?: string) {
  return invoke<void>("open_ntfy_topic", { topic, server: server ?? null });
}

export function setNtfyTopicMuted(topic: string, muted: boolean) {
  return invoke<NtfySnapshot>("set_ntfy_topic_muted", { topic, muted });
}

export function listenNtfyChanged(handler: EventCallback<NtfyEvent>) {
  return listen<NtfyEvent>(NTFY_CHANGED_EVENT, handler);
}
