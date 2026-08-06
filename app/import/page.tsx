import ImportScreen from "@/components/ImportScreen";
import { getStatuses } from "@/lib/status-store";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const statuses = await getStatuses();

  return (
    <div className="app">
      <div className="topbar">
        <h1>טעינת דוח</h1>
      </div>
      <ImportScreen statuses={statuses} />
    </div>
  );
}
