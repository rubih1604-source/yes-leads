import { getSettings } from "@/lib/settings";
import SettingsScreen, { type SettingsRow } from "@/components/SettingsScreen";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await getSettings();

  return (
    <div className="app">
      <div className="topbar">
        <h1>הגדרות</h1>
      </div>

      <SettingsScreen settings={settings as SettingsRow} />
    </div>
  );
}
