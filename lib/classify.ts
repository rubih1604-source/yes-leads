/**
 * ============================================================
 *  סיווג תגובות לקוחות בעברית
 * ============================================================
 *
 *  שולח את ההודעה של הלקוח לקלוד ומקבל בחזרה כוונה מובנית.
 *  אם השירות לא זמין או המפתח חסר - מחזיר "לא ידוע"
 *  והמערכת פשוט תפתח משימה ידנית. שום דבר לא נשבר.
 */

export type Intent =
  | "interested"
  | "not_interested"
  | "remove"
  | "callback_request"
  | "question"
  | "existing_customer"
  | "technical_question"
  | "other"
  | "unknown";

export type Classification = {
  intent: Intent;
  confidence: number;
  requestedCallbackAt: string | null;
  callbackParseConfident: boolean;
  suggestedReply: string | null;
  reasoning: string | null;
};

const FALLBACK: Classification = {
  intent: "unknown",
  confidence: 0,
  requestedCallbackAt: null,
  callbackParseConfident: false,
  suggestedReply: null,
  reasoning: "הסיווג לא זמין",
};

const SYSTEM_PROMPT = `אתה העוזר האישי של רובי, סוכן מכירות של חברת yes (טלוויזיה ואינטרנט) בישראל.
תפקידך כאן: לקרוא הודעה שלקוח שלח ולהבין מה הוא רוצה.

אתה מבין משמעות, לא מילות מפתח. לקוח שכותב "בוא נדבר" או "כמה זה יוצא לי" מביע עניין
בדיוק כמו מי שכותב "מעוניין". לקוח שכותב "אני מסודר" או "כבר עשיתי" אינו מעוניין.

הלקוח קיבל הודעה מהסוכן וענה. תפקידך לזהות מה הלקוח רוצה.

הקטגוריות:
- interested: מביע עניין, רוצה לשמוע, שואל על מחיר בכוונה חיובית, או מבקש שיתקשרו אליו **בלי לציין מתי** (למשל "מעוניין תתקשר אליי")
- not_interested: אומר שלא מעוניין, כבר סידר, לא רלוונטי
- remove: מבקש במפורש להפסיק לקבל הודעות ("הסר", "תפסיקו", "אל תשלחו")
- callback_request: **רק** כשהלקוח ציין זמן מפורש ("תתקשר מחר", "אחרי 5", "ביום ראשון בבוקר"). בלי ציון זמן זה interested ולא callback_request.
- question: שאלה שקשורה להצעה או לתהליך המכירה (מה כלול, איך מתקדמים, כמה זמן לוקח)
- technical_question: שאלת שירות או תפעול שאינה קשורה למכירה - איך מתחברים לנטפליקס, איך מורידים אפליקציה, תקלה בממיר, שינוי סיסמה, בעיה בחשבונית
- existing_customer: אומר שהוא כבר לקוח של yes
- other: כל דבר אחר, כולל הודעות לא ברורות, אימוג'י בלבד, או טקסט לא קריא

כללים:
- היה שמרן. אם אינך בטוח, השתמש ב-other עם confidence נמוך.
- לקוח שכתב "מעוניין", "כן", "בטח", "תתקשר" - זה interested עם confidence גבוה.
- confidence הוא מספר בין 0 ל-1.
- requestedCallbackAt: רק אם הלקוח ציין זמן. פורמט ISO 8601 עם אזור זמן +03:00. אם לא ציין זמן - null.
- callbackParseConfident: true רק אם הזמן שחילצת חד משמעי. "מחר בערב" אינו חד משמעי.
- suggestedReply: משפט קצר בעברית טבעית שהסוכן יכול לשלוח. בלי סימני קריאה מוגזמים.

החזר JSON בלבד, בלי טקסט לפני או אחרי, בלי סימני קוד.`;

export async function classifyMessage(params: {
  text: string;
  currentStatus: string;
  lastTemplateSent?: string | null;
  now?: Date;
}): Promise<Classification> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return { ...FALLBACK, reasoning: "חסר מפתח API של קלוד" };
  if (!params.text?.trim()) return { ...FALLBACK, reasoning: "הודעה ריקה" };

  const now = params.now ?? new Date();
  const nowIsrael = now.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" });

  const userContent = [
    `הזמן עכשיו בישראל: ${nowIsrael}`,
    `הסטטוס הנוכחי של הליד: ${params.currentStatus}`,
    params.lastTemplateSent
      ? `ההודעה האחרונה שנשלחה ללקוח: ${params.lastTemplateSent}`
      : null,
    "",
    `הודעת הלקוח: "${params.text.trim()}"`,
    "",
    'החזר JSON במבנה: {"intent":"...","confidence":0.0,"requestedCallbackAt":null,"callbackParseConfident":false,"suggestedReply":"...","reasoning":"..."}',
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.CLAUDE_MODEL?.trim() || "claude-haiku-4-5-20251001",
        max_tokens: 500,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userContent }],
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        ...FALLBACK,
        reasoning: `קלוד החזיר שגיאה ${response.status}: ${body.slice(0, 200)}`,
      };
    }

    const data = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };

    const text =
      data.content
        ?.filter((c) => c.type === "text")
        .map((c) => c.text ?? "")
        .join("") ?? "";

    const cleaned = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned) as Partial<Classification>;

    const validIntents: Intent[] = [
      "interested",
      "not_interested",
      "remove",
      "callback_request",
      "question",
      "existing_customer",
      "technical_question",
      "other",
    ];

    const intent = validIntents.includes(parsed.intent as Intent)
      ? (parsed.intent as Intent)
      : "other";

    const confidence =
      typeof parsed.confidence === "number"
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0;

    return {
      intent,
      confidence,
      requestedCallbackAt:
        typeof parsed.requestedCallbackAt === "string"
          ? parsed.requestedCallbackAt
          : null,
      callbackParseConfident: parsed.callbackParseConfident === true,
      suggestedReply:
        typeof parsed.suggestedReply === "string" ? parsed.suggestedReply : null,
      reasoning:
        typeof parsed.reasoning === "string" ? parsed.reasoning : null,
    };
  } catch (err) {
    return {
      ...FALLBACK,
      reasoning: err instanceof Error ? err.message : String(err),
    };
  }
}
