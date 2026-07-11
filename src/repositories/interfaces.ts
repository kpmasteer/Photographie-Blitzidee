import type { AppSetting, Customer, Expense, Invoice, Payment } from "../types";

export interface CustomerRepository { list(): Promise<Customer[]>; get(id: string): Promise<Customer | undefined>; save(customer: Customer): Promise<void>; }
export interface InvoiceRepository { list(): Promise<Invoice[]>; get(id: string): Promise<Invoice | undefined>; save(invoice: Invoice): Promise<void>; deleteDraft(id: string): Promise<void>; }
export interface ExpenseRepository { list(): Promise<Expense[]>; save(expense: Expense): Promise<void>; }
export interface PaymentRepository { listForInvoice(invoiceId: string): Promise<Payment[]>; save(payment: Payment): Promise<void>; }
export interface SettingsRepository { get(key: string): Promise<AppSetting | undefined>; save(setting: AppSetting): Promise<void>; }
export interface RepositoryBundle { customers: CustomerRepository; invoices: InvoiceRepository; expenses: ExpenseRepository; payments: PaymentRepository; settings: SettingsRepository; }
