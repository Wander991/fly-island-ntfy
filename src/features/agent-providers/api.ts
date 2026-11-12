import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/** Mirrors ProviderStatus in src-tauri/src/agent_providers.rs. */
export type ProviderStatus = {
  provider: string;
  phase: string;
  title: string | null;
  task: string | null;
  quotaUsed: number | null;
  quotaTotal: number | null;
  quotaLabel: string | null;
  needsApproval: boolean;
  updatedAt: number;
};

export const AGENT_PROVIDER_EVENT = "agent-providers-changed";

export const AGENT_PROVIDER_LABELS: Record<string, string> = {
  codex: "Codex",
  claudeCode: "Claude Code",
  workbuddy: "WorkBuddy",
  doubao: "豆包",
  marvis: "Marvis",
};

export function providerLabel(id: string) {
  return AGENT_PROVIDER_LABELS[id] ?? id;
}

export function getAgentProviderStatuses() {
  return invoke<ProviderStatus[]>("get_agent_provider_statuses");
}

export function getAgentBridgePort() {
  return invoke<number>("get_agent_bridge_port");
}

export function listenAgentProviders(handler: (statuses: ProviderStatus[]) => void) {
  return listen<ProviderStatus[]>(AGENT_PROVIDER_EVENT, ({ payload }) => handler(payload));
}

export function clearAgentProvider(provider: string) {
  return invoke<void>("clear_agent_provider", { provider });
}
