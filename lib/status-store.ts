/**
 * ============================================================
 *  רשימת הסטטוסים
 * ============================================================
 *
 *  הסטטוסים יושבים במסד ולא בקוד, כדי שאפשר יהיה להוסיף
 *  ולערוך אותם מהמערכת בלי פריסה מחדש.
 *
 *  בפעם הראשונה נטענים אוטומטית הסטטוסים שהוגדרו מלכתחילה.
 */

import { db } from "./db";
import { DEFAULT_STATUSES, type StatusDef } from "./statuses";

let cache: { at: number; list: StatusDef[] } | null = null;
const CACHE_MS = 15_000;

export async function getStatuses(force = false): Promise<StatusDef[]> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.list;

  try {
    let rows = await db.status.findMany({
      orderBy: [{ position: "asc" }, { name: "asc" }],
    });

    // טעינה ראשונה
    if (rows.length === 0) {
      for (const [i, s] of DEFAULT_STATUSES.entries()) {
        await db.status
          .create({
            data: {
              name: s.name,
              color: s.color,
              position: i,
              terminal: s.terminal ?? false,
              won: s.won ?? false,
              builtin: true,
            },
          })
          .catch(() => null);
      }
      rows = await db.status.findMany({
        orderBy: [{ position: "asc" }, { name: "asc" }],
      });
    }

    const list: StatusDef[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      position: r.position,
      terminal: r.terminal,
      won: r.won,
      builtin: r.builtin,
      commission: r.commission,
    }));

    cache = { at: Date.now(), list };
    return list;
  } catch {
    return DEFAULT_STATUSES;
  }
}

export function clearStatusCache() {
  cache = null;
}

export async function isKnownStatus(name: string): Promise<boolean> {
  const list = await getStatuses();
  return list.some((s) => s.name === name);
}

export async function getWonStatusNames(): Promise<string[]> {
  const list = await getStatuses();
  return list.filter((s) => s.won).map((s) => s.name);
}
