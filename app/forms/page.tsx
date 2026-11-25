import { headers } from "next/headers";
import FormsScreen from "@/components/FormsScreen";

export const dynamic = "force-dynamic";

/**
 * הכתובת נקראת מהבקשה ולא מהגדרה.
 *
 * כך הקישור שמוצג הוא תמיד הכתובת האמיתית שממנה נכנסת,
 * ולא ערך שנשמר פעם ועלול להיות ישן.
 */
export default function FormsPage() {
  const h = headers();

  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";

  return <FormsScreen origin={host ? `${proto}://${host}` : ""} />;
}
