// Reading saved settings, part 3 (normalizeSettings in settings.ts): behaviour and modules.
import { normalizeLyricsSettings } from "../media/lyrics/lyricsSettings.ts";
import { DEFAULT_SETTINGS } from "./settingsDefaults.ts";
import { normalizeOrder } from "../../utils/order.ts";
import {
  ALL_SYSTEM_TOOLS, COLLAPSED_ITEMS, COLLAPSED_SLOTS, DEFAULT_AGENT_PROVIDER_IDS, DEFAULT_PAGE,
  DEFAULT_SYSTEM_TOOLS, PAGE_DOTS, SHELF_CLEANUP_DAYS, SYSTEM_REFRESH_SECONDS, oneOf,
} from "./settingsLimits.ts";
import type { IslandSettings, LegacyIslandSettings, PageDot } from "./types";

/**
 * A build before the System page saved four dots. `normalizeOrder` would append
 * the new ones, so instead adopt the requested order (System, AI Agent, music,
 * todos, files, clipboard) once; later saved orders are left exactly as dragged.
 */
function normalizePageOrder(value: unknown): PageDot[] {
  if (Array.isArray(value) && value.includes("system")) {
    return normalizeOrder(value, PAGE_DOTS);
  }
  return [...PAGE_DOTS];
}

/** A saved list of short strings; unknown tool ids are dropped so nothing can be launched by accident. */
function stringList(value: unknown, fallback: readonly string[], allowed?: readonly string[]): string[] {
  if (!Array.isArray(value)) return [...fallback];
  const kept: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const text = item.trim();
    if (!text || text.length > 40 || kept.includes(text)) continue;
    if (allowed && !allowed.includes(text)) continue;
    kept.push(text);
    if (kept.length >= 24) break;
  }
  return kept;
}

/** Todos, tucking and opening, module switches, the file shelf and lyrics. */
export function normalizeBehaviorSettings(settings: LegacyIslandSettings | null | undefined) {
  return {
    carryOverIncompleteTodos:
      typeof settings?.carryOverIncompleteTodos === "boolean"
        ? settings.carryOverIncompleteTodos
        : DEFAULT_SETTINGS.carryOverIncompleteTodos,
    autoTuck: settings?.autoTuck === true,
    expandTrigger: settings?.expandTrigger === "hover" ? "hover" : "click",
    // Module switches: anything but an explicit false keeps the module on.
    todoEnabled: settings?.todoEnabled !== false,
    musicEnabled: settings?.musicEnabled !== false,
    agentStatusEnabled: settings?.agentStatusEnabled !== false,
    agentTitleEnabled: settings?.agentTitleEnabled !== false,
    shelfEnabled: settings?.shelfEnabled !== false,
    translationEnabled: settings?.translationEnabled !== false,
    shelfAutoCleanupDays: oneOf(SHELF_CLEANUP_DAYS, settings?.shelfAutoCleanupDays, DEFAULT_SETTINGS.shelfAutoCleanupDays),
    ...normalizeLyricsSettings(settings),
    mailEnabled: settings?.mailEnabled !== false,
    collapsedPriority: normalizeOrder(settings?.collapsedPriority, COLLAPSED_ITEMS),
    collapsedShowCover: settings?.collapsedShowCover === true,
    collapsedLayout: normalizeOrder(settings?.collapsedLayout, COLLAPSED_SLOTS),
    pageOrder: normalizePageOrder(settings?.pageOrder),
    defaultPage: oneOf(PAGE_DOTS, settings?.defaultPage, DEFAULT_PAGE),
    // Anything but an explicit false keeps the new modules on, like the older switches.
    systemStatusEnabled: settings?.systemStatusEnabled !== false,
    systemRefreshSeconds: oneOf(SYSTEM_REFRESH_SECONDS, settings?.systemRefreshSeconds, DEFAULT_SETTINGS.systemRefreshSeconds),
    systemShowNetwork: settings?.systemShowNetwork !== false,
    systemShowCpu: settings?.systemShowCpu !== false,
    systemShowRam: settings?.systemShowRam !== false,
    systemShowGpu: settings?.systemShowGpu !== false,
    systemShowClock: settings?.systemShowClock !== false,
    systemShowDate: settings?.systemShowDate !== false,
    systemTools: stringList(settings?.systemTools, DEFAULT_SYSTEM_TOOLS, ALL_SYSTEM_TOOLS),
    wechatContentEnabled: settings?.wechatContentEnabled !== false,
    agentProviderIds: stringList(settings?.agentProviderIds, DEFAULT_AGENT_PROVIDER_IDS),
    agentShowQuota: settings?.agentShowQuota !== false,
  } satisfies Partial<IslandSettings>;
}
