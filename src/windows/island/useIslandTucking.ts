import { useCallback, useEffect, useRef } from "react";
import type { IslandSettings } from "../../features/appearance/types";
import { useIdleTuck, useRevealOnMessage } from "./useIslandAutomation";
import type { useIslandNavigation } from "./useIslandNavigation";
import { useTuckPeek } from "./useTuckPeek";

type IslandTuckingOptions = {
  settings: IslandSettings;
  navigation: ReturnType<typeof useIslandNavigation>;
  hasMessagePreview: boolean;
};

/** Grace period after a message preview ends before the island slides back. */
const MESSAGE_PREVIEW_RETRACT_MS = 400;

/** Tucking the island away when idle, sliding it out for what needs to be seen, and ending a peek. */
export function useIslandTucking({ settings, navigation, hasMessagePreview }: IslandTuckingOptions) {
  const { mode, page, isTucked, isPeeking, peekRetractDelayMs, idleTuck, revealIsland, endPeek } = navigation;
  // A showing preview holds the idle timer, which then restarts in full once it ends.
  const tuckWhenIdle = useCallback(
    () => idleTuck(settings.autoTuckRetract ? settings.autoTuckRetractDelayMs : null),
    [idleTuck, settings.autoTuckRetract, settings.autoTuckRetractDelayMs],
  );
  useIdleTuck(settings.autoTuck && !hasMessagePreview, settings.autoTuckSeconds, isTucked, `${mode}:${page}`, tuckWhenIdle);
  useRevealOnMessage(hasMessagePreview, isTucked, revealIsland);
  useTuckPeek(isPeeking, endPeek, peekRetractDelayMs ?? undefined);

  // A preview that pulled a tucked island out should let it slide back as soon as
  // the message disappears. Otherwise useIdleTuck restarts its full countdown
  // (30s by default) and the island keeps peeking long after the text is gone.
  // Only islands revealed by a message are affected: a normally visible island
  // just loses its preview text and stays put.
  const revealedByMessage = useRef(false);
  const hadPreview = useRef(hasMessagePreview);
  useEffect(() => {
    if (hasMessagePreview && isTucked) revealedByMessage.current = true;
    const ended = hadPreview.current && !hasMessagePreview;
    hadPreview.current = hasMessagePreview;
    if (!ended) return;
    const wasRevealed = revealedByMessage.current;
    revealedByMessage.current = false;
    if (!wasRevealed || mode !== "collapsed" || isTucked) return;
    const timer = window.setTimeout(tuckWhenIdle, MESSAGE_PREVIEW_RETRACT_MS);
    return () => window.clearTimeout(timer);
  }, [hasMessagePreview, isTucked, mode, tuckWhenIdle]);
}
