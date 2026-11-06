/**
 * ============================================================
 *  פעולת תחזוקה שנותרה למחיקה
 * ============================================================
 *
 *  הפעולה שחררה לידים שהבוט הושתק מולם בטעות. ההשתקה
 *  האוטומטית נמחקה בגרסה 198, ולכן אין ממה לשחרר.
 *
 *  הקובץ ריק בכוונה - ראה ההסבר ב-lib/bot.ts.
 */
import { NextResponse } from "next/server";

const GONE = {
  error: "הפעולה הוסרה - אין יותר השתקה אוטומטית של הבוט",
};

export async function GET() {
  return NextResponse.json(GONE, { status: 410 });
}

export async function POST() {
  return NextResponse.json(GONE, { status: 410 });
}
