import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getAgentBridgePort, getAgentProviderStatuses, listenAgentProviders, type ProviderStatus } from "./api";

/** Statuses pushed to the local bridge by extra AI Agents, kept fresh while a page is open. */
export function useAgentProviders(active: boolean) {
  const [statuses, setStatuses] = useState<ProviderStatus[]>([]);

  useEffect(() => {
    if (!active || !isTauri()) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    const apply = (next: ProviderStatus[]) => {
      if (!cancelled) setStatuses(next);
    };
    void getAgentProviderStatuses().then(apply).catch(() => {});
    void listenAgentProviders(apply)
      .then((stop) => {
        if (cancelled) stop();
        else unlisten = stop;
      })
      .catch(() => {});
    // A fallback poll also catches statuses posted while the window was closed.
    const timer = window.setInterval(() => {
      void getAgentProviderStatuses().then(apply).catch(() => {});
    }, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      unlisten?.();
    };
  }, [active]);

  return statuses;
}

export function useAgentBridgePort() {
  const [port, setPort] = useState<number | null>(null);
  useEffect(() => {
    if (!isTauri()) return;
    void getAgentBridgePort().then(setPort).catch(() => {});
  }, []);
  return port;
}
