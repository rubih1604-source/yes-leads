import FormsScreen from "@/components/FormsScreen";
import BackLink from "@/components/BackLink";

export const dynamic = "force-dynamic";

export default function FormsPage() {
  return (
    <div className="app">
      <div className="topbar">
        <BackLink fallback="/more" label="חזרה" />
        <h1>התממשקות</h1>
      </div>

      <FormsScreen />
    </div>
  );
}
