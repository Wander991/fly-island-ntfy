import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Settings } from "lucide-react";
import type { IslandSettings } from "../appearance/types";
import { openSettingsWindow } from "../../windows/settings/api";
import { launchSystemTool } from "./api";
import { SYSTEM_TOOLS, formatSpeed } from "./tools";
import { useSystemStatus } from "./useSystemStatus";
import "./SystemStatusPanel.css";

const MONTHS = ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"];
const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function Ring({ label, value, color }: { label: string; value: number | null; color: string }) {
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const percent = value === null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className="system-ring" aria-label={`${label} ${value === null ? "不可用" : `${Math.round(percent)}%`}`}>
      <svg viewBox="0 0 44 44" width="44" height="44" aria-hidden="true">
        <circle cx="22" cy="22" r={radius} className="system-ring__track" strokeWidth="4" fill="none" />
        <circle
          cx="22" cy="22" r={radius} stroke={color} strokeWidth="4" strokeLinecap="round" fill="none"
          strokeDasharray={circumference} strokeDashoffset={circumference * (1 - percent / 100)}
          transform="rotate(-90 22 22)" className="system-ring__value-arc"
        />
      </svg>
      <span className="system-ring__percent">{value === null ? "—" : `${Math.round(percent)}%`}</span>
      <span className="system-ring__label" style={{ color }}>{label}</span>
    </div>
  );
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

/** The System status page: live PC metrics, clock/date and built-in Windows tools. */
export function SystemStatusPanel({ settings, isOpen }: { settings: IslandSettings; isOpen: boolean }) {
  const { status, error } = useSystemStatus(isOpen, settings.systemRefreshSeconds * 1000);
  const now = useClock();
  const [toolError, setToolError] = useState<string | null>(null);
  const tools = SYSTEM_TOOLS.filter((tool) => settings.systemTools.includes(tool.id));
  const showRings = settings.systemShowCpu || settings.systemShowRam || settings.systemShowGpu;

  const openTool = (id: string) => {
    setToolError(null);
    launchSystemTool(id).catch((reason: unknown) => setToolError(String(reason)));
  };

  return (
    <div className="system-panel">
      <div className="system-panel__top">
        {(settings.systemShowNetwork || showRings) && (
          <div className="system-card system-card--metrics">
            {settings.systemShowNetwork && (
              <div className="system-net">
                <span className="system-net__line system-net__line--up">
                  <ArrowUp size={13} strokeWidth={2} aria-hidden="true" />
                  <span>{formatSpeed(status.uploadBps)}</span>
                </span>
                <span className="system-net__line system-net__line--down">
                  <ArrowDown size={13} strokeWidth={2} aria-hidden="true" />
                  <span>{formatSpeed(status.downloadBps)}</span>
                </span>
              </div>
            )}
            {showRings && (
              <div className="system-rings">
                {settings.systemShowCpu && <Ring label="CPU" value={status.cpuPercent} color="#6cb6ff" />}
                {settings.systemShowRam && <Ring label="RAM" value={status.ramPercent} color="#ffb648" />}
                {settings.systemShowGpu && <Ring label="GPU" value={status.gpuPercent} color="#5fd68b" />}
              </div>
            )}
          </div>
        )}
        {settings.systemShowClock && (
          <div className="system-card system-card--clock">
            <span className="system-clock">
              {`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`}
            </span>
            <button
              className="system-settings-button"
              type="button"
              aria-label="系统状态设置"
              title="系统状态设置"
              onClick={() => openSettingsWindow("system")}
            >
              <Settings size={16} strokeWidth={1.6} aria-hidden="true" />
            </button>
          </div>
        )}
        {settings.systemShowDate && (
          <div className="system-card system-card--date">
            <span className="system-date__month">{MONTHS[now.getMonth()]}</span>
            <span className="system-date__day">{now.getDate()}</span>
            <span className="system-date__weekday">{WEEKDAYS[now.getDay()]}</span>
          </div>
        )}
      </div>

      {tools.length > 0 && (
        <div className="system-tools">
          {tools.map((tool) => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.id}
                className="system-tool"
                type="button"
                title={tool.hint}
                onClick={() => openTool(tool.id)}
              >
                <Icon size={17} strokeWidth={1.6} aria-hidden="true" />
                <span className="system-tool__label">{tool.label}</span>
              </button>
            );
          })}
        </div>
      )}
      {(error || toolError) && <p className="system-panel__error">{toolError ?? error}</p>}
    </div>
  );
}
