/**
 * ============================================================
 *  הוצאות העסק
 * ============================================================
 *
 *  המטרה היא לא לנהל הנהלת חשבונות - היא לתת לך תמונה
 *  אחת: כמה נכנס, כמה יצא, ומה נשאר.
 *
 *  ההכנסה מגיעה משני מקורות: עמלות על סגירות, ומכירת לידים.
 */

import { db } from "./db";
import { getStatuses } from "./status-store";
import { getSubStatuses } from "./substatus";
import type { Range } from "./periods";

export type ExpenseRow = {
  id: string;
  title: string;
  amount: number;
  at: string;
  recurring: boolean;
  note: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string;
};

export type CategoryTotal = {
  id: string;
  name: string;
  color: string;
  total: number;
  count: number;
  percent: number;
};

export type MoneyPicture = {
  commissions: number;
  leadSales: number;
  income: number;
  expenses: number;
  profit: number;
};

export type ExpensesData = {
  rows: ExpenseRow[];
  categories: CategoryTotal[];
  money: MoneyPicture;
  label: string;
};

export async function getExpenses(range: Range): Promise<ExpensesData> {
  const [categories, expenses, statuses, subs] = await Promise.all([
    db.expenseCategory.findMany({ orderBy: { position: "asc" } }),
    db.expense.findMany({
      where: { at: { gte: range.from, lt: range.to } },
      orderBy: { at: "desc" },
      include: { category: true },
    }),
    getStatuses(),
    getSubStatuses(),
  ]);

  const rows: ExpenseRow[] = expenses.map((e) => ({
    id: e.id,
    title: e.title,
    amount: Number(e.amount ?? 0),
    at: e.at.toISOString(),
    recurring: e.recurring,
    note: e.note,
    categoryId: e.categoryId,
    categoryName: e.category?.name ?? null,
    categoryColor: e.category?.color ?? "#64748b",
  }));

  const totalExpenses = rows.reduce((s, r) => s + r.amount, 0);

  const byCategory = new Map<string, { total: number; count: number }>();
  for (const row of rows) {
    const key = row.categoryId ?? "none";
    const cur = byCategory.get(key) ?? { total: 0, count: 0 };
    cur.total += row.amount;
    cur.count++;
    byCategory.set(key, cur);
  }

  const categoryTotals: CategoryTotal[] = categories
    .map((c) => {
      const row = byCategory.get(c.id) ?? { total: 0, count: 0 };
      return {
        id: c.id,
        name: c.name,
        color: c.color,
        total: Math.round(row.total),
        count: row.count,
        percent:
          totalExpenses > 0
            ? Math.round((row.total / totalExpenses) * 1000) / 10
            : 0,
      };
    })
    .sort((a, b) => b.total - a.total);

  // ---- הכנסה מעמלות ----
  const wonNames = statuses.filter((s) => s.won).map((s) => s.name);
  const commissionByStatus = new Map<string, number>(
    statuses.map((s) => [s.name, Number(s.commission ?? 0)])
  );
  const commissionBySub = new Map<string, number>(
    subs.map((s) => [s.name, Number(s.commission ?? 0)])
  );

  let commissions = 0;

  if (wonNames.length > 0) {
    const closings = await db.leadEvent.findMany({
      where: {
        type: "status_changed",
        toStatus: { in: wonNames },
        createdAt: { gte: range.from, lt: range.to },
      },
      select: { leadId: true },
    });

    const ids = Array.from(new Set(closings.map((c) => c.leadId)));
    const leads = ids.length
      ? await db.lead.findMany({
          where: { id: { in: ids } },
          select: { status: true, subStatus: true },
        })
      : [];

    for (const lead of leads) {
      if (!wonNames.includes(lead.status)) continue;
      const sub = lead.subStatus ? commissionBySub.get(lead.subStatus) ?? 0 : 0;
      commissions += sub > 0 ? sub : commissionByStatus.get(lead.status) ?? 0;
    }
  }

  // ---- הכנסה ממכירת לידים ----
  const saleEntries = await db.leadEntry.findMany({
    where: {
      isSale: true,
      billable: true,
      at: { gte: range.from, lt: range.to },
    },
    select: { price: true },
  });

  const leadSales = saleEntries.reduce((s, e) => s + Number(e.price ?? 0), 0);

  const income = Math.round(commissions + leadSales);
  const spent = Math.round(totalExpenses);

  return {
    rows,
    categories: categoryTotals,
    money: {
      commissions: Math.round(commissions),
      leadSales: Math.round(leadSales),
      income,
      expenses: spent,
      profit: income - spent,
    },
    label: range.label,
  };
}
