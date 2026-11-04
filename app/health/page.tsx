import BackLink from "@/components/BackLink";
import SystemHealth from "@/components/SystemHealth";

export const dynamic = "force-dynamic";

export default function HealthPage() {
  return (
    <div className="app">
      <div className="topbar">
        <BackLink fallback="/more" label="חזרה" />
        <h1>בריאות המערכת</h1>
      </div>

      <SystemHealth />
    </div>
  );
}
