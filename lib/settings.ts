import { db } from "./db";
import { readRowFields, type RowFieldKey } from "./row-fields";
import {
  readSaleRowFields,
  type SaleColumnKey,
} from "./sale-report-columns";
import { DEFAULT_DIALER } from "./dialer";

export type AppSettings = {
  botEnabled: boolean;
  /** "all" או "broadcast" - ראה הערה בסכימה */
  botMode: string;
  botOnlyOutsideHours: boolean;
  botPauseHours: number;
  replyCooldownMinutes: number;
  liveChatMinutes: number;
  revenueTarget: number;
  callbackStatuses: string[];
  callbackMorningHour: number;
  callbackAfternoonHour: number;
  callbackCutoffHour: number;
  callbackEnabled: boolean;
  notifyEmail: boolean;
  notifyPush: boolean;
  notifyBanner: boolean;
  /** תבניות החיוג - איזו אפליקציה פותחת שיחה */
  dialerMobile: string;
  dialerDesktop: string;
  botFromHour: number;
  botToHour: number;
  botStatuses: string[];
  closeStatuses: string[];
  /** סטטוסים שאומרים: התחבר ליס, לא דרכי */
  lostStatuses: string[];
  leadRowFields: RowFieldKey[];
  /** אילו שדות מוצגים בשורת ליד ברשימת המכירה */
  saleRowFields: SaleColumnKey[];
  /** סטטוסים שלא נכנסים לדאטה */
  dataExcludeStatuses: string[];
  /** על אילו לידים נשלח מייל התראה */
  leadEmailMode: LeadEmailMode;
  onlyAfterTemplate: boolean;
  offDutyUntil: Date | null;
  afterHoursGrace: number;
  requireTemplateFirst: boolean;
  replyInterested: string;
  replyAfterHours: string;
  replyCallback: string;
};

const DEFAULTS: AppSettings = {
  botEnabled: true,
  botMode: "all",
  botOnlyOutsideHours: false,
  botPauseHours: 2,
  replyCooldownMinutes: 10,
  liveChatMinutes: 30,
  revenueTarget: 0,
  callbackStatuses: [],
  callbackMorningHour: 10,
  callbackAfternoonHour: 13,
  callbackCutoffHour: 18,
  callbackEnabled: false,
  notifyEmail: true,
  notifyPush: true,
  notifyBanner: true,
  dialerMobile: DEFAULT_DIALER,
  dialerDesktop: DEFAULT_DIALER,
  botFromHour: 8,
  botToHour: 21,
  botStatuses: [],
  closeStatuses: [],
  lostStatuses: [],
  leadRowFields: readRowFields(null),
  saleRowFields: readSaleRowFields(null),
  dataExcludeStatuses: ["נסגר", "לקוח קיים"],
  leadEmailMode: "all",
  onlyAfterTemplate: false,
  offDutyUntil: null,
  afterHoursGrace: 60,
  requireTemplateFirst: true,
  replyInterested: "היי, אסיים שיחה כמה דק ואתקשר :)",
  replyAfterHours: "היי, אני כבר סיימתי לעבוד. {מתי} מתאים לך?\nואם כן באיזה שעה :)",
  replyCallback: "מעולה, רשמתי. אחזור אליך בזמן שביקשת :)",
};

export async function getSettings(): Promise<AppSettings> {
  try {
    const row = await db.settings.upsert({
      where: { id: "main" },
      create: { id: "main" },
      update: {},
    });
    return {
      botEnabled: row.botEnabled,
      botMode: row.botMode === "broadcast" ? "broadcast" : "all",
      botOnlyOutsideHours: row.botOnlyOutsideHours,
      botPauseHours: row.botPauseHours,
      replyCooldownMinutes: row.replyCooldownMinutes,
      liveChatMinutes: row.liveChatMinutes,
      revenueTarget: row.revenueTarget,
      callbackStatuses: Array.isArray(row.callbackStatuses)
        ? (row.callbackStatuses as string[]).filter(
            (x): x is string => typeof x === "string"
          )
        : [],
      callbackMorningHour: row.callbackMorningHour,
      callbackAfternoonHour: row.callbackAfternoonHour,
      callbackCutoffHour: row.callbackCutoffHour,
      callbackEnabled: row.callbackEnabled,
      dialerMobile: row.dialerMobile || DEFAULT_DIALER,
      dialerDesktop: row.dialerDesktop || DEFAULT_DIALER,
      notifyEmail: row.notifyEmail ?? true,
      notifyPush: row.notifyPush ?? true,
      notifyBanner: row.notifyBanner ?? true,
      botFromHour: row.botFromHour,
      botToHour: row.botToHour,
      closeStatuses: Array.isArray(row.closeStatuses)
        ? (row.closeStatuses as string[]).filter(
            (x): x is string => typeof x === "string"
          )
        : [],
      lostStatuses: Array.isArray(row.lostStatuses)
        ? (row.lostStatuses as string[]).filter(
            (x): x is string => typeof x === "string"
          )
        : [],
      botStatuses: Array.isArray(row.botStatuses)
        ? (row.botStatuses as string[]).filter(
            (x): x is string => typeof x === "string"
          )
        : [],
      leadRowFields: readRowFields(row.leadRowFields),
      saleRowFields: readSaleRowFields(row.saleRowFields),
      dataExcludeStatuses: Array.isArray(row.dataExcludeStatuses)
        ? (row.dataExcludeStatuses as unknown[])
            .map((x) => String(x ?? "").trim())
            .filter(Boolean)
        : ["נסגר", "לקוח קיים"],
      leadEmailMode: (["all", "mine", "sale", "off"] as const).includes(
        row.leadEmailMode as LeadEmailMode
      )
        ? (row.leadEmailMode as LeadEmailMode)
        : "all",
      onlyAfterTemplate: row.onlyAfterTemplate,
      offDutyUntil: row.offDutyUntil,
      afterHoursGrace: row.afterHoursGrace,
      requireTemplateFirst: row.requireTemplateFirst,
      replyInterested: row.replyInterested,
      replyAfterHours: row.replyAfterHours,
      replyCallback: row.replyCallback,
    };
  } catch {
    return DEFAULTS;
  }
}
