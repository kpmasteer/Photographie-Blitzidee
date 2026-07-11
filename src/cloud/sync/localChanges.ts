import type { Table } from "dexie";
import { db } from "../../db";
import { syncRecordKey } from "./identity";
import { enqueueSyncChange } from "./queue";
import type { SyncableRecord } from "./mapping";
import type { SyncEntityType } from "./types";

let activeOrganizationId: string | undefined;
let suppressionDepth = 0;
let hooksInstalled = false;
const localChangeListeners = new Set<() => void>();

export function setActiveSyncOrganization(organizationId?: string): void {
  activeOrganizationId = organizationId;
}

export function getActiveSyncOrganization(): string | undefined {
  return activeOrganizationId;
}

export function subscribeLocalChanges(listener: () => void): () => void {
  localChangeListeners.add(listener);
  return () => localChangeListeners.delete(listener);
}

export async function withRemoteWriteSuppressed<T>(work: () => Promise<T>): Promise<T> {
  suppressionDepth += 1;
  try { return await work(); }
  finally { suppressionDepth -= 1; }
}

function queueAfterCommit(entityType: SyncEntityType, entityId: string, operation: "upsert" | "delete", suppressed: boolean): void {
  const organizationId = activeOrganizationId;
  if (!organizationId || suppressed) return;
  queueMicrotask(() => {
    void enqueueSyncChange(organizationId, entityType, entityId, operation)
      .then(() => localChangeListeners.forEach((listener) => listener()), () => undefined);
  });
}

function observeTable<T, TKey extends string, TInsert>(table: Table<T, TKey, TInsert>, entityType: SyncEntityType): void {
  table.hook("creating", function (primaryKey, value) {
    const suppressed = suppressionDepth > 0;
    const insertedId = (value as { id?: unknown }).id;
    const entityId = String(insertedId ?? primaryKey);
    this.onsuccess = () => queueAfterCommit(entityType, entityId, "upsert", suppressed);
  });
  table.hook("updating", function (_changes, primaryKey) {
    const suppressed = suppressionDepth > 0;
    this.onsuccess = () => queueAfterCommit(entityType, String(primaryKey), "upsert", suppressed);
  });
  table.hook("deleting", function (primaryKey) {
    const suppressed = suppressionDepth > 0;
    this.onsuccess = () => queueAfterCommit(entityType, String(primaryKey), "delete", suppressed);
  });
}

/** Install once; hooks remain dormant while no cloud organisation is active. */
export function installLocalChangeCapture(): void {
  if (hooksInstalled) return;
  hooksInstalled = true;
  observeTable(db.company, "company");
  observeTable(db.customers, "customer");
  observeTable(db.invoices, "invoice");
  observeTable(db.payments, "payment");
  observeTable(db.expenses, "expense");
  observeTable(db.recurringExpenses, "recurringExpense");
  observeTable(db.serviceTemplates, "serviceTemplate");
  observeTable(db.importLogs, "importLog");
  observeTable(db.attachments, "attachment");
}

const updatedAt = (record: SyncableRecord): string => {
  if ("updatedAt" in record && typeof record.updatedAt === "string") return record.updatedAt;
  if ("createdAt" in record && typeof record.createdAt === "string") return record.createdAt;
  return "";
};

/**
 * Queues existing local data once and only queues it again when it is newer than
 * the last successful upload. This is the resumable local-to-cloud migration.
 */
export async function enqueueLocalSnapshot(organizationId: string): Promise<number> {
  const groups: Array<{ entityType: SyncEntityType; records: SyncableRecord[] }> = [
    { entityType: "company", records: (await db.company.toArray()) as SyncableRecord[] },
    { entityType: "customer", records: (await db.customers.toArray()) as SyncableRecord[] },
    { entityType: "invoice", records: (await db.invoices.toArray()) as SyncableRecord[] },
    { entityType: "payment", records: (await db.payments.toArray()) as SyncableRecord[] },
    { entityType: "expense", records: (await db.expenses.toArray()) as SyncableRecord[] },
    { entityType: "recurringExpense", records: (await db.recurringExpenses.toArray()) as SyncableRecord[] },
    { entityType: "serviceTemplate", records: (await db.serviceTemplates.toArray()) as SyncableRecord[] },
    { entityType: "importLog", records: (await db.importLogs.toArray()) as SyncableRecord[] },
    { entityType: "attachment", records: (await db.attachments.toArray()) as SyncableRecord[] }
  ];
  let queued = 0;
  for (const group of groups) {
    for (const record of group.records) {
      const metadata = await db.syncMetadata.get(syncRecordKey(organizationId, group.entityType, record.id));
      if (metadata && (!updatedAt(record) || metadata.localUpdatedAt === updatedAt(record))) continue;
      const openConflict = await db.syncConflicts.where("[organizationId+status]").equals([organizationId, "open"]).filter((conflict) => conflict.entityType === group.entityType && conflict.entityId === record.id).first();
      if (openConflict) continue;
      await enqueueSyncChange(organizationId, group.entityType, record.id);
      queued += 1;
    }
  }
  return queued;
}
