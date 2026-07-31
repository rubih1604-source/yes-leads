/**
 * ============================================================
 *  תת-סטטוסים
 * ============================================================
 *
 *  סטטוס עונה על "איפה הליד עומד". תת-סטטוס עונה על
 *  "מה חשוב ללקוח הזה" - ממירים, ספורט, סטרימינג, מחיר.
 *
 *  ההפרדה הזו היא מה שמאפשר לשלוח מבצע ממוקד: מבצע
 *  ספורט הולך רק למי שהספורט מעניין אותו.
 */

import { db } from "./db";

export type SubStatusDef = {
  id: string;
  statusName: string;
  name: string;
  position: number;
};

/** ברירת המחדל שרובי הגדיר לסטטוס "מחכה למבצע" */
export const DEFAULT_SUBSTATUSES: Record<string, string[]> = {
  "מחכה למבצע": [
    "חשוב ללקוח ממירים",
    "חשוב ללקוח ספורט",
    "חשוב ללקוח סטרימינג",
    "מחיר זול",
  ],
};

export async function getSubStatuses(): Promise<SubStatusDef[]> {
  try {
    return await db.subStatus.findMany({
      orderBy: [{ statusName: "asc" }, { position: "asc" }],
    });
  } catch {
    return [];
  }
}

/** מקבץ לפי סטטוס אב, לשימוש בבורר הסטטוס */
export async function getSubStatusMap(): Promise<Record<string, string[]>> {
  const rows = await getSubStatuses();
  const map: Record<string, string[]> = {};
  for (const row of rows) {
    (map[row.statusName] ??= []).push(row.name);
  }
  return map;
}
