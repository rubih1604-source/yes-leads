import { getSettings } from "@/lib/settings";
import SettingsScreen, { type SettingsRow } from "@/components/SettingsScreen";
import StatusesEditor from "@/components/StatusesEditor";
import MaintenanceCard from "@/components/MaintenanceCard";
import { db } from "@/lib/db";
import { getStatuses } from "@/lib/status-store";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [settings, statuses, whatsappLeads] = await Promise.all([
    getSettings(),
    getStatuses(true),
    db.lead
      .count({ where: { source: "הודעה נכנסת", origin: "leadmanager" } })
      .catch(() => 0),
  ]);

  return (
    <div className="app">
      <div className="topbar">
        <h1>הגדרות</h1>
      </div>

      <SettingsScreen settings={settings as SettingsRow} />
      <MaintenanceCard count={whatsappLeads} />
      <StatusesEditor statuses={statuses} />
    </div>
  );
}
