import type { EntityTable } from "dexie";
import { db } from "../../db";
import type {
  Attachment, Company, Customer, Expense, ImportLog, Invoice, Payment, RecurringExpense, ServiceTemplate
} from "../../types";
import { syncRecordKey } from "./identity";
import { withRemoteWriteSuppressed } from "./localChanges";
import type { SyncEntityType, SyncMetadata } from "./types";

export interface CloudSnapshot {
  company?: Company;
  customers: Customer[];
  invoices: Invoice[];
  payments: Payment[];
  expenses: Expense[];
  recurringExpenses: RecurringExpense[];
  serviceTemplates: ServiceTemplate[];
  importLogs: ImportLog[];
  attachments: Attachment[];
  metadata: SyncMetadata[];
  downloaded: number;
}

export interface ReconcileResult {
  changed: number;
  deleted: number;
  preservedFinalizedInvoices: string[];
}

type Identified = { id: string };

function comparableRecord(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (typeof Blob !== "undefined" && item instanceof Blob) {
      return { type: item.type, size: item.size };
    }
    return item;
  });
}

async function reconcileTable<T extends Identified>(
  table: EntityTable<T, "id">,
  organizationId: string,
  entityType: SyncEntityType,
  cloudRecords: T[],
  protectedKeys: ReadonlySet<string>,
  previousMetadata: ReadonlyMap<string, SyncMetadata>,
  snapshotMetadata: ReadonlyMap<string, SyncMetadata>,
  preservedFinalizedInvoices: string[]
): Promise<{ changed: number; deleted: number }> {
  const existing = await table.toArray();
  const existingById = new Map(existing.map((record) => [record.id, record]));
  const cloudById = new Map(cloudRecords.map((record) => [record.id, record]));
  const incoming: T[] = [];
  const removals: string[] = [];
  let changed = 0;

  for (const record of cloudRecords) {
    const key = syncRecordKey(organizationId, entityType, record.id);
    if (protectedKeys.has(key)) continue;
    incoming.push(record);
    const local = existingById.get(record.id);
    if (!local || comparableRecord(local) !== comparableRecord(record)) changed += 1;
  }

  for (const local of existing) {
    if (cloudById.has(local.id)) continue;
    const key = syncRecordKey(organizationId, entityType, local.id);
    if (protectedKeys.has(key)) continue;

    // Unknown legacy data has never been proven to exist in the cloud. It must
    // remain available until the explicit migration workflow has handled it.
    const knownRemote = snapshotMetadata.get(key) ?? previousMetadata.get(key);
    if (!knownRemote) continue;

    // A missing row alone is not enough evidence to erase a numbered invoice.
    // Explicit cloud tombstones are authoritative, while unexplained hard
    // deletion is surfaced as an integrity conflict by the caller.
    if (
      entityType === "invoice"
      && (local as unknown as Invoice).status !== "draft"
      && !snapshotMetadata.get(key)?.deletedAt
    ) {
      preservedFinalizedInvoices.push(local.id);
      continue;
    }
    removals.push(local.id);
  }

  if (removals.length) await table.bulkDelete(removals as Parameters<typeof table.bulkDelete>[0]);
  if (incoming.length) await table.bulkPut(incoming);
  return { changed, deleted: removals.length };
}

/**
 * Replaces the proven local cache with one complete cloud snapshot.
 * Queue-protected local records are excluded from both replacement and cleanup.
 * The transaction means list, dashboard and reminder live queries never observe
 * a half-applied cloud state.
 */
export async function reconcileCloudSnapshot(
  organizationId: string,
  snapshot: CloudSnapshot
): Promise<ReconcileResult> {
  const [queued, priorMetadata] = await Promise.all([
    db.syncQueue.where("organizationId").equals(organizationId).toArray(),
    db.syncMetadata.where("organizationId").equals(organizationId).toArray()
  ]);
  const protectedKeys = new Set(queued.map((entry) => entry.dedupeKey));
  const previousMetadata = new Map(priorMetadata.map((item) => [item.id, item]));
  const snapshotMetadata = new Map(snapshot.metadata.map((item) => [item.id, item]));
  const preservedFinalizedInvoices: string[] = [];
  let changed = 0;
  let deleted = 0;

  const tables = [
    db.company, db.customers, db.invoices, db.payments, db.expenses,
    db.recurringExpenses, db.serviceTemplates, db.importLogs, db.attachments,
    db.syncMetadata
  ];

  await withRemoteWriteSuppressed(() => db.transaction("rw", tables, async () => {
    const companyKey = syncRecordKey(organizationId, "company", "company");
    if (snapshot.company && !protectedKeys.has(companyKey)) {
      const current = await db.company.get("company");
      if (!current || comparableRecord(current) !== comparableRecord(snapshot.company)) changed += 1;
      await db.company.put(snapshot.company);
    }

    const results = await Promise.all([
      reconcileTable(db.customers, organizationId, "customer", snapshot.customers, protectedKeys, previousMetadata, snapshotMetadata, preservedFinalizedInvoices),
      reconcileTable(db.invoices, organizationId, "invoice", snapshot.invoices, protectedKeys, previousMetadata, snapshotMetadata, preservedFinalizedInvoices),
      reconcileTable(db.payments, organizationId, "payment", snapshot.payments, protectedKeys, previousMetadata, snapshotMetadata, preservedFinalizedInvoices),
      reconcileTable(db.expenses, organizationId, "expense", snapshot.expenses, protectedKeys, previousMetadata, snapshotMetadata, preservedFinalizedInvoices),
      reconcileTable(db.recurringExpenses, organizationId, "recurringExpense", snapshot.recurringExpenses, protectedKeys, previousMetadata, snapshotMetadata, preservedFinalizedInvoices),
      reconcileTable(db.serviceTemplates, organizationId, "serviceTemplate", snapshot.serviceTemplates, protectedKeys, previousMetadata, snapshotMetadata, preservedFinalizedInvoices),
      reconcileTable(db.importLogs, organizationId, "importLog", snapshot.importLogs, protectedKeys, previousMetadata, snapshotMetadata, preservedFinalizedInvoices),
      reconcileTable(db.attachments, organizationId, "attachment", snapshot.attachments, protectedKeys, previousMetadata, snapshotMetadata, preservedFinalizedInvoices)
    ]);
    for (const result of results) {
      changed += result.changed;
      deleted += result.deleted;
    }

    const preservedKeys = new Set(preservedFinalizedInvoices.map((id) => syncRecordKey(organizationId, "invoice", id)));
    const staleMetadata = priorMetadata
      .filter((item) => !snapshotMetadata.has(item.id) && !protectedKeys.has(item.id) && !preservedKeys.has(item.id))
      .map((item) => item.id);
    if (staleMetadata.length) await db.syncMetadata.bulkDelete(staleMetadata);
    const incomingMetadata = snapshot.metadata.filter((item) => !protectedKeys.has(item.id));
    if (incomingMetadata.length) await db.syncMetadata.bulkPut(incomingMetadata);
  }));

  return { changed, deleted, preservedFinalizedInvoices };
}
