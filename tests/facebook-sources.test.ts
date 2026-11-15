import assert from "node:assert/strict";
import io from "node:fs";
import {
  facebookSources,
  pageTokens,
  verifyTokenMatches,
  withEachToken,
} from "../lib/facebook-sources";

/**
 * ============================================================
 *  שני חשבונות פייסבוק נפרדים לגמרי
 * ============================================================
 *
 *  **מה שזה מאפשר:** לפתוח חשבון פייסבוק חדש לקמפיינים
 *  חדשים, **בלי** לשייך אותו לאדמין, לתיק העסקי או
 *  לאפליקציה של החשבון הקודם - ועדיין שהלידים ייכנסו
 *  לאותה מערכת.
 *
 *  עד כה המערכת הכירה אפליקציה אחת, ולכן הדרך היחידה
 *  לחבר פייסבוק נוסף הייתה להשתמש באותה אפליקציה - בדיוק
 *  החוט המקשר שלא רוצים.
 */

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (err) {
    console.error(`✗ ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const before: Record<string, string | undefined> = {};

  for (const [key, value] of Object.entries(vars)) {
    before[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  try {
    fn();
  } finally {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const CLEAN = {
  FB_APP_SECRET: undefined,
  FB_PAGE_TOKEN: undefined,
  FB_VERIFY_TOKEN: undefined,
  FB_APP_SECRET_2: undefined,
  FB_PAGE_TOKEN_2: undefined,
  FB_VERIFY_TOKEN_2: undefined,
};

test("חשבון אחד מוגדר כרגיל", () => {
  withEnv(
    { ...CLEAN, FB_APP_SECRET: "s1", FB_PAGE_TOKEN: "t1", FB_VERIFY_TOKEN: "v1" },
    () => {
      const sources = facebookSources();
      assert.equal(sources.length, 1);
      assert.equal(sources[0].pageToken, "t1");
      assert.deepEqual(pageTokens(), ["t1"]);
    }
  );
});

test("חשבון שני נקרא מהסיומת _2", () => {
  withEnv(
    {
      ...CLEAN,
      FB_APP_SECRET: "s1",
      FB_PAGE_TOKEN: "t1",
      FB_APP_SECRET_2: "s2",
      FB_PAGE_TOKEN_2: "t2",
    },
    () => {
      assert.equal(facebookSources().length, 2);
      assert.deepEqual(pageTokens(), ["t1", "t2"]);
    }
  );
});

test("בלי הגדרות - אין מקורות, ולא קורסים", () => {
  withEnv(CLEAN, () => {
    assert.deepEqual(facebookSources(), []);
    assert.deepEqual(pageTokens(), []);
  });
});

test("מחרוזת האימות של כל חשבון מתקבלת", () => {
  /**
   * כל אפליקציה מגדירה מחרוזת משלה. בלי זה אי אפשר היה
   * להגדיר את הוובוק באפליקציה השנייה בכלל.
   */
  withEnv(
    {
      ...CLEAN,
      FB_VERIFY_TOKEN: "v1",
      FB_PAGE_TOKEN: "t1",
      FB_VERIFY_TOKEN_2: "v2",
      FB_PAGE_TOKEN_2: "t2",
    },
    () => {
      assert.equal(verifyTokenMatches("v1"), true);
      assert.equal(verifyTokenMatches("v2"), true);
      assert.equal(verifyTokenMatches("משהו אחר"), false);
    }
  );
});

test("בלי מחרוזות מוגדרות לא חוסמים את ההגדרה הראשונית", () => {
  withEnv(CLEAN, () => {
    assert.equal(verifyTokenMatches("כל דבר"), true);
  });
});

test("מנסים כל טוקן עד שאחד מצליח", async () => {
  await withEnvAsync(
    { ...CLEAN, FB_PAGE_TOKEN: "t1", FB_PAGE_TOKEN_2: "t2" },
    async () => {
      const tried: string[] = [];

      const { result } = await withEachToken(async (token) => {
        tried.push(token);
        /** רק הטוקן השני מכיר את העמוד הזה */
        return token === "t2" ? { ok: true } : null;
      });

      assert.deepEqual(tried, ["t1", "t2"], "לא נוסו כל הטוקנים");
      assert.deepEqual(result, { ok: true });
    }
  );
});

test("הטוקן הראשון מצליח - השני לא נוסה", async () => {
  await withEnvAsync(
    { ...CLEAN, FB_PAGE_TOKEN: "t1", FB_PAGE_TOKEN_2: "t2" },
    async () => {
      const tried: string[] = [];

      await withEachToken(async (token) => {
        tried.push(token);
        return { ok: true };
      });

      assert.deepEqual(tried, ["t1"], "נוסו טוקנים מיותרים");
    }
  );
});

test("קריסה בטוקן אחד לא עוצרת את השני", async () => {
  await withEnvAsync(
    { ...CLEAN, FB_PAGE_TOKEN: "t1", FB_PAGE_TOKEN_2: "t2" },
    async () => {
      const { result, firstError } = await withEachToken(async (token) => {
        if (token === "t1") throw new Error("טוקן פג תוקף");
        return { ok: true };
      });

      assert.deepEqual(result, { ok: true }, "קריסה באחד הפילה את הכל");
      assert.ok(firstError.includes("פג תוקף"), "השגיאה אבדה");
    }
  );
});

async function withEnvAsync(
  vars: Record<string, string | undefined>,
  fn: () => Promise<void>
) {
  const before: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(vars)) {
    before[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    await fn();
    passed++;
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

/* ---------- החיווט ---------- */

const hook = io.readFileSync("app/api/webhooks/facebook/route.ts", "utf8");

test("החתימה נבדקת מול כל הסודות", () => {
  /**
   * כל אפליקציה חותמת בסוד שלה. בדיקה מול סוד אחד הייתה
   * דוחה את כל הלידים מהחשבון החדש כ"חתימה שגויה".
   */
  assert.ok(hook.includes("facebookSources()"), "לא נקראים המקורות");
  assert.ok(
    !hook.includes("process.env.FB_APP_SECRET?.trim()"),
    "עדיין נבדק סוד אחד בלבד"
  );
  assert.ok(hook.includes("for (const secret of secrets)"), "אין לולאה");
});

test("שליפת הליד מנסה כל טוקן", () => {
  assert.ok(hook.includes("withEachToken("), "נשלף עם טוקן אחד בלבד");
  assert.ok(
    !hook.includes('const token = process.env.FB_PAGE_TOKEN?.trim();'),
    "נשאר שימוש בטוקן יחיד"
  );
});

test("השוואה מול פייסבוק מכסה גם את החשבון החדש", () => {
  /**
   * בלי זה רשת הביטחון - "מי קיים בפייסבוק ולא אצלנו" -
   * פשוט לא מכסה את החשבון החדש, ולידים חסרים שם לא היו
   * מתגלים לעולם.
   */
  const gap = io.readFileSync("lib/facebook-gap.ts", "utf8");

  assert.ok(gap.includes("const tokens = pageTokens()"), "טוקן אחד בלבד");
  assert.ok(gap.includes("for (const token of tokens)"), "לא מנסים את כולם");
});

test("הודעת השגיאה אומרת מה להוסיף לחשבון חדש", () => {
  assert.ok(
    hook.includes("FB_PAGE_TOKEN_2"),
    "מי שיוסיף חשבון לא יידע מה חסר לו"
  );
  assert.ok(hook.includes("FB_APP_SECRET_2"));
});

console.log(`✓ facebook-sources: ${passed} בדיקות עברו`);
