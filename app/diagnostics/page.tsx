import DiagnosticsScreen from "@/components/DiagnosticsScreen";
import ClaimChecker from "@/components/ClaimChecker";
import RecoverLeads from "@/components/RecoverLeads";

export const dynamic = "force-dynamic";

export default function DiagnosticsPage() {
  return (
    <DiagnosticsScreen>
      {/*
        שני הקטעים האלה נכנסים **לתוך** מסך האבחון.

        קודם הם היו אחים שלו, כלומר מחוץ ל-div.app שנותן
        את עמודת התוכן - ולכן הם נשפכו מתחת לסרגל הצד
        במקום לשבת במקום שלהם, בניגוד לכל שאר המסכים.
      */}
      <ClaimChecker />
      <RecoverLeads />
    </DiagnosticsScreen>
  );
}
