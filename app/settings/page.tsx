import { getSettings } from "@/lib/settings";
import SettingsScreen, { type SettingsRow } from "@/components/SettingsScreen";
import StatusesEditor from "@/components/StatusesEditor";
import SubStatusEditor, { type SubStatusRow } from "@/components/SubStatusEditor";
import { getSubStatuses } from "@/lib/substatus";
import MaintenanceCard from "@/components/MaintenanceCard";
import RowFieldsEditor from "@/components/RowFieldsEditor";
import { db } from "@/lib/db";
import { getStatuses } from "@/lib/status-store";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [settings, statuses, whatsappLeads, subStatuses] = await Promise.all([
    getSettings(),
    getStatuses(true),
    db.lead
      .count({ where: { source: "הודעה נכנסת", origin: "leadmanager" } })
      .catch(() => 0),
    getSubStatuses(),
  ]);

  // כמה לידים נראים ככפילות ועדיין לא סומנו
  const dupCandidates = await db.lead
    .findMany({
      where: { origin: "leadmanager", duplicateOf: null },
      orderBy: { intakeAt: "asc" },
      select: { firstName: true, lastName: true },
    })
    .catch(() => []);

  const seenNames = new Set<string>();
  let duplicates = 0;
  for (const l of dupCandidates) {
    const n = `${l.firstName ?? ""} ${l.lastName ?? ""}`
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
    if (n.split(" ").length < 2) continue;
    if (seenNames.has(n)) duplicates++;
    else seenNames.add(n);
  }

  return (
    <div className="app">
      <div className="topbar">
        <h1>הגדרות</h1>
      </div>

      <SettingsScreen settings={settings as SettingsRow} />
      <div className="section-title">תצוגה</div>
      <RowFieldsEditor current={settings.leadRowFields} />

      <MaintenanceCard count={whatsappLeads} duplicates={duplicates} />
      <StatusesEditor statuses={statuses} />
      <SubStatusEditor
        statuses={statuses}
        subStatuses={subStatuses as SubStatusRow[]}
      />
    </div>
  );
}
