/**
 * ============================================================
 *  קריאת דוח מכירות
 * ============================================================
 *
 *  הדוח מגיע כ-CSV. אנחנו מזהים לבד איזו עמודה היא השם,
 *  איזו הטלפון ואיזו הסטטוס - לפי כותרות נפוצות בעברית
 *  ובאנגלית, כדי שלא תצטרך לסדר את הקובץ.
 */

export type SheetRow = {
  name: string | null;
  phone: string | null;
  status: string | null;
  raw: Record<string, string>;
};

const NAME_KEYS = [
  "שם", "שם מלא", "שם הלקוח", "לקוח", "שם לקוח",
  "name", "full name", "fullname", "customer", "customer name",
];

const PHONE_KEYS = [
  "טלפון", "נייד", "טלפון נייד", "מספר טלפון", "מס' טלפון", "פלאפון",
  "phone", "mobile", "cell", "phone number", "telephone",
];

const STATUS_KEYS = [
  "סטטוס", "מצב", "סוג עסקה", "עסקה", "תוצאה", "חבילה",
  "status", "deal", "result", "package",
];

/** מפצל שורת CSV, כולל תמיכה בשדות עם מרכאות */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if ((ch === "," || ch === "\t" || ch === ";") && !quoted) {
      out.push(cur.trim());
      cur = "";
      continue;
    }

    cur += ch;
  }

  out.push(cur.trim());
  return out;
}

function matchHeader(header: string, keys: string[]): boolean {
  const h = header.trim().toLowerCase().replace(/["']/g, "");
  return keys.some((k) => h === k || h.includes(k));
}

export function parseSheet(text: string): {
  rows: SheetRow[];
  headers: string[];
  detected: { name: number; phone: number; status: number };
} {
  const lines = text
    .replace(/^\uFEFF/, "") // סימן BOM של אקסל
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "");

  if (lines.length < 2) {
    return { rows: [], headers: [], detected: { name: -1, phone: -1, status: -1 } };
  }

  const headers = splitCsvLine(lines[0]);

  const detected = {
    name: headers.findIndex((h) => matchHeader(h, NAME_KEYS)),
    phone: headers.findIndex((h) => matchHeader(h, PHONE_KEYS)),
    status: headers.findIndex((h) => matchHeader(h, STATUS_KEYS)),
  };

  const rows: SheetRow[] = [];

  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    if (cells.every((c) => c === "")) continue;

    const raw: Record<string, string> = {};
    headers.forEach((h, i) => {
      if (h) raw[h] = cells[i] ?? "";
    });

    rows.push({
      name: detected.name >= 0 ? cells[detected.name] || null : null,
      phone: detected.phone >= 0 ? cells[detected.phone] || null : null,
      status: detected.status >= 0 ? cells[detected.status] || null : null,
      raw,
    });
  }

  return { rows, headers, detected };
}
