import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import type { IslandSettings } from "../../features/appearance/types";
import { ModuleSwitchSection } from "./ModuleSwitchSection";
import "./ExtensionSettingsPages.css";

/** Settings → 扩展功能 → 微信内容. */
export function WeChatContentSettingsPage({
  settings,
  onSettingsChange,
}: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
}) {
  return (
    <>
      <ModuleSwitchSection
        label="读取微信消息内容"
        checked={settings.wechatContentEnabled}
        onChange={(wechatContentEnabled) => onSettingsChange({ ...settings, wechatContentEnabled })}
      />
      <SettingsGroup
        title="岛内提示"
        footer="消息内容通过 Windows 辅助功能接口从微信窗口读取。不同微信版本的可访问性结构可能不同，读不到时自动退回通用提示「微信新消息」，不影响提醒本身。"
      >
        <SettingsToggleRow
          title="显示发送者与正文"
          description="关闭后只显示「微信新消息」，不读取窗口文字"
          checked={settings.wechatContentEnabled}
          onChange={(wechatContentEnabled) => onSettingsChange({ ...settings, wechatContentEnabled })}
        />
      </SettingsGroup>
      <p className="ext-note" style={{ marginTop: 10 }}>
        微信提醒总开关在「消息」页；本页只控制是否在岛上显示具体文字。
      </p>
    </>
  );
}
