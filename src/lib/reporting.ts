import type { Expense, Invoice, Payment } from "../types";

export const annualFigures = (year: number, invoices: Invoice[], payments: Payment[], expenses: Expense[]) => {
  const incomeCents = payments.filter((payment) => payment.paidAt.startsWith(String(year))).reduce((sum, payment) => sum + payment.amountCents, 0);
  const expenseCents = expenses.filter((expense) => !expense.cancelled && expense.paidAt.startsWith(String(year))).reduce((sum, expense) => sum + expense.deductibleCents, 0);
  const openCents = invoices.filter((invoice) => invoice.year === year && !["draft", "paid", "cancelled"].includes(invoice.status)).reduce((sum, invoice) => sum + invoice.totalCents, 0);
  return { incomeCents, expenseCents, profitCents: incomeCents - expenseCents, openCents };
};
