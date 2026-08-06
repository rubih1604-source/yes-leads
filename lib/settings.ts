import { db } from "./db";
import { readRowFields, type RowFieldKey } from "./row-fields";

export type AppSettings = {
  botEnabled: boolean;
  botOnlyOutsideHours: boolean;
  botPauseHours: number;
  replyCooldownMinutes: number;
  liveChatMinutes: number;
  revenueTarget: number;
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
