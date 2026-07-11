import type { Attachment, Company, Customer, Expense, ImportLog, Invoice, InvoiceItem, Payment, RecurringExpense, ServiceTemplate } from "../../types";
import { stableRemoteId } from "./identity";
import type { RemoteRecordBundle, RemoteVersionedRow, SyncEntityType } from "./types";

export type SyncableRecord = Company | Customer | Invoice | Payment | Expense | RecurringExpense | ServiceTemplate | ImportLog | Attachment;

export const tableForEntity: Record<SyncEntityType, string> = {
  company: "company_settings",
  customer: "customers",
  invoice: "invoices",
  payment: "payments",
  expense: "expenses",
  recurringExpense: "recurring_expenses",
  serviceTemplate: "description_templates",
  importLog: "import_batches",
  attachment: "attachments"
};

function jsonValue<T>(value: T): T {
  if (typeof Blob !== "undefined" && value instanceof Blob) return undefined as T;
  if (Array.isArray(value)) return value.map(jsonValue).filter((item) => item !== undefined) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
      if (item === undefined || (typeof Blob !== "undefined" && item instanceof Blob)) return [];
      return [[key, jsonValue(item)]];
    })) as T;
  }
  return value;
}

function base(organizationId: string, id: string, localId: string): RemoteVersionedRow {
  return { id, organization_id: organizationId, local_id: localId, deleted_at: null };
}

async function mapInvoiceItem(organizationId: string, invoiceId: string, item: InvoiceItem): Promise<RemoteVersionedRow> {
  return {
    ...base(organizationId, await stableRemoteId(organizationId, "invoiceItem", item.id), item.id),
    invoice_id: invoiceId,
    description: item.description,
    details: item.details ?? null,
    quantity_milli: item.quantityMilli,
    unit: item.unit,
    unit_price_cents: item.unitPriceCents,
    discount_type: item.discountType ?? null,
    discount_value: item.discountValue ?? null,
    discount_cents: item.discountCents ?? 0,
    subtotal_cents: item.subtotalCents ?? Math.round(item.quantityMilli * item.unitPriceCents / 1_000),
    total_cents: item.totalCents,
    sort_order: item.sortOrder
  };
}

