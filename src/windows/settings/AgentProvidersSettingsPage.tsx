import { useState } from "react";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsInput } from "../../components/settings/SettingsInput";
import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import type { IslandSettings } from "../../features/appearance/types";
import { providerLabel } from "../../features/agent-providers/api";
import { useAgentBridgePort, useAgentProviders } from "../../features/agent-providers/useAgentProviders";
import "./ExtensionSettingsPages.css";

/** Settings → 扩展功能 → Agent 接入: extra provider tabs and the local bridge. */
export function AgentProvidersSettingsPage({
  settings,
  onSettingsChange,
}: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
}) {
  const [draft, setDraft] = useState("");
  const port = useAgentBridgePort();
  const statuses = useAgentProviders(true);
  const ids = settings.agentProviderIds;

  const setIds = (next: string[]) => onSettingsChange({ ...settings, agentProviderIds: next });
  const add = () => {
    const id = draft.trim().slice(0, 32);
    if (!id || ids.includes(id)) return;
    setIds([...ids, id]);
    setDraft("");
  };

  return (
    <>
      <SettingsGroup title="Agent 选项卡" footer="Codex 与 Claude Code 由内置 hooks 提供；这里的多余家通过下方本地接口上报状态，各自在 AI Agent 页占一个选项卡，显示 token 额度、任务状态与完成提示。">
        <div className="ext-provider-list">
          {ids.map((id, index) => (
            <div className="ext-provider-row" key={index}>
              <SettingsInput
                aria-label={`Agent ${index + 1} 标识`}
                value={id}
                onChange={(event) => setIds(ids.map((item, position) => (position === index ? event.target.value : item)))}
              />
              <button className="ext-button ext-button--danger" type="button" onClick={() => setIds(ids.filter((_, position) => position !== index))}>
                移除
              </button>
            </div>
          ))}
        </div>
        <div className="ext-provider-add">
          <SettingsInput
            aria-label="新增 Agent 标识"
            placeholder="自定义标识，如 my-agent"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") add(); }}
          />
          <button className="ext-button" type="button" onClick={add}>添加</button>
        </div>
      </SettingsGroup>

      <SettingsGroup title="显示">
        <SettingsToggleRow
          title="顶部显示 token 额度"
          description="上报了 quotaUsed / quotaTotal 的 Agent 会显示剩余额度"
          checked={settings.agentShowQuota}
          onChange={(agentShowQuota) => onSettingsChange({ ...settings, agentShowQuota })}
        />
      </SettingsGroup>

      <SettingsGroup title="本地接入接口" footer={`端口 ${port ?? "…"} · 仅监听 127.0.0.1，只接受展示数据，不执行任何命令。`}>
        <div style={{ padding: "10px 12px 12px" }}>
          <p className="ext-note">让 WorkBuddy / 豆包 / Marvis 等在上报状态时 POST 一段 JSON；字段 provider 必须与上面的标识一致。</p>
          <code className="ext-code">{`POST http://127.0.0.1:${port ?? 27182}/agent-status
{ "provider": "workbuddy", "phase": "running",
  "title": "整理周报", "task": "正在生成文档",
  "quotaUsed": 120, "quotaTotal": 500,
  "quotaLabel": "tokens", "needsApproval": false }`}</code>
          <p className="ext-note">phase 可选 running / waiting / completed / failed / idle；needsApproval 为 true 时岛上会提示需要授权。</p>
        </div>
      </SettingsGroup>

      <SettingsGroup title="当前上报">
        <div className="ext-status-list">
          {statuses.length === 0 ? (
            <span className="ext-note">暂无上报。Agent 推送一次状态后会出现在这里。</span>
          ) : statuses.map((status) => (
            <div className="ext-status-row" key={status.provider}>
              <strong>{providerLabel(status.provider)}</strong>
              <span>{status.phase}{status.title ? ` · ${status.title}` : ""}</span>
            </div>
          ))}
        </div>
      </SettingsGroup>
    </>
  );
}
