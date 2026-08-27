import { db } from "./db";
import { readRowFields, type RowFieldKey } from "./row-fields";

export type AppSettings = {
  botEnabled: boolean;
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
  botFromHour: number;
  botToHour: number;
  botStatuses: string[];
  leadRowFields: RowFieldKey[];
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
  botFromHour: 8,
  botToHour: 21,
  botStatuses: [],
  leadRowFields: readRowFields(null),
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
      botFromHour: row.botFromHour,
      botToHour: row.botToHour,
      botStatuses: Array.isArray(row.botStatuses)
        ? (row.botStatuses as string[]).filter(
            (x): x is string => typeof x === "string"
          )
        : [],
      leadRowFields: readRowFields(row.leadRowFields),
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