export async function toRemoteBundle(organizationId: string, entityType: SyncEntityType, record: SyncableRecord): Promise<RemoteRecordBundle> {
  const remoteId = entityType === "company" ? organizationId : await stableRemoteId(organizationId, entityType, record.id);
  if (entityType === "company") {
    const company = record as Company;
    return { table: tableForEntity.company, row: { organization_id: organizationId, data: jsonValue({ ...company, _sync: { localId: company.id } }) } };
  }
  if (entityType === "customer") {
    const customer = record as Customer;
    if (!customer.customerNumber) throw new Error("Kunde kann ohne Kundennummer nicht synchronisiert werden.");
    return { table: tableForEntity.customer, row: {
      ...base(organizationId, remoteId, customer.id), customer_number: customer.customerNumber,
      salutation: customer.salutation ?? null, first_name: customer.firstName, last_name: customer.lastName,
      company: customer.company ?? null, street: customer.street, postal_code: customer.postalCode,
      city: customer.city, country: customer.country, email: customer.email ?? null, phone: customer.phone ?? null,
      notes: customer.notes ?? null, archived: customer.archived, import_fingerprint: customer.importFingerprint ?? null,
      created_at: customer.createdAt, updated_at: customer.updatedAt
    } };
  }
  if (entityType === "invoice") {
    const invoice = record as Invoice;
    const customerId = invoice.customerId ? await stableRemoteId(organizationId, "customer", invoice.customerId) : null;
    const cancelledInvoiceId = invoice.cancelledInvoiceId ? await stableRemoteId(organizationId, "invoice", invoice.cancelledInvoiceId) : null;
    const correctionInvoiceId = invoice.correctionInvoiceId ? await stableRemoteId(organizationId, "invoice", invoice.correctionInvoiceId) : null;
    const childRows = await Promise.all(invoice.items.map((item) => mapInvoiceItem(organizationId, remoteId, item)));
    return { table: tableForEntity.invoice, row: {
      ...base(organizationId, remoteId, invoice.id), customer_id: customerId, draft_number: invoice.draftNumber,
      invoice_number: invoice.invoiceNumber ?? null, year: invoice.year, status: invoice.status,
      customer_snapshot: jsonValue(invoice.customerSnapshot ?? null), company_snapshot: jsonValue(invoice.companySnapshot ?? null),
      invoice_date: invoice.invoiceDate, service_date_from: invoice.serviceDateFrom,
      service_date_to: invoice.serviceDateTo ?? null, payment_term_days: invoice.paymentTermDays,
      due_date: invoice.dueDate, subtotal_cents: invoice.subtotalCents ?? invoice.totalCents,
      discount_type: invoice.discountType ?? null, discount_value: invoice.discountValue ?? null,
      discount_cents: invoice.discountCents ?? 0, total_cents: invoice.totalCents, paid_at: invoice.paidAt ?? null,
      payment_method: invoice.paymentMethod ?? null, intro_text: invoice.introText, outro_text: invoice.outroText,
      tax_exemption_note: invoice.taxExemptionNote, notes: invoice.notes ?? null,
      finalized_at: invoice.finalizedAt ?? null, sent_at: invoice.sentAt ?? null,
      payment_reminder_at: invoice.paymentReminderAt ?? null,
      payment_reminder_last_shown_at: invoice.paymentReminderLastShownAt ?? null,
      payment_reminder_completed_at: invoice.paymentReminderCompletedAt ?? null,
      cancelled_at: invoice.status === "cancelled" ? invoice.updatedAt : null,
      cancelled_invoice_id: cancelledInvoiceId, correction_invoice_id: correctionInvoiceId,
      content_hash: invoice.contentHash ?? null, imported: invoice.imported,
      import_source: invoice.importSource ?? null, import_fingerprint: invoice.importFingerprint ?? null,
      created_at: invoice.createdAt, updated_at: invoice.updatedAt
    }, childRows: [{ table: "invoice_items", rows: childRows }] };
  }
  if (entityType === "payment") {
    const payment = record as Payment;
    return { table: tableForEntity.payment, row: {
      ...base(organizationId, remoteId, payment.id),
      invoice_id: await stableRemoteId(organizationId, "invoice", payment.invoiceId),
      amount_cents: payment.amountCents, paid_at: payment.paidAt, method: payment.method,
      note: payment.note ?? null, import_fingerprint: payment.importFingerprint ?? null,
      data: jsonValue({ importId: payment.importId, importSource: payment.importSource, sourceFile: payment.sourceFile, sourceSheet: payment.sourceSheet, sourceRow: payment.sourceRow }),
      created_at: payment.createdAt, updated_at: payment.createdAt
    } };
  }
  if (entityType === "expense") {
    const expense = record as Expense;
    const data = jsonValue({ ...expense, id: undefined, _sync: { localId: expense.id } });
    return { table: tableForEntity.expense, row: {
      ...base(organizationId, remoteId, expense.id), data, paid_at: expense.paidAt,
      total_cents: expense.totalCents, deductible_cents: expense.deductibleCents,
      supplier: expense.supplier, category: expense.category, import_fingerprint: expense.importFingerprint ?? null,
      created_at: expense.createdAt, updated_at: expense.updatedAt
    } };
  }
  if (entityType === "recurringExpense") {
    const recurring = record as RecurringExpense;
    return { table: tableForEntity.recurringExpense, row: {
      ...base(organizationId, remoteId, recurring.id),
      data: jsonValue({ ...recurring, id: undefined, _sync: { localId: recurring.id } }),
      status: recurring.status, next_due_date: recurring.nextDueDate || null,
      created_at: recurring.createdAt, updated_at: recurring.updatedAt
    } };
  }
  if (entityType === "importLog") {
    const log = record as ImportLog;
    return { table: tableForEntity.importLog, row: {
      id: remoteId, organization_id: organizationId, local_id: log.id,
      source_name: log.sourceName, source_fingerprint: log.sourceFingerprint,
      status: "completed", progress: jsonValue({ ...log, id: undefined, _sync: { localId: log.id } }),
      created_at: log.createdAt, updated_at: log.createdAt
    } };
  }
  if (entityType === "attachment") {
    const attachment = record as Attachment;
    const ownerEntity = attachment.ownerType === "invoice" ? "invoice" : "expense";
    const bucket = attachment.ownerType === "invoice" ? "invoice-pdfs" : "receipts";
    const safeName = encodeURIComponent(attachment.name.replaceAll("/", "-"));
    return { table: tableForEntity.attachment, row: {
      ...base(organizationId, remoteId, attachment.id), owner_type: attachment.ownerType,
      owner_id: await stableRemoteId(organizationId, ownerEntity, attachment.ownerId), bucket,
      object_path: `${organizationId}/${remoteId}/${safeName}`, filename: attachment.name,
      content_type: attachment.mimeType || "application/octet-stream", size_bytes: attachment.size,
      created_at: attachment.createdAt
    } };
  }
  const template = record as ServiceTemplate;
  return { table: tableForEntity.serviceTemplate, row: {
    ...base(organizationId, remoteId, template.id), title: template.title, description: template.description,
    category: template.category ?? null, sort_order: template.sortOrder, archived: template.archived,
    usage_count: template.usageCount, source_fingerprint: template.sourceFingerprint ?? null,
    created_at: template.createdAt, updated_at: template.updatedAt
  } };
}

