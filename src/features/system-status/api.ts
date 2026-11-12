import { invoke } from "@tauri-apps/api/core";

/** Mirrors SystemStatus in src-tauri/src/system/status.rs. */
export type SystemStatus = {
  cpuPercent: number;
  ramPercent: number;
  gpuPercent: number | null;
  uploadBps: number;
  downloadBps: number;
  uptimeSeconds: number;
  timestamp: number;
};

export const EMPTY_SYSTEM_STATUS: SystemStatus = {
  cpuPercent: 0,
  ramPercent: 0,
  gpuPercent: null,
  uploadBps: 0,
  downloadBps: 0,
  uptimeSeconds: 0,
  timestamp: 0,
};

export function getSystemStatus() {
  return invoke<SystemStatus>("get_system_status");
}

export function launchSystemTool(tool: string) {
  return invoke<void>("launch_system_tool", { tool });
}
