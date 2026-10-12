/**
 * בדיקות לניתוח "נסגר אצל משווק אחר".
 * הרצה:  npx tsx tests/competition.test.ts
 */

import { bucketLossHours, halfLostWithin } from "../lib/competition";

let passed = 0;
let failed = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`      ציפינו: ${JSON.stringify(expected)}`);
    console.log(`      קיבלנו: ${JSON.stringify(actual)}`);
  }
}

const counts = (hours: number[]) => bucketLossHours(hours).map((b) => b.count);
const pcts = (hours: number[]) => bucketLossHours(hours).map((b) => b.percent);

console.log("\nחלון ההפסד — לאיזה דלי כל ליד נופל");
{
  // דליים: עד שעה | 1-4 | 4-24 | 1-3 ימים | 3-7 ימים | יותר משבוע
  check("ליד שאבד אחרי חצי שעה", counts([0.5]), [1, 0, 0, 0, 0, 0]);
  check("בדיוק שעה -> הדלי הראשון", counts([1]), [1, 0, 0, 0, 0, 0]);
  check("שעה ורבע -> הדלי השני", counts([1.25]), [0, 1, 0, 0, 0, 0]);
  check("בדיוק 4 שעות -> השני", counts([4]), [0, 1, 0, 0, 0, 0]);
  check("5 שעות -> השלישי", counts([5]), [0, 0, 1, 0, 0, 0]);
  check("בדיוק יממה -> השלישי", counts([24]), [0, 0, 1, 0, 0, 0]);
  check("יומיים -> הרביעי", counts([48]), [0, 0, 0, 1, 0, 0]);
  check("חמישה ימים -> החמישי", counts([120]), [0, 0, 0, 0, 1, 0]);
  check("שבועיים -> האחרון", counts([336]), [0, 0, 0, 0, 0, 1]);
  check("אפס שעות (אבד מיד)", counts([0]), [1, 0, 0, 0, 0, 0]);
}

console.log("\nהאחוזים");
{
  const mixed = [0.5, 2, 3, 10, 50, 200];
  check("סכום האחוזים 100", pcts(mixed).reduce((a, b) => a + b, 0), 100);
  check("אין הפסדים -> הכל אפס", pcts([]), [0, 0, 0, 0, 0, 0]);
  check("אין הפסדים -> אין ספירות", counts([]), [0, 0, 0, 0, 0, 0]);

  // ארבעה מתוך שמונה תוך 4 שעות = 50%
  const half = [0.5, 1, 2, 3, 30, 40, 100, 200];
  check("חצי מההפסדים בארבע השעות הראשונות", pcts(half)[0] + pcts(half)[1], 50);
}

console.log("\nתוך כמה זמן אובדת מחצית מההפסדים");
{
  check("חציון פשוט", halfLostWithin([1, 2, 3]), 2);
  check("רוב ההפסדים ביום הראשון", halfLostWithin([1, 2, 3, 100, 200]), 3);
  check("בלי נתונים", halfLostWithin([]), null);
  check("ליד אחד", halfLostWithin([7]), 7);
  check("מעגל למספר שלם", halfLostWithin([2.4, 2.6, 2.6]), 3);
}

console.log("\nתרחיש אמיתי — מה שרובי מתאר");
{
  /**
   * "דיברתי איתו, שלחתי פולו-אפ למחרת, והוא כבר סגר"
   * כלומר רוב ההפסדים קורים בין 4 ל-24 שעות מהכניסה.
   */
  const realistic = [
    0.5, 2, 3, 5, 6, 8, 10, 12, 14, 18, 20, 22, 30, 40, 50, 100, 200,
  ];
  const b = bucketLossHours(realistic);
  const within24 = b[0].percent + b[1].percent + b[2].percent;

  check("רוב ההפסדים ביממה הראשונה", within24 >= 70, true);
  check(
    "החציון נופל ביממה הראשונה",
    (halfLostWithin(realistic) ?? 999) <= 24,
    true
  );
}

console.log(`\n${passed} בדיקות עברו, ${failed} נכשלו\n`);
if (failed > 0) process.exit(1);
