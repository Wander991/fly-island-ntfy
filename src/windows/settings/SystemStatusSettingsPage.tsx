import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { SettingsSelect } from "../../components/settings/SettingsSelect";
import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import { PAGE_DOTS, SYSTEM_REFRESH_SECONDS } from "../../features/appearance/settingsLimits";
import type { IslandSettings, PageDot } from "../../features/appearance/types";
import { SYSTEM_TOOLS } from "../../features/system-status/tools";
import { useTranslation } from "../../i18n";
import { ModuleSwitchSection } from "./ModuleSwitchSection";
import "./ExtensionSettingsPages.css";

/** Settings → 扩展功能 → 系统状态: what the first page shows and launches. */
export function SystemStatusSettingsPage({
  settings,
  onSettingsChange,
}: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
}) {
  const t = useTranslation();
  const pageOptions = PAGE_DOTS.map((dot) => ({ value: dot, label: t.island.pageNames[dot] }));
  const refreshOptions = SYSTEM_REFRESH_SECONDS.map((seconds) => ({
    value: String(seconds),
    label: `${seconds} 秒`,
  }));
  const toggleTool = (id: string) => {
    const on = settings.systemTools.includes(id);
    onSettingsChange({
      ...settings,
      systemTools: on ? settings.systemTools.filter((item) => item !== id) : [...settings.systemTools, id],
    });
  };

  return (
    <>
      <ModuleSwitchSection
        label="显示系统状态页"
        checked={settings.systemStatusEnabled}
        onChange={(systemStatusEnabled) => onSettingsChange({ ...settings, systemStatusEnabled })}
      />
      <SettingsGroup title="页面">
        <SettingsRow
          title="默认第一页"
          description="岛启动和关闭设置后打开的页面"
          control={
            <SettingsSelect
              value={settings.defaultPage}
              options={pageOptions}
              ariaLabel="默认第一页"
              onChange={(value) => onSettingsChange({ ...settings, defaultPage: value as PageDot })}
            />
          }
        />
        <SettingsRow
          title="刷新间隔"
          description="CPU / 内存 / 显卡 / 网速的采样间隔"
          control={
            <SettingsSelect
              value={String(settings.systemRefreshSeconds)}
              options={refreshOptions}
              ariaLabel="刷新间隔"
              onChange={(value) => onSettingsChange({ ...settings, systemRefreshSeconds: Number(value) })}
            />
          }
        />
        <SettingsToggleRow
          title="显示实时网速"
          checked={settings.systemShowNetwork}
          onChange={(systemShowNetwork) => onSettingsChange({ ...settings, systemShowNetwork })}
        />
        <SettingsToggleRow
          title="显示时钟"
          checked={settings.systemShowClock}
          onChange={(systemShowClock) => onSettingsChange({ ...settings, systemShowClock })}
        />
        <SettingsToggleRow
          title="显示日期"
          checked={settings.systemShowDate}
          onChange={(systemShowDate) => onSettingsChange({ ...settings, systemShowDate })}
        />
        <SettingsToggleRow
          title="显示 CPU"
          checked={settings.systemShowCpu}
          onChange={(systemShowCpu) => onSettingsChange({ ...settings, systemShowCpu })}
        />
        <SettingsToggleRow
          title="显示内存"
          checked={settings.systemShowRam}
          onChange={(systemShowRam) => onSettingsChange({ ...settings, systemShowRam })}
        />
        <SettingsToggleRow
          title="显示显卡"
          checked={settings.systemShowGpu}
          onChange={(systemShowGpu) => onSettingsChange({ ...settings, systemShowGpu })}
        />
      </SettingsGroup>
      <SettingsGroup title="系统工具快捷按钮" footer="点击立即打开对应的 Windows 自带工具；只在本地以白名单方式启动。">
        <div className="ext-tool-grid">
          {SYSTEM_TOOLS.map((tool) => {
            const Icon = tool.icon;
            const on = settings.systemTools.includes(tool.id);
            return (
              <button
                key={tool.id}
                className={`ext-tool-chip${on ? " is-on" : ""}`}
                type="button"
                aria-pressed={on}
                title={tool.hint}
                onClick={() => toggleTool(tool.id)}
              >
                <Icon size={14} strokeWidth={1.6} aria-hidden="true" />
                <span>{tool.label}</span>
              </button>
            );
          })}
        </div>
      </SettingsGroup>
    </>
  );
}
