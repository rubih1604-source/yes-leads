import Link from "next/link";
import { getSettings } from "@/lib/settings";
import SettingsScreen, { type SettingsRow } from "@/components/SettingsScreen";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await getSettings();

  return (
    <div className="app">
      <div className="topbar">
        <Link href="/" className="nav-back">
          <span>→</span>
          <span>חזרה לרשימה</span>
        </Link>
        <h1>הגדרות</h1>
      </div>

      <SettingsScreen settings={settings as SettingsRow} />
    </div>
  );
}
