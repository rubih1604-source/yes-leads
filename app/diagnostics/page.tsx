import DiagnosticsScreen from "@/components/DiagnosticsScreen";
import ClaimChecker from "@/components/ClaimChecker";
import RecoverLeads from "@/components/RecoverLeads";

export const dynamic = "force-dynamic";

export default function DiagnosticsPage() {
  return (
    <>
      <DiagnosticsScreen />
      {/*
        בדיקת שיוך: התנגשויות בין כללים, ובדיקה נקודתית
        של "מי תופס את הליד הזה". עד היום לא הייתה שום דרך
        לענות על זה חוץ מלנחש.
      */}
      <ClaimChecker />

      {/*
        שחזור לידים שהגיעו ליומן הקליטה ולא נוצר להם ליד.
        מראה קודם מה חסר, ורק אז מציע ליצור.
      */}
      <RecoverLeads />
    </>
  );
}
