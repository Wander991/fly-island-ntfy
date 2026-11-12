import { useEffect, useState, type ReactNode } from "react";
import { CheckCircle2, CircleDot, ShieldAlert } from "lucide-react";
import type { IslandSettings } from "../appearance/types";
import { providerLabel, type ProviderStatus } from "../agent-providers/api";
import { useAgentProviders } from "../agent-providers/useAgentProviders";
import type { AgentSessionSummary } from "./api";
import "./AgentProvidersPanel.css";

const PHASE_LABELS: Record<string, string> = {
  idle: "空闲",
  running: "运行中",
  waiting: "需要你确认",
  completed: "任务完成",
  failed: "任务失败",
};

function QuotaStrip({ statuses, enabled }: { statuses: ProviderStatus[]; enabled: boolean }) {
  if (!enabled) return null;
  const withQuota = statuses.filter((status) => status.quotaTotal && status.quotaTotal > 0);
  if (withQuota.length === 0) return null;
  return (
    <div className="agent-providers__quotas">
      {withQuota.map((status) => {
        const used = status.quotaUsed ?? 0;
        const total = status.quotaTotal ?? 1;
        const remaining = Math.max(0, 100 - (used / total) * 100);
        return (
          <div className="agent-providers__quota" key={status.provider} title={`${used} / ${total} ${status.quotaLabel ?? "tokens"}`}>
            <span className="agent-providers__quota-name">{providerLabel(status.provider)}</span>
            <span className="agent-providers__quota-track">
              <span className="agent-providers__quota-fill" style={{ width: `${remaining}%` }} />
            </span>
            <span className="agent-providers__quota-value">{Math.round(remaining)}%</span>
          </div>
        );
      })}
    </div>
  );
}

function ExternalCard({ status }: { status: ProviderStatus | undefined }) {
  if (!status) {
    return (
      <div className="agent-providers__empty">
        还没有收到这个 Agent 的状态上报。
        <span>在「设置 → 扩展功能 → Agent 接入」里可以看到接入地址与示例。</span>
      </div>
    );
  }
  const quota = status.quotaTotal && status.quotaTotal > 0
    ? `${Math.round(status.quotaUsed ?? 0)} / ${Math.round(status.quotaTotal)} ${status.quotaLabel ?? "tokens"}`
    : null;
  return (
    <div className="agent-providers__card">
      <div className="agent-providers__card-head">
        {status.phase === "completed"
          ? <CheckCircle2 size={16} className="agent-providers__icon--done" aria-hidden="true" />
          : <CircleDot size={16} className="agent-providers__icon--running" aria-hidden="true" />}
        <span className={`agent-providers__phase agent-providers__phase--${status.phase}`}>
          {PHASE_LABELS[status.phase] ?? status.phase}
        </span>
      </div>
      {status.title && <strong className="agent-providers__title">{status.title}</strong>}
      {status.task && <p className="agent-providers__task">{status.task}</p>}
      {quota && <p className="agent-providers__quota-line">剩余额度参考：{quota}</p>}
      {status.needsApproval && (
        <p className="agent-providers__approval">
          <ShieldAlert size={14} aria-hidden="true" />
          该任务需要授权，请在 Agent 的终端或窗口里确认。
        </p>
      )}
    </div>
  );
}

/**
 * Wraps the built-in session list with one tab per AI Agent. Codex / Claude Code
 * keep their real session rows; WorkBuddy / 豆包 / Marvis / custom ids show the
 * status they POST to the local bridge.
 */
export function AgentProvidersPanel({
  settings,
  sessions,
  isOpen,
  renderBuiltins,
}: {
  settings: IslandSettings;
  sessions: AgentSessionSummary[];
  isOpen: boolean;
  renderBuiltins: (sessions: AgentSessionSummary[]) => ReactNode;
}) {
  const statuses = useAgentProviders(isOpen);
  const [active, setActive] = useState("all");
  const tabs = [
    { id: "all", label: "全部" },
    { id: "codex", label: "Codex" },
    { id: "claudeCode", label: "Claude Code" },
    ...settings.agentProviderIds.map((id) => ({ id, label: providerLabel(id) })),
  ];

  useEffect(() => {
    const exists = active === "all" || active === "codex" || active === "claudeCode"
      || settings.agentProviderIds.includes(active);
    if (!exists) setActive("all");
  }, [settings.agentProviderIds, active]);

  const isBuiltin = active === "all" || active === "codex" || active === "claudeCode";
  const filtered = active === "all"
    ? sessions
    : sessions.filter((session) => session.provider === active);
  const external = statuses.find((status) => status.provider === active);

  return (
    <div className="agent-providers-panel">
      <QuotaStrip statuses={statuses} enabled={settings.agentShowQuota} />
      <div className="agent-providers__tabs" role="tablist" aria-label="AI Agent 来源">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`agent-providers__tab${active === tab.id ? " is-active" : ""}`}
            type="button"
            role="tab"
            aria-selected={active === tab.id}
            onClick={() => setActive(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="agent-providers__body">
        {isBuiltin ? renderBuiltins(filtered) : <ExternalCard status={external} />}
      </div>
    </div>
  );
}
