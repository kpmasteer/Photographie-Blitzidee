import type { Invoice, Payment } from "../types";
import { addDays } from "./date";
import { openAmount } from "./money";

export type ReminderDelay = "tomorrow" | "week" | "month";

export const initialReminderDate = (invoice: Invoice) => addDays(invoice.invoiceDate, 14);

export const nextReminderDate = (today: string, delay: ReminderDelay) => {
  if (delay === "tomorrow") return addDays(today, 1);
  if (delay === "week") return addDays(today, 7);
  const date = new Date(`${today}T12:00:00`);
  const originalDay = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + 1);
  const lastDayOfTargetMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(originalDay, lastDayOfTargetMonth));
  return date.toISOString().slice(0, 10);
};

export const reminderIsDue = (invoice: Invoice, payments: Payment[], today: string) => {
  if (["draft", "paid", "cancelled"].includes(invoice.status)) return false;
  if (invoice.paymentReminderCompletedAt || openAmount(invoice.totalCents, payments) <= 0) return false;
  return (invoice.paymentReminderAt || initialReminderDate(invoice)) <= today;
};

export const duePaymentReminders = (invoices: Invoice[], payments: Payment[], today: string) =>
  invoices
    .filter((invoice) => reminderIsDue(invoice, payments.filter((payment) => payment.invoiceId === invoice.id), today))
    .sort((a, b) => (a.paymentReminderAt || initialReminderDate(a)).localeCompare(b.paymentReminderAt || initialReminderDate(b)));
