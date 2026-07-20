import { db, newId } from "../db";
import type { Expense, RecurringExpense } from "../types";

export const intervalMonths = (interval: RecurringExpense["interval"], custom = 1) => ({ monthly: 1, bimonthly: 2, quarterly: 3, semiannual: 6, yearly: 12, custom }[interval]);

export function addMonthsClamped(iso: string, months: number): string {
  const [year, month, day] = iso.split("-").map(Number); const target = new Date(Date.UTC(year!, month! - 1 + months, 1)); const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate(); target.setUTCDate(Math.min(day!, lastDay)); return target.toISOString().slice(0, 10);
}

export const periodKey = (id: string, dueDate: string) => `${id}:${dueDate}`;

export async function catchUpRecurringExpenses(today = new Date().toISOString().slice(0, 10)) {
  const recurring = await db.recurringExpenses.where("status").equals("active").toArray(); let created = 0;
  await db.transaction("rw", db.recurringExpenses, db.expenses, async () => {
    for (const rule of recurring) { const previousDue = rule.nextDueDate; let due = previousDue; const step = intervalMonths(rule.interval, rule.intervalMonths); while (due <= today && (!rule.endDate || due <= rule.endDate)) { const key = periodKey(rule.id, due); if (!(await db.expenses.where("periodKey").equals(key).first())) { const now = new Date().toISOString(); const expense: Expense = { id: newId("expense"), date: due, paidAt: due, supplier: rule.supplier, description: rule.name, category: rule.category, totalCents: rule.amountCents, businessSharePercent: rule.businessSharePercent, deductibleCents: Math.round(rule.amountCents * rule.businessSharePercent / 100), paymentMethod: rule.paymentMethod, note: rule.note, cancelled: false, createdAt: now, updatedAt: now, recurringExpenseId: rule.id, periodKey: key, automaticallyGenerated: true, confirmationStatus: rule.creationMode === "automatic" ? "confirmed" : "pending", costType: rule.costType || "standard" }; await db.expenses.add(expense); created++; } due = addMonthsClamped(due, step); } if (due !== previousDue) { const checkedAt = new Date().toISOString(); await db.recurringExpenses.update(rule.id, { nextDueDate: due, lastCheckedAt: checkedAt, updatedAt: checkedAt }); } }
  }); return created;
}