const text = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;
const optionalText = (value: unknown) => typeof value === "string" ? value : undefined;
const number = (value: unknown, fallback = 0) => typeof value === "number" ? value : Number(value ?? fallback);

export function customerFromRemote(row: RemoteVersionedRow): Customer {
  return {
    id: text(row.local_id, text(row.id)), customerNumber: text(row.customer_number), salutation: optionalText(row.salutation),
    firstName: text(row.first_name), lastName: text(row.last_name), company: optionalText(row.company),
    street: text(row.street), postalCode: text(row.postal_code), city: text(row.city), country: text(row.country, "Deutschland"),
    email: optionalText(row.email), phone: optionalText(row.phone), notes: optionalText(row.notes), archived: Boolean(row.archived),
    importFingerprint: optionalText(row.import_fingerprint), createdAt: text(row.created_at), updatedAt: text(row.updated_at)
  };
}

export function companyFromRemote(row: RemoteVersionedRow): Company {
  const data = row.data && typeof row.data === "object" ? row.data as Partial<Company> : {};
  return { ...data, id: "company", updatedAt: text(row.updated_at, data.updatedAt ?? new Date().toISOString()) } as Company;
}

export function invoiceItemFromRemote(row: RemoteVersionedRow): InvoiceItem {
  return {
    id: text(row.local_id, text(row.id)), description: text(row.description), details: optionalText(row.details),
    quantityMilli: number(row.quantity_milli), unit: text(row.unit), unitPriceCents: number(row.unit_price_cents),
    discountType: row.discount_type === "percent" || row.discount_type === "fixed" ? row.discount_type : undefined,
    discountValue: row.discount_value == null ? undefined : number(row.discount_value),
    discountCents: number(row.discount_cents), subtotalCents: number(row.subtotal_cents),
    totalCents: number(row.total_cents), sortOrder: number(row.sort_order)
  };
}

export function invoiceFromRemote(row: RemoteVersionedRow, items: RemoteVersionedRow[]): Invoice {
  return {
    id: text(row.local_id, text(row.id)), draftNumber: text(row.draft_number), invoiceNumber: optionalText(row.invoice_number),
    year: number(row.year), customerId: text(row.customer_local_id, text(row.customer_id)),
    customerSnapshot: row.customer_snapshot as Invoice["customerSnapshot"], companySnapshot: row.company_snapshot as Invoice["companySnapshot"],
    invoiceDate: text(row.invoice_date), serviceDateFrom: text(row.service_date_from), serviceDateTo: optionalText(row.service_date_to),
    items: items.map(invoiceItemFromRemote).sort((a, b) => a.sortOrder - b.sortOrder), totalCents: number(row.total_cents),
    paymentTermDays: number(row.payment_term_days, 14), dueDate: text(row.due_date), status: row.status as Invoice["status"],
    paidAt: optionalText(row.paid_at), paymentMethod: optionalText(row.payment_method), notes: optionalText(row.notes),
    introText: text(row.intro_text), outroText: text(row.outro_text), taxExemptionNote: text(row.tax_exemption_note),
    createdAt: text(row.created_at), updatedAt: text(row.updated_at), finalizedAt: optionalText(row.finalized_at), sentAt: optionalText(row.sent_at),
    imported: Boolean(row.imported), importSource: optionalText(row.import_source), importFingerprint: optionalText(row.import_fingerprint),
    cancelledInvoiceId: optionalText(row.cancelled_invoice_local_id) ?? optionalText(row.cancelled_invoice_id),
    correctionInvoiceId: optionalText(row.correction_invoice_local_id) ?? optionalText(row.correction_invoice_id), contentHash: optionalText(row.content_hash),
    paymentReminderAt: optionalText(row.payment_reminder_at), paymentReminderLastShownAt: optionalText(row.payment_reminder_last_shown_at),
    paymentReminderCompletedAt: optionalText(row.payment_reminder_completed_at), subtotalCents: number(row.subtotal_cents),
    discountType: row.discount_type === "percent" || row.discount_type === "fixed" ? row.discount_type : undefined,
    discountValue: row.discount_value == null ? undefined : number(row.discount_value), discountCents: number(row.discount_cents)
  };
}

