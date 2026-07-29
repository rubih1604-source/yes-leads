/**
 * ============================================================
 *  מענה על שאלות שירות וטכניקה
 * ============================================================
 *
 *  העיקרון: קלוד **מזהה** איזה נושא מתאים לשאלה של הלקוח.
 *  הוא לא כותב את התשובה - אנחנו שולחים את הטקסט שלך
 *  מילה במילה, בדיוק כמו שכתבת אותו.
 *
 *  אם אף נושא לא מתאים - לא שולחים כלום ופותחים משימה.
 */

import { db } from "./db";

export type MatchResult = {
  matched: boolean;
  answer: string | null;
  topic: string | null;
};

const SYSTEM_PROMPT = `אתה מסווג שאלות של לקוחות ישראלים בוואטסאפ.

תקבל רשימה ממוספרת של נושאים, ושאלה של לקוח.
תפקידך היחיד: להחליט איזה נושא מהרשימה עונה על השאלה.

כללים:
- אתה בוחר נושא רק אם הוא באמת עונה על מה שהלקוח שאל.
- אם אף נושא לא מתאים, או שאתה לא בטוח - החזר null. עדיף לא לענות מאשר לענות לא נכון.
- אתה לא כותב תשובה. אתה רק בוחר מספר.
- אתה מבין משמעות, לא מילים. "איך אני מתנתק מהוט" ו"מה עושים עם החברה הקודמת" הם אותו נושא.

החזר JSON בלבד: {"topicNumber": מספר או null, "confidence": 0.0 עד 1.0}`;

export async function matchKnowledge(params: {
  question: string;
}): Promise<MatchResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return { matched: false, answer: null, topic: null };

  const items = await db.knowledgeItem.findMany({
    where: { active: true },
    orderBy: { createdAt: "asc" },
    take: 60,
  });

  if (items.length === 0) return { matched: false, answer: null, topic: null };

  const list = items
    .map((item, i) => `${i + 1}. ${item.topic}\n   ${item.answer.slice(0, 300)}`)
    .join("\n\n");

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
        max_tokens: 200,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `הנושאים:\n\n${list}\n\n---\n\nשאלת הלקוח: "${params.question.trim()}"`,
          },
        ],
      }),
      cache: "no-store",
    });

    if (!response.ok) return { matched: false, answer: null, topic: null };

    const data = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const text =
      data.content
        ?.filter((c) => c.type === "text")
        .map((c) => c.text ?? "")
        .join("") ?? "";

    const parsed = JSON.parse(text.replace(/```json|```/g, "").trim()) as {
      topicNumber?: number | null;
      confidence?: number;
    };

    const num = parsed.topicNumber;
    const confidence =
      typeof parsed.confidence === "number" ? parsed.confidence : 0;

    if (
      typeof num !== "number" ||
      num < 1 ||
      num > items.length ||
      confidence < 0.6
    ) {
      return { matched: false, answer: null, topic: null };
    }

    const item = items[num - 1];

    // הטקסט נשלח בדיוק כפי שנכתב. בלי ניסוח מחדש.
    return { matched: true, answer: item.answer, topic: item.topic };
  } catch {
    return { matched: false, answer: null, topic: null };
  }
}

/** התשובות שרובי הכתיב, נטענות בלחיצה אחת */
export const DEFAULT_KNOWLEDGE = [
  {
    topic: "ניתוק מהחברה הקודמת",
    answer: `היי, הניתוק מהחברה הקודמת שלך מתבצע או ע"י ניתוק שאתה מבצע דרך אתר נתק - https://www.netek.co.il
(רק אל תשכח בסוף לאשר את המייל שקיבלת מהם)

אופציה שנייה זה לעלות מול הספק תקשורת.

אם לא הסתדרת וצריך עזרה נוספת אני כאן.`,
  },
  {
    topic: "שירות, תמיכה טכנית והתקנה",
    answer: `היי, בעיקרון יש 3 אופציות:

* 2080* - לטכני שלוחה 1/2, לשירות 1/3 (השירות עובד עד 16:00)

* האזור האישי באתר שלנו, יש שם מגוון רחב של פעולות באופן עצמאי - https://www.yes.co.il/personal-account/

* צ'אט עם נציג בוואטסאפ - 050-669-5223

אם צריך כל עזרה נוספת, אתפנה ואעזור :)`,
  },
];
