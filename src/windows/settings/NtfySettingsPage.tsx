import { NtfyPanelBody } from "../../features/ntfy/NtfyPanelBody";
import type { NtfyController } from "../../features/ntfy/useNtfy";
import "./ExtensionSettingsPages.css";

/**
 * Settings → 扩展功能 → ntfy 通知. The same panel the messages page uses, so the
 * servers, topics, mutes and recent notifications all have one home.
 */
export function NtfySettingsPage({ controller }: { controller: NtfyController }) {
  return (
    <div className="ext-ntfy-host">
      <NtfyPanelBody controller={controller} />
    </div>
  );
}
