import { useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { EMPTY_SYSTEM_STATUS, getSystemStatus, type SystemStatus } from "./api";

/** Polls the native samplers while the System page is open; never overlaps a slow GPU read. */
export function useSystemStatus(active: boolean, intervalMs: number) {
  const [status, setStatus] = useState<SystemStatus>(EMPTY_SYSTEM_STATUS);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!active || !isTauri()) return;
    let cancelled = false;
    const tick = () => {
      if (inFlight.current) return;
      inFlight.current = true;
      getSystemStatus()
        .then((next) => {
          if (!cancelled) {
            setStatus(next);
            setError(null);
          }
        })
        .catch((reason: unknown) => {
          if (!cancelled) setError(String(reason));
        })
        .finally(() => {
          inFlight.current = false;
        });
    };
    tick();
    const timer = window.setInterval(tick, Math.max(1000, intervalMs));
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [active, intervalMs]);

  return { status, error };
}
