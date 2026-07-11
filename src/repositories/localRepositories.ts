import { db } from "../db";
import type { RepositoryBundle } from "./interfaces";

export const localRepositories: RepositoryBundle = {
  customers: { list: () => db.customers.toArray(), get: (id) => db.customers.get(id), save: async (value) => { await db.customers.put(value); } },
  invoices: { list: () => db.invoices.toArray(), get: (id) => db.invoices.get(id), save: async (value) => { await db.invoices.put(value); }, deleteDraft: async (id) => { const invoice = await db.invoices.get(id); if (!invoice || invoice.status !== "draft") throw new Error("Nur Entwürfe dürfen gelöscht werden."); await db.invoices.delete(id); } },
  expenses: { list: () => db.expenses.toArray(), save: async (value) => { await db.expenses.put(value); } },
  payments: { listForInvoice: (invoiceId) => db.payments.where("invoiceId").equals(invoiceId).toArray(), save: async (value) => { await db.payments.put(value); } },
  settings: { get: (key) => db.settings.get(key), save: async (value) => { await db.settings.put(value); } }
};
