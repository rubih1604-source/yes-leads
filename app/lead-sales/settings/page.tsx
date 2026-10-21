import Link from "next/link";
import { getSettings } from "@/lib/settings";
import SaleSettingsScreen from "@/components/SaleSettingsScreen";

export const dynamic = "force-dynamic";

/** הגדרות שקשורות רק למכירת לידים */
export default async function SaleSettingsPage() {
  const settings = await getSettings();

  return (
    <div className="app">
      <Link href="/lead-sales" className="back">
        → חזרה למכירת לידים
      </Link>

      <div className="topbar">
        <h1>הגדרות מכירת לידים</h1>
      </div>

      <SaleSettingsScreen initial={settings.saleRowFields} />
    </div>
  );
}
