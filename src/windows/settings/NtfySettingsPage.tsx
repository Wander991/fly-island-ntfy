import { NtfyPanelBody } from "../../features/ntfy/NtfyPanelBody";
import type { NtfyController } from "../../features/ntfy/useNtfy";
import "./ExtensionSettingsPages.css";

/**
 * Settings → 扩展功能 → ntfy 通知. The island tab is read-only now; all
 * configuration lives here, with the recent notification list below.
 */
export function NtfySettingsPage({ controller }: { controller: NtfyController }) {
  return (
    <div className="ext-ntfy-host">
      <NtfyPanelBody controller={controller} showSettings />
    </div>
  );
}
