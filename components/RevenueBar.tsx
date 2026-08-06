import type { RevenueSummary } from "@/lib/revenue";

/**
 * ציר ההכנסות. יושב בראש מסך הלידים ובראש הביצועים,
 * כדי שכל שינוי סטטוס יורגש מיד.
 */
export default function RevenueBar({ data }: { data: RevenueSummary }) {
  const money = (n: number) => `₪${n.toLocaleString("he-IL")}`;

  if (data.target === 0 && data.earned === 0) return null;

  return (
    <div className="revenue">
      <div className="revenue-head">
        <div>
          <span className="revenue-num">{money(data.earned)}</span>
          {data.target > 0 && (
            <span className="revenue-target"> מתוך {money(data.target)}</span>
          )}
        </div>
        <span className="revenue-meta">
          {data.deals} עסקאות · {data.periodLabel}
        </span>
      </div>

      {data.target > 0 && (
        <>
          <div className="revenue-track">
            <div
              className="revenue-fill"
              style={{ width: `${data.progress}%` }}
            />
          </div>
          <div className="revenue-meta" style={{ marginTop: 5 }}>
            {data.progress >= 100
              ? "היעד הושג 🎯"
              : `${data.progress}% מהיעד · נשארו ${money(
                  data.target - data.earned
                )}`}
          </div>
        </>
      )}
    </div>
  );
}
