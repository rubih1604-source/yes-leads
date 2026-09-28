import { db } from "@/lib/db";
import LeadList, { type LeadRow } from "@/components/LeadList";
import AutoRefresh from "@/components/AutoRefresh";
import { getStatuses } from "@/lib/status-store";
import { getSubStatusMap } from "@/lib/substatus";
import { getRevenue } from "@/lib/revenue";
import { getSettings } from "@/lib/settings";
import { isExistingCustomer } from "@/lib/existing-customer";
import RevenueBar from "@/components/RevenueBar";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [statuses, subStatuses, revenue, templates, settings] = await Promise.all([
    getStatuses(),
    getSubStatusMap(),
    getRevenue("month"),
    db.template.findMany({
      where: { approved: true },
      orderBy: { name: "asc" },
      select: { name: true, displayName: true },
    }),
    getSettings(),
  ]);

  const leads = await db.lead.findMany({
    // סדר קבוע: הליד האחרון שנכנס תמיד למעלה.
    // ההתכתבויות יושבות במסך נפרד ולא משנות את הסדר כאן.
    // רק לידים אמיתיים. מי שכתב בוואטסאפ בלי להיות ליד
    // יושב במסך השיחות בלבד.
    /**
     * ============================================================
     *  כאן מופיע **רק הערוץ שלך**
     * ============================================================
     *
     *  ערוץ המכירה הוא מערכת לידים נפרדת שחיה לצד שלך,
     *  והוא יושב במסך "מכירת לידים" בלבד. הנתונים שלו לא
     *  מתערבבים כאן.
     *
     *  ליד מופיע ברשימה הזו אם יש לו לפחות **כניסה אחת
     *  בערוץ שלך**. אדם שנכנס גם אצלך וגם אצל אלעד מופיע
     *  בשני המקומות - ליד רגיל בכל אחד מהם, בלי שום תלות
     *  ביניהם.
     *
     *  התנאי השני הוא לידים ותיקים שנוצרו לפני שהתחלנו
     *  לרשום כניסות בנפרד. אין להם אף כניסה, ולכן הם
     *  נמדדים לפי הבעלות הישנה - כדי ששום ליד לא ייעלם.
     */
    where: {
      OR: [
        { entries: { some: { isSale: false } } },
        {
          AND: [
            { entries: { none: {} } },
            { origin: { in: ["leadmanager", "sale"] } },
          ],
        },
      ],
    },
    /**
     * הליד האחרון שנכנס תמיד בראש.
     * createdAt כגיבוי, כדי שליד עם תאריך כניסה חריג
     * מקובץ לא ייעלם בתחתית הרשימה.
     */
    orderBy: [{ intakeAt: "desc" }, { createdAt: "desc" }],
    /**
     * החיפוש ברשימה עובד על מה שנטען.
     *
     * ב-500 בלבד, ליד מלפני כמה חודשים פשוט לא היה בזיכרון
     * ולכן חיפוש לפי טלפון לא מצא אותו - ונראה כאילו הוא
     * לא קיים במערכת בכלל.
     */
    take: 3000,
    select: {
      id: true,
      phone: true,
      firstName: true,
      lastName: true,
      status: true,
      origin: true,
      source: true,
      subStatus: true,
      duplicateOf: true,
      intakeAt: true,
      extra: true,

      /**
       * נספרות רק הכניסות של הערוץ שלך.
       *
       * זו התווית "כפול·N", וזו בדיוק הסיבה שהיא הופיעה
       * בטעות: היא ספרה גם את הכניסה של אלעד. רינת נכנסה
       * פעם אחת אצלך ופעם אחת אצלו - שתי מערכות שונות,
       * לא כפילות.
       */
      _count: { select: { entries: { where: { isSale: false } } } },

      /**
       * הכניסה האחרונה שלך, לקביעת מקום הליד ברשימה.
       * כניסה אצל אלעד לא מקפיצה ליד לראש הרשימה שלך.
       */
      entries: {
        where: { isSale: false },
        orderBy: { at: "desc" },
        take: 1,
        select: { at: true },
      },
    },
  });

  const rows: LeadRow[] = leads.map((l) => {
    const extra =
      l.extra && typeof l.extra === "object" && !Array.isArray(l.extra)
        ? (l.extra as Record<string, string>)
        : {};

    /**
     * התאריך שמוצג ושלפיו הרשימה מסודרת הוא תאריך הכניסה
     * **שלך**. אם אין כניסה רשומה (ליד ותיק) - התאריך
     * הכללי של הליד.
     */
    const mineAt = l.entries[0]?.at ?? l.intakeAt;

    return {
      id: l.id,
      phone: l.phone,
      firstName: l.firstName,
      lastName: l.lastName,
      status: l.status,
      subStatus: l.subStatus,
      duplicateOf: l.duplicateOf,
      entryCount: l._count.entries,
      intakeAt: mineAt.toISOString(),
      campaign: extra.fb_campaign || extra.campaign || null,
      supplier: extra.supplier_question || null,
      existingCustomer: isExistingCustomer(l.extra, l.status),

      /**
       * אין תווית "מכירה" ברשימה שלך.
       *
       * הרשימה הזו מציגה את הערוץ שלך בלבד, ולכן כל מה
       * שמופיע בה הוא ליד שלך - אין מה לתייג. לידי המכירה
       * נמצאים במסך שלהם.
       */
      isSale: false,
      source: l.source,
      package: extra.package || null,
      price: extra.price || null,
      email: extra.email || null,
      address: extra.address || null,
    };
  });

  /**
   * סידור סופי לפי **תאריך הכניסה שלך**.
   *
   * המסד מסדר לפי intakeAt הכללי, ובלידים ותיקים התאריך
   * הזה הוקפץ בעבר בגלל כניסה של אלעד. מיון כאן מבטיח
   * שסדר הרשימה שלך נקבע רק לפי מה שקרה אצלך.
   * ISO נשמר כמחרוזת, ולכן השוואת מחרוזות היא גם השוואת זמן.
   */
  rows.sort((a, b) => (a.intakeAt < b.intakeAt ? 1 : a.intakeAt > b.intakeAt ? -1 : 0));

  return (
    <div className="app">
      <AutoRefresh seconds={15} />
      <RevenueBar data={revenue} />
      <LeadList
        leads={rows}
        statuses={statuses}
        subStatuses={subStatuses}
        templates={templates}
        rowFields={settings.leadRowFields}
      />
    </div>
  );
}
