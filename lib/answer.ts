/**
 * ============================================================
 *  מענה על שאלות טכניות ושירות
 * ============================================================
 *
 *  הכלל הקדוש: הבוט עונה **רק** ממה שכתוב במאגר הידע שלך.
 *  הוא לא ממציא מחירים, נהלים, מספרי טלפון או הבטחות.
 *
 *  אם התשובה לא נמצאת במאגר - הוא אומר ללקוח שהוא מעביר
 *  לנציג, ופותח לך משימה. עדיף "אבדוק ואחזור אליך" מאשר
 *  תשובה שגויה בשם yes.
 */

import { db } from "./db";

export type AnswerResult = {
  canAnswer: boolean;
  answer: string | null;
  usedTopics: string[];
};

const SYSTEM_PROMPT = `אתה העוזר האישי של רובי, סוכן מכירות עצמאי של חברת yes בישראל.
אתה עונה ללקוחות בוואטסאפ, בעברית טבעית וחמה, בלי להישמע רובוטי.

חוקי הברזל שלך:
1. אתה עונה **אך ורק** על סמך "מאגר הידע" שיינתן לך למטה. אסור לך להשתמש בשום ידע אחר על yes.
2. אם התשובה לא נמצאת במאגר, או שאתה לא בטוח - החזר canAnswer: false. אל תנחש. אל תמציא מחירים, מספרי טלפון, נהלים או תנאים.
3. אל תבטיח שום דבר בשם רובי או בשם yes שלא כתוב במפורש במאגר.
4. תשובה קצרה - שתיים עד שלוש שורות לכל היותר. זו הודעת וואטסאפ, לא מאמר.
5. דבר בגוף ראשון בשם המשרד ("נשמח לעזור"), אל תציג את עצמך כבוט.
6. בלי סימני קריאה מיותרים ובלי אימוג'ים מוגזמים. לכל היותר אימוג'י אחד.

החזר JSON בלבד, בלי טקסט מסביב ובלי סימני קוד:
{"canAnswer": true/false, "answer": "הטקסט לשליחה או null", "usedTopics": ["הנושאים מהמאגר שהסתמכת עליהם"]}`;

export async function answerFromKnowledge(params: {
  question: string;
  customerName?: string | null;
}): Promise<AnswerResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return { canAnswer: false, answer: null, usedTopics: [] };

  const items = await db.knowledgeItem.findMany({
    where: { active: true },
    orderBy: { updatedAt: "desc" },
    take: 60,
  });

  if (items.length === 0) {
    return { canAnswer: false, answer: null, usedTopics: [] };
  }

  const knowledge = items
    .map((i) => `### ${i.topic}\n${i.answer}`)
    .join("\n\n");

  const userContent = [
    "מאגר הידע:",
    "",
    knowledge,
    "",
    "---",
    "",
    params.customerName ? `שם הלקוח: ${params.customerName}` : null,
    `שאלת הלקוח: "${params.question.trim()}"`,
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
        max_tokens: 600,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userContent }],
      }),
      cache: "no-store",
    });

    if (!response.ok) return { canAnswer: false, answer: null, usedTopics: [] };

    const data = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const text =
      data.content
        ?.filter((c) => c.type === "text")
        .map((c) => c.text ?? "")
        .join("") ?? "";

    const parsed = JSON.parse(text.replace(/```json|```/g, "").trim()) as
      Partial<AnswerResult>;

    const answer =
      typeof parsed.answer === "string" && parsed.answer.trim()
        ? parsed.answer.trim()
        : null;

    return {
      canAnswer: parsed.canAnswer === true && answer !== null,
      answer,
      usedTopics: Array.isArray(parsed.usedTopics)
        ? parsed.usedTopics.filter((t): t is string => typeof t === "string")
        : [],
    };
  } catch {
    return { canAnswer: false, answer: null, usedTopics: [] };
  }
}
