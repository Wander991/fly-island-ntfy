// The ranges and choices island settings are kept within, and the fallbacks they rest on.
import type { AgentSessionGroup, AgentSessionSort, CollapsedItem, CollapsedSlot, PageDot } from "./types";

export const AGENT_SESSION_SORTS: readonly AgentSessionSort[] = ["status", "recent", "firstSeen"];
export const AGENT_SESSION_GROUPS: readonly AgentSessionGroup[] = ["computer", "project", "none"];
/** Choices for how far back the Agent page lists sessions, in hours. */
export const AGENT_SESSION_HOURS = [1, 2, 6, 24] as const;
/** How long a page opened for an agent alert stays, in seconds. */
export const AGENT_ALERT_SECONDS = [3, 5, 8, 15, 30] as const;

// Bottom corner radius of the expanded island; every other island radius scales from it
// (IslandShell.css). 1.4x a 30px corner, for Apple's continuous corner (cornerShape.ts); the
// collapsed bar's corners come out at 31px of its 38px height.
export const DEFAULT_ISLAND_CORNER_RADIUS = 42;
export const DEFAULT_HOVER_EXPAND_DELAY_MS = 0;
export const DEFAULT_HOVER_COLLAPSE_DELAY_MS = 0;
export const DEFAULT_AUTO_TUCK_RETRACT_DELAY_MS = 500;
// Tallest panel before the todo list and other long pages scroll. The default is the
// height the todo page reached before this was a setting (six rows).
export const DEFAULT_MAX_PANEL_HEIGHT = 490;
// Rows the clipboard page shows before it scrolls: a short page, the rest a scroll away.
export const DEFAULT_CLIPBOARD_VISIBLE_ROWS = 4;
export const DEFAULT_AGENT_VISIBLE_ROWS = 2;
export const MIN_AGENT_VISIBLE_ROWS = 2;
// Five sessions is the tallest Agent page the native window accepts (627px of 656px).
export const MAX_AGENT_VISIBLE_ROWS = 5;
// File shelf cap; matches MAX_ITEMS in src-tauri/src/file_shelf/store.rs.
export const DEFAULT_SHELF_ITEMS = 100;
/** Auto-cleanup choices for the file shelf, in days; 0 never cleans up. */
export const SHELF_CLEANUP_DAYS = [0, 1, 7, 30] as const;
export const DEFAULT_TASK_TEXT_COLOR = "#ffffff";

/**
 * The expanded island's sizes (Appearance → "Expanded size"), as the scale stored in
 * `expandedScale`. Width and height grow together; the native window (src-tauri/src/island/)
 * accepts 0.75–1.4 and makes room for the scaled height.
 */
export const EXPANDED_SCALES = { small: 0.9, medium: 1, large: 1.1 } as const;
export type ExpandedSize = keyof typeof EXPANDED_SCALES;

/** The size closest to a saved scale: older versions stored any value from 0.75 to 1.4. */
export function nearestExpandedSize(scale: number): ExpandedSize {
  const sizes = Object.keys(EXPANDED_SCALES) as ExpandedSize[];
  if (!Number.isFinite(scale)) return "medium";
  return sizes.reduce((best, size) => (Math.abs(EXPANDED_SCALES[size] - scale) < Math.abs(EXPANDED_SCALES[best] - scale) ? size : best), "medium");
}

/** The collapsed island's items, in their default order: a running agent, then lyrics, then todos. */
export const COLLAPSED_ITEMS: readonly CollapsedItem[] = ["agent", "lyrics", "todo"];
/** The collapsed island's layout as it always was: the text, then the icons on its right. */
export const COLLAPSED_SLOTS: readonly CollapsedSlot[] = ["text", "mail", "shelf", "music", "agents"];
/**
 * The header's page dots in their default order. The System status page is first
 * (and the landing page), followed by the AI Agent, music, todos and files, as
 * requested; clipboard history stays available last. The user can drag them.
 */
export const PAGE_DOTS: readonly PageDot[] = ["system", "agents", "music", "todo", "shelf", "clipboard"];
/** The page the island opens on first. */
export const DEFAULT_PAGE: PageDot = "system";
/** Built-in Windows tools offered on the System page (all are whitelisted in Rust). */
export const ALL_SYSTEM_TOOLS = [
  "taskManager", "resourceMonitor", "deviceManager", "diskManagement", "controlPanel",
  "networkConnections", "systemProperties", "systemInfo", "diskCleanup", "settings",
  "calculator", "notepad", "snippingTool", "terminal", "eventViewer", "services",
] as const;
export type SystemToolId = (typeof ALL_SYSTEM_TOOLS)[number];
/** Shown by default so the row stays a single line. */
export const DEFAULT_SYSTEM_TOOLS: readonly SystemToolId[] = [
  "taskManager", "resourceMonitor", "deviceManager", "settings",
  "networkConnections", "diskCleanup", "calculator", "terminal",
];
/** Extra AI Agents that can report to the local bridge. */
export const DEFAULT_AGENT_PROVIDER_IDS = ["workbuddy", "doubao", "marvis"] as const;
export const SYSTEM_REFRESH_SECONDS = [1, 2, 3, 5, 10] as const;

/** `value` when it is one of `allowed`, else `fallback`: a saved choice from an older or newer build. */
export function oneOf<T>(allowed: readonly T[], value: unknown, fallback: T): T {
  return (allowed as readonly unknown[]).includes(value) ? (value as T) : fallback;
}