export function paymentFromRemote(row: RemoteVersionedRow): Payment {
  const data = row.data && typeof row.data === "object" ? row.data as Record<string, unknown> : {};
  return {
    id: text(row.local_id, text(row.id)), invoiceId: text(row.invoice_local_id, text(row.invoice_id)),
    amountCents: number(row.amount_cents), paidAt: text(row.paid_at), method: text(row.method), note: optionalText(row.note),
    createdAt: text(row.created_at), importFingerprint: optionalText(row.import_fingerprint), importId: optionalText(data.importId),
    importSource: optionalText(data.importSource), sourceFile: optionalText(data.sourceFile), sourceSheet: optionalText(data.sourceSheet),
    sourceRow: data.sourceRow == null ? undefined : number(data.sourceRow)
  };
}

export function expenseFromRemote(row: RemoteVersionedRow): Expense {
  const raw = row.data && typeof row.data === "object" ? row.data as Partial<Expense> & { _sync?: unknown } : {};
  const { _sync: _ignored, ...data } = raw;
  void _ignored;
  return {
    ...data, id: text(row.local_id, text(row.id)), date: data.date ?? text(row.paid_at), paidAt: text(row.paid_at),
    supplier: text(row.supplier), description: data.description ?? text(row.supplier), category: text(row.category),
    totalCents: number(row.total_cents), businessSharePercent: data.businessSharePercent ?? 100,
    deductibleCents: number(row.deductible_cents), cancelled: data.cancelled ?? false,
    createdAt: text(row.created_at), updatedAt: text(row.updated_at), importFingerprint: optionalText(row.import_fingerprint)
  };
}

export function recurringExpenseFromRemote(row: RemoteVersionedRow): RecurringExpense {
  const raw = row.data && typeof row.data === "object" ? row.data as Partial<RecurringExpense> & { _sync?: unknown } : {};
  const { _sync: _ignored, ...data } = raw;
  void _ignored;
  return {
    ...data, id: text(row.local_id, text(row.id)), name: data.name ?? "", supplier: data.supplier ?? "", category: data.category ?? "Importiert / nicht zugeordnet",
    amountCents: data.amountCents ?? 0, startDate: data.startDate ?? text(row.next_due_date), interval: data.interval ?? "monthly",
    intervalMonths: data.intervalMonths ?? 1, nextDueDate: text(row.next_due_date), status: row.status as RecurringExpense["status"],
    creationMode: data.creationMode ?? "confirm", businessSharePercent: data.businessSharePercent ?? 100,
    createdAt: text(row.created_at), updatedAt: text(row.updated_at)
  };
}

export function templateFromRemote(row: RemoteVersionedRow): ServiceTemplate {
  return {
    id: text(row.local_id, text(row.id)), title: text(row.title), description: text(row.description), category: optionalText(row.category),
    sortOrder: number(row.sort_order), archived: Boolean(row.archived), usageCount: number(row.usage_count),
    sourceFingerprint: optionalText(row.source_fingerprint), createdAt: text(row.created_at), updatedAt: text(row.updated_at)
  };
}

export function importLogFromRemote(row: RemoteVersionedRow): ImportLog {
  const raw = row.progress && typeof row.progress === "object" ? row.progress as Partial<ImportLog> & { _sync?: unknown } : {};
  const { _sync: _ignored, ...data } = raw;
  void _ignored;
  return {
    id: text(row.local_id, text(row.id)), createdAt: text(row.created_at), sourceName: text(row.source_name),
    sourceFingerprint: text(row.source_fingerprint), years: data.years ?? [], customersFound: data.customersFound ?? 0,
    invoicesFound: data.invoicesFound ?? 0, imported: data.imported ?? 0, skipped: data.skipped ?? 0,
    warnings: data.warnings ?? [], structureVariant: data.structureVariant, expensesFound: data.expensesFound,
    expensesImported: data.expensesImported, templatesFound: data.templatesFound
  };
}

export function attachmentFromRemote(row: RemoteVersionedRow, blob: Blob): Attachment {
  return {
    id: text(row.local_id, text(row.id)), ownerType: row.owner_type === "invoice" ? "invoice" : "expense",
    ownerId: text(row.owner_local_id, text(row.owner_id)), name: text(row.filename),
    mimeType: text(row.content_type, blob.type || "application/octet-stream"), size: number(row.size_bytes, blob.size),
    blob, createdAt: text(row.created_at)
  };
}
