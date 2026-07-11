import { db } from "../db";

export interface LocalMigrationCounts {
  company: number;
  customers: number;
  invoices: number;
  invoiceItems: number;
  payments: number;
  expenses: number;
  templates: number;
  recurringExpenses: number;
  attachments: number;
  auditLogs: number;
  importLogs: number;
}

export interface LocalMigrationAnalysisInput {
  counts: LocalMigrationCounts;
  companyConfirmed: boolean;
  attachmentBytes: number;
  draftInvoices: number;
  importedRecords: number;
  orphanedInvoices: number;
  orphanedPayments: number;
  latestLocalChangeAt?: string;
}

export interface LocalMigrationPreview extends LocalMigrationAnalysisInput {
  id: string;
  analyzedAt: string;
  totalRecords: number;
  warnings: string[];
  blockers: string[];
  canMigrate: boolean;
  freshDevice: boolean;
}

export function buildLocalMigrationPreview(input: LocalMigrationAnalysisInput, analyzedAt = new Date().toISOString()): LocalMigrationPreview {
  const totalRecords = Object.values(input.counts).reduce((sum, value) => sum + value, 0);
  const localBusinessRecords = input.counts.customers + input.counts.invoices + input.counts.payments + input.counts.expenses
    + input.counts.templates + input.counts.recurringExpenses + input.counts.attachments + input.counts.importLogs
    + (input.companyConfirmed ? input.counts.company : 0);
  const freshDevice = localBusinessRecords === 0;
  const warnings: string[] = [];
  const blockers: string[] = [];

  if (input.draftInvoices > 0) warnings.push(`${input.draftInvoices} Rechnungsentwurf${input.draftInvoices === 1 ? " wird" : "e werden"} als Entwurf übernommen.`);
  if (input.importedRecords > 0) warnings.push(`${input.importedRecords} importierte Datensätze behalten ihre Importkennungen, damit keine Duplikate entstehen.`);
  if (input.attachmentBytes > 25 * 1024 * 1024) warnings.push("Die Anhänge sind größer als 25 MB. Die erste Übertragung kann auf mobilen Geräten länger dauern.");
  if (input.orphanedInvoices > 0) blockers.push(`${input.orphanedInvoices} Rechnung${input.orphanedInvoices === 1 ? " verweist" : "en verweisen"} auf keinen vorhandenen Kunden.`);
  if (input.orphanedPayments > 0) blockers.push(`${input.orphanedPayments} Zahlung${input.orphanedPayments === 1 ? " verweist" : "en verweisen"} auf keine vorhandene Rechnung.`);
  if (!freshDevice && input.counts.company === 0) blockers.push("Das Unternehmensprofil fehlt.");
  if (freshDevice) warnings.push("Auf diesem Gerät wurden keine lokalen Daten gefunden. Es ist keine Übernahme nötig.");

  const signature = [
    input.latestLocalChangeAt || "none",
    ...Object.values(input.counts),
    input.companyConfirmed ? "confirmed" : "unconfirmed",
    input.attachmentBytes,
    input.orphanedInvoices,
    input.orphanedPayments
  ].join("-");

  return {
    ...input,
    id: `local-${signature}`,
    analyzedAt,
    totalRecords,
    warnings,
    blockers,
    canMigrate: !freshDevice && blockers.length === 0,
    freshDevice
  };
}

export async function analyzeLocalDataForMigration(): Promise<LocalMigrationPreview> {
  const [company, customers, invoices, payments, expenses, templates, recurringExpenses, attachments, auditLogs, importLogs] = await Promise.all([
    db.company.toArray(),
    db.customers.toArray(),
    db.invoices.toArray(),
    db.payments.toArray(),
    db.expenses.toArray(),
    db.serviceTemplates.toArray(),
    db.recurringExpenses.toArray(),
    db.attachments.toArray(),
    db.auditLogs.toArray(),
    db.importLogs.toArray()
  ]);

  const customerIds = new Set(customers.map((customer) => customer.id));
  const invoiceIds = new Set(invoices.map((invoice) => invoice.id));
  const latestLocalChangeAt = [
    ...company.map((item) => item.updatedAt),
    ...customers.map((item) => item.updatedAt),
    ...invoices.map((item) => item.updatedAt),
    ...expenses.map((item) => item.updatedAt),
    ...templates.map((item) => item.updatedAt),
    ...recurringExpenses.map((item) => item.updatedAt)
  ].filter(Boolean).sort().at(-1);

  return buildLocalMigrationPreview({
    counts: {
      company: company.length,
      customers: customers.length,
      invoices: invoices.length,
      invoiceItems: invoices.reduce((sum, invoice) => sum + invoice.items.length, 0),
      payments: payments.length,
      expenses: expenses.length,
      templates: templates.length,
      recurringExpenses: recurringExpenses.length,
      attachments: attachments.length,
      auditLogs: auditLogs.length,
      importLogs: importLogs.length
    },
    companyConfirmed: company.some((item) => Boolean(item.confirmedAt)),
    attachmentBytes: attachments.reduce((sum, attachment) => sum + attachment.size, 0),
    draftInvoices: invoices.filter((invoice) => invoice.status === "draft").length,
    importedRecords: invoices.filter((invoice) => invoice.imported).length + expenses.filter((expense) => expense.imported).length,
    orphanedInvoices: invoices.filter((invoice) => !customerIds.has(invoice.customerId)).length,
    orphanedPayments: payments.filter((payment) => !invoiceIds.has(payment.invoiceId)).length,
    latestLocalChangeAt
  });
}
