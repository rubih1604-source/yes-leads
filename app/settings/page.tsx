import { getSettings } from "@/lib/settings";
import SettingsScreen, { type SettingsRow } from "@/components/SettingsScreen";
import StatusesEditor from "@/components/StatusesEditor";
import { getStatuses } from "@/lib/status-store";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [settings, statuses] = await Promise.all([
    getSettings(),
    getStatuses(true),
  ]);

  return (
    <div className="app">
      <div className="topbar">
        <h1>הגדרות</h1>
      </div>

      <SettingsScreen settings={settings as SettingsRow} />
      <StatusesEditor statuses={statuses} />
    </div>
  );
}
