export type InvoiceStatus = "draft" | "finalized" | "sent" | "partially_paid" | "paid" | "overdue" | "cancelled";

export interface Company {
  id: "company";
  name: string;
  owner: string;
  street: string;
  postalCode: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  secondaryEmail: string;
  website: string;
  taxNumber: string;
  vatId: string;
  iban: string;
  bic: string;
  bankName: string;
  accountHolder: string;
  smallBusiness: boolean;
  taxExemptionNote: string;
  paymentTermDays: number;
  defaultIntro: string;
  defaultOutro: string;
  invoiceNumberPattern: string;
  confirmedAt?: string;
  updatedAt: string;
}

export interface Customer {
  id: string;
  customerNumber?: string;
  salutation?: string;
  firstName: string;
  lastName: string;
  company?: string;
  street: string;
  postalCode: string;
  city: string;
  country: string;
  email?: string;
  phone?: string;
  notes?: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  importFingerprint?: string;
}

export interface InvoiceItem {
  id: string;
  description: string;
  details?: string;
  quantityMilli: number;
  unit: string;
  unitPriceCents: number;
  totalCents: number;
  sortOrder: number;
  subtotalCents?: number;
  discountType?: "percent" | "fixed";
  discountValue?: number;
  discountCents?: number;
}

export interface CustomerSnapshot {
  customerNumber?: string;
  displayName: string;
  company?: string;
  street: string;
  postalCode: string;
  city: string;
  country: string;
  email?: string;
}

export type CompanySnapshot = Omit<Company, "confirmedAt" | "updatedAt">;

export interface Invoice {
  id: string;
  draftNumber: string;
  invoiceNumber?: string;
  year: number;
  customerId: string;
  customerSnapshot?: CustomerSnapshot;
  companySnapshot?: CompanySnapshot;
  invoiceDate: string;
  serviceDateFrom: string;
  serviceDateTo?: string;
  items: InvoiceItem[];
  totalCents: number;
  paymentTermDays: number;
  dueDate: string;
  status: InvoiceStatus;
  paidAt?: string;
  paymentMethod?: string;
  notes?: string;
  introText: string;
  outroText: string;
  taxExemptionNote: string;
  createdAt: string;
  updatedAt: string;
  finalizedAt?: string;
  sentAt?: string;
  imported: boolean;
  importSource?: string;
  importFingerprint?: string;
  cancelledInvoiceId?: string;
  correctionInvoiceId?: string;
  contentHash?: string;
  pdfBlob?: Blob;
  paymentReminderAt?: string;
  paymentReminderLastShownAt?: string;
  paymentReminderCompletedAt?: string;
  subtotalCents?: number;
  discountType?: "percent" | "fixed";
  discountValue?: number;
  discountCents?: number;
}

export interface Payment {
  id: string;
  invoiceId: string;
  amountCents: number;
  paidAt: string;
  method: string;
  note?: string;
  createdAt: string;
  importId?: string;
  importSource?: string;
  sourceFile?: string;
  sourceSheet?: string;
  sourceRow?: number;
  importFingerprint?: string;
}

export interface Expense {
  id: string;
  receiptNumber?: string;
  date: string;
  paidAt: string;
  supplier: string;
  description: string;
  category: string;
  totalCents: number;
  includedVatCents?: number;
  businessSharePercent: number;
  deductibleCents: number;
  paymentMethod?: string;
  note?: string;
  attachmentId?: string;
  cancelled: boolean;
  createdAt: string;
  updatedAt: string;
  imported?: boolean;
  importSource?: string;
  importFingerprint?: string;
  costType?: "standard" | "travel";
  tripPurpose?: string;
  startLocation?: string;
  destination?: string;
  kilometers?: number;
  kilometerRateCents?: number;
  parkingCents?: number;
  tollCents?: number;
  customerId?: string;
  invoiceId?: string;
  recurringExpenseId?: string;
  periodKey?: string;
  automaticallyGenerated?: boolean;
  confirmationStatus?: "pending" | "confirmed";
  importId?: string;
  sourceFile?: string;
  sourceSheet?: string;
  sourceRow?: number;
}

export type RecurrenceInterval = "monthly" | "bimonthly" | "quarterly" | "semiannual" | "yearly" | "custom";
export interface RecurringExpense {
  id: string;
  name: string;
  supplier: string;
  category: string;
  amountCents: number;
  paymentMethod?: string;
  startDate: string;
  interval: RecurrenceInterval;
  intervalMonths: number;
  nextDueDate: string;
  endDate?: string;
  status: "active" | "paused" | "ended" | "archived";
  creationMode: "confirm" | "automatic";
  note?: string;
  businessSharePercent: number;
  costType?: "standard" | "travel";
  lastCheckedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceTemplate {
  id: string;
  title: string;
  description: string;
  category?: string;
  sortOrder: number;
  archived: boolean;
  usageCount: number;
  sourceFingerprint?: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

export interface CustomerNumberConfig {
  prefix: string;
  startNumber: number;
  digits: number;
  nextValue: number;
}

export interface Attachment {
  id: string;
  ownerType: "expense" | "invoice";
  ownerId: string;
  name: string;
  mimeType: string;
  size: number;
  blob: Blob;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  action: string;
  recordType: string;
  recordId: string;
  before?: unknown;
  after?: unknown;
  source: string;
  appVersion: string;
}

export interface ImportLog {
  id: string;
  createdAt: string;
  sourceName: string;
  sourceFingerprint: string;
  years: number[];
  customersFound: number;
  invoicesFound: number;
  imported: number;
  skipped: number;
  warnings: string[];
  structureVariant?: string;
  expensesFound?: number;
  expensesImported?: number;
  templatesFound?: number;
}

export interface AppSetting {
  key: string;
  value: unknown;
}

export const EXPENSE_CATEGORIES = [
  "Fotoausrüstung", "Objektive und Kameras", "Computer und Software", "Werbung und Website",
  "Druckprodukte", "Verpackung und Versand", "Fahrtkosten", "Telefon und Internet",
  "Büromaterial", "Versicherungen", "Weiterbildung", "Fremdleistungen", "Bankgebühren", "Sonstiges"
];
