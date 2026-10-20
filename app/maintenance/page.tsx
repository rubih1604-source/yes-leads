import BackLink from "@/components/BackLink";
import MaintenanceScreen from "@/components/MaintenanceScreen";

export const dynamic = "force-dynamic";

export default function MaintenancePage() {
  return (
    <div className="app">
      <div className="topbar">
        <BackLink fallback="/more" label="חזרה" />
        <h1>תחזוקה</h1>
      </div>

      <MaintenanceScreen />
    </div>
  );
}
