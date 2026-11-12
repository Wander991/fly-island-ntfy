import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { useTranslation } from "../../i18n";
import {
  clearNtfyNotifications,
  getNtfyState,
  listenNtfyChanged,
  openNtfyTopic,
  setNtfyConfig,
  setNtfyEnabled,
  setNtfyTopicMuted,
  type NtfySnapshot,
} from "./api";

const PREVIEW_MS = 8000;
const PREVIEW_LEAVE_MS = 260;

const EMPTY_SNAPSHOT: NtfySnapshot = {
  revision: 0,
  enabled: false,
  status: "disabled",
  items: [],
  error: null,
  config: {
    enabled: false,
    server: "https://ntfy.ccnas.top:47777",
    topics: [],
    muted: [],
    token: null,
  },
};

type PreviewState = { id: string; expiresAt: number; leaving?: boolean };

export function useNtfy(canPreview: boolean) {
  const t = useTranslation();
  const [snapshot, setSnapshot] = useState<NtfySnapshot>(EMPTY_SNAPSHOT);
  const [busy, setBusy] = useState(isTauri);
  const [actionError, setActionError] = useState<string | null>(null);
  const [previewWindow, setPreviewWindow] = useState<PreviewState | null>(null);
  const canPreviewRef = useRef(canPreview);
  const revisionRef = useRef(-1);
  const actionPending = useRef(false);

  useLayoutEffect(() => {
    canPreviewRef.current = canPreview;
    if (!canPreview) {
      setPreviewWindow(null);
    }
  }, [canPreview]);

  const acceptSnapshot = useCallback((next: NtfySnapshot) => {
    if (next.revision < revisionRef.current) return false;
    revisionRef.current = next.revision;
    setSnapshot(next);
    return true;
  }, []);

  useEffect(() => {
    if (!isTauri()) {
      setBusy(false);
      return;
    }
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void (async () => {
      unlisten = await listenNtfyChanged(({ payload }) => {
        if (cancelled) return;
        // A live snapshot proves the Rust service is up and talking to us, so any
        // stale "ntfy 服务尚未就绪" left over from a startup race is no longer true.
        if (acceptSnapshot(payload.snapshot)) {
          setActionError(null);
        }
        if (
          payload.newestId &&
          payload.snapshot.enabled &&
          payload.windowVisible &&
          canPreviewRef.current
        ) {
          setPreviewWindow({ id: payload.newestId, expiresAt: Date.now() + PREVIEW_MS });
        }
      });
      if (cancelled) {
        unlisten();
        return;
      }
      try {
        acceptSnapshot(await getNtfyState());
      } catch {
        // The change listener above already fed us a live snapshot if the service
        // came up; a one-off failure here is a startup race, not a real outage.
        if (!cancelled) {
          try {
            await new Promise((resolve) => setTimeout(resolve, 800));
            if (!cancelled) acceptSnapshot(await getNtfyState());
          } catch {
            /* leave actionError for the UI to surface */
          }
        }
      }
    })()
      .catch((error: unknown) => {
        if (!cancelled) setActionError(String(error));
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [acceptSnapshot, t.ntfy.desktopOnly]);

  useEffect(() => {
    if (!previewWindow) return;
    // When the preview expires, mark it as leaving so the overlay can play its
    // fade-out animation before we unmount it.
    if (previewWindow.leaving) {
      const timer = window.setTimeout(() => setPreviewWindow(null), PREVIEW_LEAVE_MS);
      return () => window.clearTimeout(timer);
    }
    const remain = Math.max(0, previewWindow.expiresAt - Date.now());
    const timer = window.setTimeout(
      () => setPreviewWindow((preview) => (preview ? { ...preview, leaving: true } : preview)),
      remain,
    );
    return () => window.clearTimeout(timer);
  }, [previewWindow]);

  const run = useCallback(
    async (action: () => Promise<void>) => {
      if (actionPending.current) return false;
      if (!isTauri()) {
        setActionError(t.ntfy.desktopOnly);
        return false;
      }
      actionPending.current = true;
      setBusy(true);
      setActionError(null);
      try {
        await action();
        return true;
      } catch (error) {
        setActionError(String(error));
        return false;
      } finally {
        actionPending.current = false;
        setBusy(false);
      }
    },
    [t.ntfy.desktopOnly],
  );

  const setEnabled = useCallback(
    (enabled: boolean) =>
      run(async () => {
        acceptSnapshot(await setNtfyEnabled(enabled));
        if (!enabled) setPreviewWindow(null);
      }),
    [acceptSnapshot, run],
  );

  const saveConfig = useCallback(
    (server: string, topics: string[], token: string | null) =>
      run(async () => {
        acceptSnapshot(await setNtfyConfig(server, topics, token));
      }),
    [acceptSnapshot, run],
  );

  const clear = useCallback(
    () =>
      run(async () => {
        acceptSnapshot(await clearNtfyNotifications());
        setPreviewWindow(null);
      }),
    [acceptSnapshot, run],
  );

  const openTopic = useCallback(
    (topic: string) =>
      run(async () => {
        await openNtfyTopic(topic);
      }),
    [run],
  );

  const toggleMute = useCallback(
    (topic: string) =>
      run(async () => {
        const muted = !snapshot.config.muted.includes(topic);
        acceptSnapshot(await setNtfyTopicMuted(topic, muted));
      }),
    [acceptSnapshot, run, snapshot.config.muted],
  );

  const preview = previewWindow
    ? snapshot.items.find((item) => item.id === previewWindow.id) ?? null
    : null;

  return {
    snapshot,
    busy,
    actionError,
    preview,
    previewLeaving: previewWindow?.leaving ?? false,
    muted: snapshot.config.muted,
    setEnabled,
    saveConfig,
    clear,
    openTopic,
    toggleMute,
  };
}

export type NtfyController = ReturnType<typeof useNtfy>;
