import Dexie, { type EntityTable } from "dexie";
import type { AppSetting, Attachment, AuditLog, Company, Customer, Expense, ImportLog, Invoice, Payment, RecurringExpense, ServiceTemplate } from "./types";

export const APP_VERSION = "0.4.8";
export const DB_SCHEMA_VERSION = 4;

class BlitzideeDatabase extends Dexie {
  company!: EntityTable<Company, "id">;
  customers!: EntityTable<Customer, "id">;
  invoices!: EntityTable<Invoice, "id">;
  payments!: EntityTable<Payment, "id">;
  expenses!: EntityTable<Expense, "id">;
  attachments!: EntityTable<Attachment, "id">;
  auditLogs!: EntityTable<AuditLog, "id">;
  importLogs!: EntityTable<ImportLog, "id">;
  settings!: EntityTable<AppSetting, "key">;
  serviceTemplates!: EntityTable<ServiceTemplate, "id">;
  recurringExpenses!: EntityTable<RecurringExpense, "id">;

  constructor() {
    super("photographie-blitzidee-rechnungen");
    this.version(1).stores({
      company: "id",
      customers: "id, customerNumber, lastName, company, archived, importFingerprint",
      invoices: "id, &invoiceNumber, year, customerId, status, invoiceDate, importFingerprint",
      payments: "id, invoiceId, paidAt",
      expenses: "id, paidAt, category, supplier, cancelled",
      attachments: "id, [ownerType+ownerId], ownerId",
      auditLogs: "id, timestamp, recordType, recordId",
      importLogs: "id, &sourceFingerprint, createdAt",
      settings: "key"
    });
    this.version(2).stores({
      company: "id",
      customers: "id, customerNumber, lastName, company, archived, importFingerprint, updatedAt",
      invoices: "id, &invoiceNumber, year, customerId, status, invoiceDate, importFingerprint, updatedAt",
      payments: "id, invoiceId, paidAt",
      expenses: "id, paidAt, category, supplier, cancelled, updatedAt",
      attachments: "id, [ownerType+ownerId], ownerId",
      auditLogs: "id, timestamp, recordType, recordId",
      importLogs: "id, &sourceFingerprint, createdAt",
      settings: "key"
    });
    this.version(3).stores({
      company: "id",
      customers: "id, customerNumber, lastName, company, archived, importFingerprint, updatedAt",
      invoices: "id, &invoiceNumber, year, customerId, status, invoiceDate, importFingerprint, updatedAt",
      payments: "id, invoiceId, paidAt",
      expenses: "id, paidAt, category, supplier, cancelled, updatedAt, importFingerprint",
      attachments: "id, [ownerType+ownerId], ownerId",
      auditLogs: "id, timestamp, recordType, recordId",
      importLogs: "id, &sourceFingerprint, createdAt",
      settings: "key",
      serviceTemplates: "id, sortOrder, archived, sourceFingerprint, updatedAt"
    });
    this.version(4).stores({
      company: "id",
      customers: "id, customerNumber, lastName, company, archived, importFingerprint, updatedAt",
      invoices: "id, &invoiceNumber, year, customerId, status, invoiceDate, importFingerprint, updatedAt",
      payments: "id, invoiceId, paidAt",
      expenses: "id, paidAt, category, supplier, cancelled, updatedAt, importFingerprint, costType, recurringExpenseId, &periodKey",
      attachments: "id, [ownerType+ownerId], ownerId",
      auditLogs: "id, timestamp, recordType, recordId",
      importLogs: "id, &sourceFingerprint, createdAt",
      settings: "key",
      serviceTemplates: "id, sortOrder, archived, sourceFingerprint, updatedAt",
      recurringExpenses: "id, status, nextDueDate, supplier, category, updatedAt"
    });
  }
}

export const db = new BlitzideeDatabase();

export const newId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

export async function audit(action: string, recordType: string, recordId: string, before?: unknown, after?: unknown, source = "app") {
  await db.auditLogs.add({
    id: newId("audit"), timestamp: new Date().toISOString(), action, recordType, recordId,
    before, after, source, appVersion: APP_VERSION
  });
}
