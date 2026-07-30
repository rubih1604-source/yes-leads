import Link from "next/link";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function MorePage() {
  const [alerts, rules, templates, knowledge] = await Promise.all([
    db.alert.count().catch(() => 0),
    db.rule.count({ where: { active: true } }).catch(() => 0),
    db.template.count().catch(() => 0),
    db.knowledgeItem.count({ where: { active: true } }).catch(() => 0),
  ]);

  const groups = [
    {
      title: "העוזר האוטומטי",
      items: [
        {
          href: "/rules",
          glyph: "⚙",
          label: "חוקים",
          desc: `מה קורה בכל סטטוס · ${rules} פעילים`,
        },
        {
          href: "/knowledge",
          glyph: "◈",
          label: "מאגר הידע",
          desc: `תשובות השירות שהעוזר שולח · ${knowledge} נושאים`,
        },
        {
          href: "/templates",
          glyph: "◫",
          label: "תבניות",
          desc: `התבניות המאושרות מטקסטר · ${templates}`,
        },
        {
          href: "/settings",
          glyph: "☰",
          label: "הגדרות",
          desc: "מתי העוזר מדבר ומה הוא אומר",
        },
      ],
    },
    {
      title: "מעקב",
      items: [
        {
          href: "/alerts",
          glyph: "△",
          label: "התראות",
          desc: `כל מה שקרה בלי שהיית מולו · ${alerts}`,
        },
        {
          href: "/jobs",
          glyph: "⧗",
          label: "מה המנוע עשה",
          desc: "כל שליחה מתוזמנת - מה רץ, מה בוטל ולמה",
        },
        {
          href: "/incoming",
          glyph: "↓",
          label: "יומן קליטה",
          desc: "מה בדיוק הגיע מליד מנגר ומטקסטר",
        },
      ],
    },
  ];

  return (
    <div className="app">
      <div className="topbar">
        <h1>עוד</h1>
      </div>

      <div className="hub">
        {groups.map((group) => (
          <div key={group.title}>
            <div className="hub-group-title">{group.title}</div>
            <div style={{ display: "grid", gap: 8 }}>
              {group.items.map((item) => (
                <Link key={item.href} href={item.href} className="hub-item">
                  <span className="glyph" aria-hidden="true">
                    {item.glyph}
                  </span>
                  <span>
                    <span className="label">{item.label}</span>
                    <span className="desc" style={{ display: "block" }}>
                      {item.desc}
                    </span>
                  </span>
                  <span className="chev" aria-hidden="true">
                    ‹
                  </span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
