export type CloudMutation<T> = { record: T; expectedVersion?: number };
export interface Repository<T> { list(): Promise<T[]>; get(id: string): Promise<T | undefined>; save(change: CloudMutation<T>): Promise<T>; remove(id: string, expectedVersion?: number): Promise<void>; }
export type CustomerRepository<T> = Repository<T>;
export interface InvoiceRepository<T> extends Repository<T> { finalize(id: string): Promise<T>; }
export type PaymentRepository<T> = Repository<T>;
export type ExpenseRepository<T> = Repository<T>;
export type RecurringExpenseRepository<T> = Repository<T>;
export type DescriptionTemplateRepository<T> = Repository<T>;
export type SettingsRepository<T> = Repository<T>;

export type SyncQueueStatus = "pending" | "syncing" | "synced" | "conflict" | "failed";
export type SyncQueueEntry = { id: string; organizationId: string; entityType: string; entityId: string; action: "upsert" | "delete"; localVersion: number; status: SyncQueueStatus; attempts: number; createdAt: string; lastError?: string };
export interface SyncRepository { pending(): Promise<SyncQueueEntry[]>; enqueue(entry: SyncQueueEntry): Promise<void>; mark(id: string, status: SyncQueueStatus, error?: string): Promise<void>; }
