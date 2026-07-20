import type { RealtimeChannel } from "@supabase/supabase-js";
import { db } from "../../db";
import type { Attachment, Company, Customer, Expense, ImportLog, Invoice, Payment, RecurringExpense, ServiceTemplate } from "../../types";
import { supabase } from "../client";
import { registerCloudOperationHandlers, reportCloudRuntimeStatus } from "../operations";
import { comparableRemoteRow, contentHash } from "./hash";
import { syncRecordKey } from "./identity";
import { enqueueLocalSnapshot, installLocalChangeCapture, setActiveSyncOrganization, subscribeLocalChanges, withRemoteWriteSuppressed } from "./localChanges";
import {
  companyFromRemote, customerFromRemote, expenseFromRemote, invoiceFromRemote, paymentFromRemote,
  recurringExpenseFromRemote, tableForEntity, templateFromRemote, toRemoteBundle, type SyncableRecord,
  attachmentFromRemote, importLogFromRemote
} from "./mapping";
import { claimPendingChanges, markSyncComplete, markSyncFailed, recordSyncConflict, recoverInterruptedChanges, resolveSyncConflict } from "./queue";
import { replaceLocalCacheWithCloud } from "../cacheIsolation";
import { reconcileCloudSnapshot, type CloudSnapshot } from "./reconcile";
import { timestampWinner } from "./conflictResolution";
import type { RemoteRecordBundle, RemoteVersionedRow, SyncEntityType, SyncMetadata, SyncProgress, SyncQueueEntry, SyncRunLog, SyncTrigger } from "./types";

type Client = NonNullable<typeof supabase>;
type LocalRecord = Company | Customer | Invoice | Payment | Expense | RecurringExpense | ServiceTemplate | ImportLog | Attachment;

const priority: Record<SyncEntityType, number> = {
  company: 0, customer: 1, invoice: 2, payment: 3, recurringExpense: 4, expense: 5,
  serviceTemplate: 6, importLog: 7, attachment: 8
};
const progressListeners = new Set<(progress: SyncProgress) => void>();
let progress: SyncProgress = { state: "idle", pending: 0, conflicts: 0 };

export function subscribeSyncProgress(listener: (value: SyncProgress) => void): () => void {
  progressListeners.add(listener);
  listener(progress);
  return () => progressListeners.delete(listener);
}

export function getSyncProgress(): SyncProgress { return progress; }

function publishProgress(value: Partial<SyncProgress>): void {
  progress = { ...progress, ...value };
  progressListeners.forEach((listener) => listener(progress));
}

function remoteVersion(row: RemoteVersionedRow): number { return Number(row.version ?? 0); }
function remoteUpdatedAt(row: RemoteVersionedRow): string | undefined { return typeof row.updated_at === "string" ? row.updated_at : undefined; }
function isInitialEmptyCompanyRow(row: RemoteVersionedRow): boolean {
  return !row.data || (typeof row.data === "object" && !Array.isArray(row.data) && Object.keys(row.data).length === 0);
}
function localUpdatedAt(record: LocalRecord): string | undefined {
  if ("updatedAt" in record && typeof record.updatedAt === "string") return record.updatedAt;
  if ("createdAt" in record && typeof record.createdAt === "string") return record.createdAt;
  return undefined;
}

async function localRecord(entityType: SyncEntityType, id: string): Promise<LocalRecord | undefined> {
  switch (entityType) {
    case "company": return db.company.get("company");
    case "customer": return db.customers.get(id);
    case "invoice": return db.invoices.get(id);
    case "payment": return db.payments.get(id);
    case "expense": return db.expenses.get(id);
    case "recurringExpense": return db.recurringExpenses.get(id);
    case "serviceTemplate": return db.serviceTemplates.get(id);
    case "importLog": return db.importLogs.get(id);
    case "attachment": return db.attachments.get(id);
  }
}


async function putLocalRecord(entityType: SyncEntityType, record: LocalRecord): Promise<void> {
  switch (entityType) {
    case "company": await db.company.put(record as Company); return;
    case "customer": await db.customers.put(record as Customer); return;
    case "invoice": await db.invoices.put(record as Invoice); return;
    case "payment": await db.payments.put(record as Payment); return;
    case "expense": await db.expenses.put(record as Expense); return;
    case "recurringExpense": await db.recurringExpenses.put(record as RecurringExpense); return;
    case "serviceTemplate": await db.serviceTemplates.put(record as ServiceTemplate); return;
    case "importLog": await db.importLogs.put(record as ImportLog); return;
    case "attachment": await db.attachments.put(record as Attachment); return;
  }
}

async function rowsForInvoice(client: Client, invoiceId: string): Promise<RemoteVersionedRow[]> {
  const { data, error } = await client.from("invoice_items").select("*").eq("invoice_id", invoiceId).is("deleted_at", null).order("sort_order");
  if (error) throw error;
  return (data ?? []) as RemoteVersionedRow[];
}

async function completeRemoteBundle(client: Client, entityType: SyncEntityType, row: RemoteVersionedRow): Promise<RemoteRecordBundle> {
  if (entityType !== "invoice") return { table: tableForEntity[entityType], row };
  return { table: "invoices", row, childRows: [{ table: "invoice_items", rows: await rowsForInvoice(client, String(row.id)) }] };
}

async function bundleHash(bundle: RemoteRecordBundle): Promise<string> {
  return contentHash({
    row: comparableRemoteRow(bundle.row),
    children: bundle.childRows?.map((child) => ({ table: child.table, rows: child.rows
      .map((row) => comparableRemoteRow(row)).sort((a, b) => String(a.local_id).localeCompare(String(b.local_id))) })) ?? []
  });
}

async function remoteRow(client: Client, organizationId: string, entityType: SyncEntityType, localId: string): Promise<RemoteVersionedRow | undefined> {
  let query = client.from(tableForEntity[entityType]).select("*").eq("organization_id", organizationId);
  if (entityType !== "company") query = query.eq("local_id", localId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data as RemoteVersionedRow | undefined;
}

function metadataFor(organizationId: string, entityType: SyncEntityType, entityId: string, row: RemoteVersionedRow, hash: string, record?: LocalRecord): SyncMetadata {
  return {
    id: syncRecordKey(organizationId, entityType, entityId), organizationId, entityType, entityId,
    remoteId: String(row.id ?? organizationId), remoteVersion: remoteVersion(row), remoteUpdatedAt: remoteUpdatedAt(row),
    localUpdatedAt: record ? localUpdatedAt(record) : remoteUpdatedAt(row), lastSyncedHash: hash,
    lastSyncedAt: new Date().toISOString(), deletedAt: typeof row.deleted_at === "string" ? row.deleted_at : undefined
  };
}

async function saveConflict(entry: Pick<SyncQueueEntry, "organizationId" | "entityType" | "entityId">, local: LocalRecord | undefined, remote: RemoteVersionedRow, reason: "concurrent_change" | "remote_deleted" = "concurrent_change"): Promise<void> {
  const bundle = local ? await toRemoteBundle(entry.organizationId, entry.entityType, local as SyncableRecord) : undefined;
  await recordSyncConflict({
    organizationId: entry.organizationId, entityType: entry.entityType, entityId: entry.entityId,
    remoteId: String(remote.id ?? entry.organizationId), reason, localValue: bundle, remoteValue: remote,
    localUpdatedAt: local ? localUpdatedAt(local) : undefined, remoteUpdatedAt: remoteUpdatedAt(remote), remoteVersion: remoteVersion(remote)
  });
}

async function upsertInvoiceChildren(client: Client, organizationId: string, invoiceId: string, childRows: RemoteVersionedRow[]): Promise<void> {
  if (childRows.length) {
    const { error } = await client.from("invoice_items").upsert(childRows, { onConflict: "id" });
    if (error) throw error;
  }
  const localIds = childRows.map((row) => String(row.local_id));
  let stale = client.from("invoice_items").update({ deleted_at: new Date().toISOString() })
    .eq("organization_id", organizationId).eq("invoice_id", invoiceId).is("deleted_at", null);
  if (localIds.length) stale = stale.not("local_id", "in", `(${localIds.map((id) => `"${id.replaceAll('"', '')}"`).join(",")})`);
  const { error: staleError } = await stale;
  if (staleError) throw staleError;
}

async function conditionalWrite(client: Client, bundle: RemoteRecordBundle, current: RemoteVersionedRow | undefined): Promise<RemoteVersionedRow> {
  if (bundle.table === "attachments" || bundle.table === "import_batches") {
    if (current) return current;
    const { data, error } = await client.from(bundle.table).insert(bundle.row).select("*").single();
    if (error) throw error;
    return data as RemoteVersionedRow;
  }
  if (!current) {
    const { data, error } = await client.from(bundle.table).insert(bundle.row).select("*").single();
    if (error) throw error;
    return data as RemoteVersionedRow;
  }
  const idColumn = bundle.table === "company_settings" ? "organization_id" : "id";
  const id = bundle.table === "company_settings" ? bundle.row.organization_id : bundle.row.id;
  const { data, error } = await client.from(bundle.table).update(bundle.row).eq(idColumn, id)
    .eq("version", remoteVersion(current)).select("*").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("SYNC_COMPARE_AND_SWAP_FAILED");
  return data as RemoteVersionedRow;
}

async function writeInvoice(client: Client, organizationId: string, invoice: Invoice, bundle: RemoteRecordBundle, current: RemoteVersionedRow | undefined): Promise<RemoteVersionedRow> {
  if (current && current.status !== "draft") {
    if (invoice.invoiceNumber !== current.invoice_number || invoice.status === "draft") {
      throw new Error("SYNC_FINAL_INVOICE_IMMUTABLE");
    }
    // Final invoice content and item rows stay untouched. Only operational
    // metadata (sent/paid/reminder state and the first document hash) reaches
    // the guarded UPDATE path in Postgres.
    return conditionalWrite(client, { table: bundle.table, row: bundle.row }, current);
  }
  const shouldFinalize = invoice.status !== "draft";
  const isHistoricalMigration = shouldFinalize && Boolean(invoice.invoiceNumber);
  const draftBundle: RemoteRecordBundle = shouldFinalize ? {
    ...bundle,
    row: {
      ...bundle.row,
      status: "draft",
      invoice_number: null,
      finalized_at: null,
      paid_at: null,
      sent_at: null,
      cancelled_at: null,
      imported: isHistoricalMigration ? true : bundle.row.imported,
      import_source: isHistoricalMigration
        ? bundle.row.import_source ?? "Lokale Datenmigration"
        : bundle.row.import_source
    }
  } : bundle;
  let written = await conditionalWrite(client, draftBundle, current);
  await upsertInvoiceChildren(client, organizationId, String(written.id), draftBundle.childRows?.[0]?.rows ?? []);
  if (!shouldFinalize) return written;
  // Every pre-existing final invoice number is historical during the first
  // migration, regardless of whether the old local record carried an explicit
  // Excel-import flag. Existing numbers must never be silently replaced.
  if (invoice.invoiceNumber) {
    const { data, error } = await client.rpc("import_historical_invoice", {
      p_invoice: written.id,
      p_invoice_number: invoice.invoiceNumber,
      p_status: invoice.status,
      p_finalized_at: invoice.finalizedAt ?? invoice.updatedAt,
      p_paid_at: invoice.paidAt ?? null
    });
    if (error) throw error;
    written = data as RemoteVersionedRow;
  } else {
    const { data, error } = await client.rpc("finalize_invoice", { p_invoice: written.id });
    if (error) throw error;
    written = data as RemoteVersionedRow;
  }
  return written;
}

async function uploadEntry(client: Client, entry: SyncQueueEntry): Promise<void> {
  const local = await localRecord(entry.entityType, entry.entityId);
  const current = await remoteRow(client, entry.organizationId, entry.entityType, entry.entityId);
  const metadata = await db.syncMetadata.get(syncRecordKey(entry.organizationId, entry.entityType, entry.entityId));
  if (entry.entityType === "invoice" && current && current.status !== "draft" && local && metadata?.localUpdatedAt === localUpdatedAt(local)) {
    await markSyncComplete(entry.id);
    return;
  }
  if (current && metadata) {
    const currentBundle = await completeRemoteBundle(client, entry.entityType, current);
    const currentHash = await bundleHash(currentBundle);
    const remoteChanged = remoteVersion(current) !== metadata.remoteVersion
      || Boolean(metadata.lastSyncedHash && currentHash !== metadata.lastSyncedHash);
    if (remoteChanged) {
      const localTimestamp = local ? localUpdatedAt(local) : entry.updatedAt;
      const cloudTimestamp = remoteUpdatedAt(current);
      const winner = timestampWinner(localTimestamp, cloudTimestamp);
      if (winner === "cloud") {
        // The queued change is older than the cloud row. Dropping only this
        // queue entry lets the following full snapshot restore the cloud value.
        await markSyncComplete(entry.id);
        return;
      }
      if (winner === "local") {
        await db.syncMetadata.put(metadataFor(entry.organizationId, entry.entityType, entry.entityId, current, currentHash));
      } else {
        await saveConflict(entry, local, current, current.deleted_at ? "remote_deleted" : "concurrent_change");
        return;
      }
    }
  } else if (current && !metadata && local) {
    const mayInitializeCompany = entry.entityType === "company" && isInitialEmptyCompanyRow(current);
    if (!mayInitializeCompany) {
      const localBundle = await toRemoteBundle(entry.organizationId, entry.entityType, local as SyncableRecord);
      const currentBundle = await completeRemoteBundle(client, entry.entityType, current);
      if (await bundleHash(localBundle) !== await bundleHash(currentBundle)) {
        await saveConflict(entry, local, current);
        return;
      }
    }
  }
  if (current && local && (entry.entityType === "attachment" || entry.entityType === "importLog")) {
    const localBundle = await toRemoteBundle(entry.organizationId, entry.entityType, local as SyncableRecord);
    const currentBundle = await completeRemoteBundle(client, entry.entityType, current);
    if (await bundleHash(localBundle) !== await bundleHash(currentBundle)) await saveConflict(entry, local, current);
    else {
      await db.syncMetadata.put(metadataFor(entry.organizationId, entry.entityType, entry.entityId, current, await bundleHash(currentBundle), local));
      await markSyncComplete(entry.id);
    }
    return;
  }
  if (entry.operation === "delete" || !local) {
    if (current && entry.entityType !== "company") {
      if (entry.entityType === "importLog") { await markSyncComplete(entry.id); return; }
      let deleted = current;
      if (!current.deleted_at) {
        const { data, error } = await client.from(tableForEntity[entry.entityType])
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", current.id)
          .eq("version", remoteVersion(current))
          .select("*")
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("SYNC_COMPARE_AND_SWAP_FAILED");
        deleted = data as RemoteVersionedRow;
        await db.syncMetadata.put(metadataFor(
          entry.organizationId,
          entry.entityType,
          entry.entityId,
          deleted,
          await bundleHash({ table: tableForEntity[entry.entityType], row: deleted })
        ));
      }
      if (entry.entityType === "attachment") {
        const bucket = String(deleted.bucket ?? ""); const objectPath = String(deleted.object_path ?? "");
        if (bucket && objectPath) {
          const { error: storageError } = await client.storage.from(bucket).remove([objectPath]);
          if (storageError) throw storageError;
        }
      }
    }
    await markSyncComplete(entry.id);
    return;
  }
  const localBundle = await toRemoteBundle(entry.organizationId, entry.entityType, local as SyncableRecord);
  if (entry.entityType === "attachment") {
    const attachment = local as Attachment;
    const bucket = String(localBundle.row.bucket); const objectPath = String(localBundle.row.object_path);
    const { error } = await client.storage.from(bucket).upload(objectPath, attachment.blob, {
      contentType: attachment.mimeType || "application/octet-stream", upsert: true
    });
    if (error) throw error;
  }
  let written: RemoteVersionedRow;
  try {
    written = entry.entityType === "invoice"
      ? await writeInvoice(client, entry.organizationId, local as Invoice, localBundle, current)
      : await conditionalWrite(client, localBundle, current);
  }
  catch (cause) {
    if (cause instanceof Error && cause.message === "SYNC_FINAL_INVOICE_IMMUTABLE" && current) {
      await saveConflict(entry, local, current);
      return;
    }
    if (cause instanceof Error && cause.message === "SYNC_COMPARE_AND_SWAP_FAILED") {
      const latest = await remoteRow(client, entry.organizationId, entry.entityType, entry.entityId);
      if (latest) { await saveConflict(entry, local, latest); return; }
    }
    throw cause;
  }
  const completed = await completeRemoteBundle(client, entry.entityType, written);
  let syncedLocal = local;
  if (entry.entityType === "invoice" && (local as Invoice).status !== "draft") {
    syncedLocal = await localFromRemote(client, entry.organizationId, "invoice", written);
    await withRemoteWriteSuppressed(() => putLocalRecord("invoice", syncedLocal!));
  }
  await db.syncMetadata.put(metadataFor(entry.organizationId, entry.entityType, entry.entityId, written, await bundleHash(completed), syncedLocal));
  await markSyncComplete(entry.id);
}

async function localFromRemote(client: Client, organizationId: string, entityType: SyncEntityType, row: RemoteVersionedRow): Promise<LocalRecord> {
  if (entityType === "company") return companyFromRemote(row);
  if (entityType === "customer") return customerFromRemote(row);
  if (entityType === "payment") {
    const invoiceMetadata = await db.syncMetadata.where("remoteId").equals(String(row.invoice_id)).first();
    return paymentFromRemote({ ...row, invoice_local_id: invoiceMetadata?.entityId });
  }
  if (entityType === "expense") return expenseFromRemote(row);
  if (entityType === "recurringExpense") return recurringExpenseFromRemote(row);
  if (entityType === "serviceTemplate") return templateFromRemote(row);
  if (entityType === "importLog") return importLogFromRemote(row);
  if (entityType === "attachment") {
    const bucket = String(row.bucket ?? ""); const objectPath = String(row.object_path ?? "");
    const { data, error } = await client.storage.from(bucket).download(objectPath);
    if (error) throw error;
    const ownerEntity = row.owner_type === "invoice" ? "invoice" : "expense";
    const ownerMetadata = await db.syncMetadata.where("remoteId").equals(String(row.owner_id)).filter((item) => item.entityType === ownerEntity).first();
    return attachmentFromRemote({ ...row, owner_local_id: ownerMetadata?.entityId }, data);
  }
  const customerMetadata = row.customer_id ? await db.syncMetadata.where("remoteId").equals(String(row.customer_id)).first() : undefined;
  const cancellationMetadata = row.cancelled_invoice_id ? await db.syncMetadata.where("remoteId").equals(String(row.cancelled_invoice_id)).first() : undefined;
  const correctionMetadata = row.correction_invoice_id ? await db.syncMetadata.where("remoteId").equals(String(row.correction_invoice_id)).first() : undefined;
  return invoiceFromRemote({
    ...row, customer_local_id: customerMetadata?.entityId,
    cancelled_invoice_local_id: cancellationMetadata?.entityId, correction_invoice_local_id: correctionMetadata?.entityId
  }, await rowsForInvoice(client, String(row.id)));
}


async function fetchAllRows(client: Client, table: string, organizationId: string): Promise<RemoteVersionedRow[]> {
  const rows: RemoteVersionedRow[] = [];
  const orderColumn = table === "company_settings" ? "organization_id" : "id";
  for (let start = 0; ; start += 1_000) {
    const { data, error } = await client.from(table).select("*").eq("organization_id", organizationId).order(orderColumn).range(start, start + 999);
    if (error) throw error;
    const page = (data ?? []) as RemoteVersionedRow[];
    rows.push(...page);
    if (page.length < 1_000) return rows;
  }
}
const activeRows = (rows: RemoteVersionedRow[]) => rows.filter((row) => !row.deleted_at);
const localIdFromRow = (entityType: SyncEntityType, row: RemoteVersionedRow) =>
  entityType === "company" ? "company" : String(row.local_id ?? row.id ?? "");

async function loadCloudSnapshot(client: Client, organizationId: string): Promise<CloudSnapshot> {
  const entries = Object.entries(tableForEntity) as Array<[SyncEntityType, string]>;
  const fetched = await Promise.all([
    ...entries.map(async ([entityType, table]) => [entityType, await fetchAllRows(client, table, organizationId)] as const),
    fetchAllRows(client, "invoice_items", organizationId)
  ]);
  const invoiceItemRows = fetched[fetched.length - 1] as RemoteVersionedRow[];
  const rowsByEntity = new Map<SyncEntityType, RemoteVersionedRow[]>(
    (fetched.slice(0, -1) as Array<readonly [SyncEntityType, RemoteVersionedRow[]]>)
  );
  const rows = (entityType: SyncEntityType) => rowsByEntity.get(entityType) ?? [];
  const active = (entityType: SyncEntityType) => activeRows(rows(entityType));
  const localIdMap = (entityType: SyncEntityType) => new Map(
    active(entityType).map((row) => [String(row.id ?? ""), localIdFromRow(entityType, row)])
  );

  const customerIds = localIdMap("customer");
  const invoiceIds = localIdMap("invoice");
  const expenseIds = localIdMap("expense");
  const activeInvoiceRemoteIds = new Set(active("invoice").map((row) => String(row.id)));
  const activeExpenseRemoteIds = new Set(active("expense").map((row) => String(row.id)));
  const itemsByInvoice = new Map<string, RemoteVersionedRow[]>();
  for (const row of activeRows(invoiceItemRows)) {
    const invoiceId = String(row.invoice_id ?? "");
    if (!activeInvoiceRemoteIds.has(invoiceId)) continue;
    const group = itemsByInvoice.get(invoiceId) ?? [];
    group.push(row);
    itemsByInvoice.set(invoiceId, group);
  }
  for (const group of itemsByInvoice.values()) {
    group.sort((left, right) => Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0));
  }

  const customers = active("customer").map(customerFromRemote);
  const invoices = active("invoice").map((row) => invoiceFromRemote({
    ...row,
    customer_local_id: customerIds.get(String(row.customer_id ?? "")),
    cancelled_invoice_local_id: invoiceIds.get(String(row.cancelled_invoice_id ?? "")),
    correction_invoice_local_id: invoiceIds.get(String(row.correction_invoice_id ?? ""))
  }, itemsByInvoice.get(String(row.id)) ?? []));
  const payments = active("payment")
    .filter((row) => activeInvoiceRemoteIds.has(String(row.invoice_id ?? "")))
    .map((row) => paymentFromRemote({
      ...row,
      invoice_local_id: invoiceIds.get(String(row.invoice_id ?? ""))
    }));
  const expenses = active("expense").map(expenseFromRemote);
  const recurringExpenses = active("recurringExpense").map(recurringExpenseFromRemote);
  const serviceTemplates = active("serviceTemplate").map(templateFromRemote);
  const importLogs = active("importLog").map(importLogFromRemote);
  const companyRow = active("company")[0];
  const company = companyRow ? companyFromRemote(companyRow) : undefined;

  const currentAttachmentMetadata = new Map(
    (await db.syncMetadata.where("[organizationId+entityType]").equals([organizationId, "attachment"]).toArray())
      .map((item) => [item.id, item])
  );
  const currentAttachments = new Map((await db.attachments.toArray()).map((item) => [item.id, item]));
  const attachments: Attachment[] = [];
  for (const row of active("attachment")) {
    const ownerType = row.owner_type === "invoice" ? "invoice" : "expense";
    const ownerRemoteId = String(row.owner_id ?? "");
    if (ownerType === "invoice" && !activeInvoiceRemoteIds.has(ownerRemoteId)) continue;
    if (ownerType === "expense" && !activeExpenseRemoteIds.has(ownerRemoteId)) continue;
    const id = localIdFromRow("attachment", row);
    const ownerId = ownerType === "invoice" ? invoiceIds.get(ownerRemoteId) : expenseIds.get(ownerRemoteId);
    if (!id || !ownerId) continue;
    const key = syncRecordKey(organizationId, "attachment", id);
    const known = currentAttachmentMetadata.get(key);
    const cached = currentAttachments.get(id);
    const unchanged = cached
      && known?.remoteVersion === remoteVersion(row)
      && known.remoteUpdatedAt === remoteUpdatedAt(row)
      && cached.size === Number(row.size_bytes ?? cached.size);
    let blob = cached?.blob;
    if (!unchanged || !blob) {
      const bucket = String(row.bucket ?? "");
      const objectPath = String(row.object_path ?? "");
      const { data, error } = await client.storage.from(bucket).download(objectPath);
      if (error) throw error;
      blob = data;
    }
    attachments.push(attachmentFromRemote({ ...row, owner_local_id: ownerId }, blob));
  }

  const recordMaps = new Map<SyncEntityType, Map<string, LocalRecord>>([
    ["company", new Map(company ? [["company", company]] : [])],
    ["customer", new Map(customers.map((record) => [record.id, record]))],
    ["invoice", new Map(invoices.map((record) => [record.id, record]))],
    ["payment", new Map(payments.map((record) => [record.id, record]))],
    ["expense", new Map(expenses.map((record) => [record.id, record]))],
    ["recurringExpense", new Map(recurringExpenses.map((record) => [record.id, record]))],
    ["serviceTemplate", new Map(serviceTemplates.map((record) => [record.id, record]))],
    ["importLog", new Map(importLogs.map((record) => [record.id, record]))],
    ["attachment", new Map(attachments.map((record) => [record.id, record]))]
  ]);
  const metadata: SyncMetadata[] = [];
  for (const [entityType] of entries) {
    for (const row of rows(entityType)) {
      const entityId = localIdFromRow(entityType, row);
      if (!entityId) continue;
      const bundle: RemoteRecordBundle = entityType === "invoice"
        ? { table: "invoices", row, childRows: [{ table: "invoice_items", rows: itemsByInvoice.get(String(row.id)) ?? [] }] }
        : { table: tableForEntity[entityType], row };
      metadata.push(metadataFor(
        organizationId,
        entityType,
        entityId,
        row,
        await bundleHash(bundle),
        recordMaps.get(entityType)?.get(entityId)
      ));
    }
  }

  return {
    company,
    customers,
    invoices,
    payments,
    expenses,
    recurringExpenses,
    serviceTemplates,
    importLogs,
    attachments,
    metadata,
    downloaded: entries.reduce((sum, [entityType]) => sum + rows(entityType).length, invoiceItemRows.length)
  };
}

async function recordSyncRun(log: SyncRunLog): Promise<void> {
  await db.syncLogs.put(log);
  const history = await db.syncLogs.where("organizationId").equals(log.organizationId).sortBy("startedAt");
  const obsolete = history.slice(0, Math.max(0, history.length - 50)).map((item) => item.id);
  if (obsolete.length) await db.syncLogs.bulkDelete(obsolete);
}

export class CloudSyncService {
  private channel?: RealtimeChannel;
  private running?: Promise<void>;
  private stopped = false;
  private migrationAuthorized = false;
  private unsubscribeLocalChanges?: () => void;
  private realtimeRefreshTimer?: ReturnType<typeof setTimeout>;
  private rerunRequested = false;
  private rerunTrigger: SyncTrigger = "realtime";
  private readonly onlineHandler = () => { void this.syncNow("online"); };
  private readonly focusHandler = () => { if (document.visibilityState === "visible") void this.syncNow("focus"); };
  private readonly visibilityHandler = () => { if (document.visibilityState === "visible") void this.syncNow("focus"); };

  constructor(readonly organizationId: string, private readonly client: Client) {}

  async start(): Promise<void> {
    this.stopped = false;
    installLocalChangeCapture();
    await this.waitForLocalInitialization();
    if (this.stopped) return;
    const gate = await db.settings.get(`cloudMigration:${this.organizationId}`);
    const storedGate = gate?.value && typeof gate.value === "object" ? gate.value as { authorizedAt?: string; completedAt?: string } : undefined;
    const businessRecords = await this.localBusinessRecordCount();
    this.migrationAuthorized = Boolean(storedGate?.authorizedAt) || businessRecords === 0;
    if (businessRecords === 0 && !storedGate?.authorizedAt) {
      const timestamp = new Date().toISOString();
      await db.settings.put({ key: `cloudMigration:${this.organizationId}`, value: { authorizedAt: timestamp, completedAt: timestamp, reason: "empty-device" } });
    }
    await recoverInterruptedChanges(this.organizationId);
    setActiveSyncOrganization(this.organizationId);
    this.unsubscribeLocalChanges = subscribeLocalChanges(() => { void this.syncNow("local_change"); });
    if (typeof window !== "undefined") {
      window.addEventListener("online", this.onlineHandler);
      window.addEventListener("focus", this.focusHandler);
      document.addEventListener("visibilitychange", this.visibilityHandler);
    }
    if (!this.migrationAuthorized) {
      const pending = await db.syncQueue.where("organizationId").equals(this.organizationId).count();
      publishProgress({ state: "idle", pending, message: "Lokale Daten warten auf Backup und bestätigte Cloud-Übernahme." });
      return;
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      const pending = await db.syncQueue.where("organizationId").equals(this.organizationId).count();
      publishProgress({ state: "offline", pending, message: "Offline – Änderungen bleiben sicher auf diesem Gerät." });
      return;
    }
    if (!storedGate?.completedAt) await enqueueLocalSnapshot(this.organizationId);
    await this.syncNow(storedGate?.completedAt ? "startup" : "migration");
    if (this.stopped) return;
    if (!storedGate?.completedAt && storedGate?.authorizedAt) {
      await this.completeMigrationGateIfSettled(storedGate.authorizedAt);
    }
    this.subscribeRealtime();
  }

  stop(): void {
    this.stopped = true;
    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.onlineHandler);
      window.removeEventListener("focus", this.focusHandler);
      document.removeEventListener("visibilitychange", this.visibilityHandler);
    }
    if (this.realtimeRefreshTimer) clearTimeout(this.realtimeRefreshTimer);
    this.realtimeRefreshTimer = undefined;
    if (this.channel) void this.client.removeChannel(this.channel);
    this.channel = undefined;
    this.unsubscribeLocalChanges?.();
    this.unsubscribeLocalChanges = undefined;
  }

  async pullRemoteChanges(): Promise<{ downloaded: number; changed: number; deleted: number }> {
    const snapshot = await loadCloudSnapshot(this.client, this.organizationId);
    if (this.stopped) return { downloaded: snapshot.downloaded, changed: 0, deleted: 0 };
    const result = await reconcileCloudSnapshot(this.organizationId, snapshot);

    for (const entityId of result.preservedFinalizedInvoices) {
      const [local, metadata] = await Promise.all([
        db.invoices.get(entityId),
        db.syncMetadata.get(syncRecordKey(this.organizationId, "invoice", entityId))
      ]);
      await recordSyncConflict({
        organizationId: this.organizationId,
        entityType: "invoice",
        entityId,
        remoteId: metadata?.remoteId ?? "",
        reason: "invalid_remote_data",
        localValue: local,
        remoteValue: { missingFromCompleteCloudSnapshot: true },
        localUpdatedAt: local?.updatedAt,
        remoteUpdatedAt: metadata?.remoteUpdatedAt,
        remoteVersion: metadata?.remoteVersion
      });
    }

    const activeInvoiceIds = new Set(snapshot.invoices.map((invoice) => invoice.id));
    const restoredIntegrityConflicts = (await db.syncConflicts
      .where("[organizationId+status]").equals([this.organizationId, "open"]).toArray())
      .filter((conflict) => conflict.reason === "invalid_remote_data" && activeInvoiceIds.has(conflict.entityId));
    if (restoredIntegrityConflicts.length) {
      const resolvedAt = new Date().toISOString();
      await Promise.all(restoredIntegrityConflicts.map((conflict) =>
        db.syncConflicts.update(conflict.id, { status: "resolved", resolvedAt })
      ));
    }
    return { downloaded: snapshot.downloaded, changed: result.changed, deleted: result.deleted };
  }

  async refreshFromCloud(trigger: SyncTrigger = "manual"): Promise<void> {
    await this.syncNow(trigger);
  }

  async syncNow(trigger: SyncTrigger = "manual"): Promise<void> {
    if (!this.migrationAuthorized) {
      const pending = await db.syncQueue.where("organizationId").equals(this.organizationId).count();
      publishProgress({ state: "idle", pending, message: "Vor dem ersten Cloud-Abgleich bitte Backup und Datenübernahme bestätigen." });
      return;
    }
    if (this.running) {
      this.rerunRequested = true;
      this.rerunTrigger = trigger;
      return this.running;
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      publishProgress({ state: "offline", message: "Offline – Änderungen bleiben sicher auf diesem Gerät." });
      return;
    }
    this.running = (async () => {
      let nextTrigger = trigger;
      do {
        this.rerunRequested = false;
        await this.runSync(nextTrigger);
        nextTrigger = this.rerunTrigger;
      } while (this.rerunRequested && !this.stopped);
    })();
    try { await this.running; }
    finally { this.running = undefined; }
  }

  private async runSync(trigger: SyncTrigger): Promise<void> {
    const startedAt = new Date().toISOString();
    const startedMs = Date.now();
    publishProgress({ state: "syncing", message: undefined });
    let uploaded = 0;
    let downloaded = 0;
    let changed = 0;
    let deleted = 0;
    try {
      uploaded = await this.flushUploads();
      if (this.stopped) return;
      const snapshotResult = await this.pullRemoteChanges();
      downloaded = snapshotResult.downloaded;
      changed = snapshotResult.changed;
      deleted = snapshotResult.deleted;
      const [pending, conflicts, failed] = await Promise.all([
        db.syncQueue.where("organizationId").equals(this.organizationId).count(),
        db.syncConflicts.where("[organizationId+status]").equals([this.organizationId, "open"]).count(),
        db.syncQueue.where("organizationId").equals(this.organizationId).filter((entry) => entry.status === "failed").count()
      ]);
      const finishedAt = new Date().toISOString();
      await recordSyncRun({
        id: crypto.randomUUID(),
        organizationId: this.organizationId,
        trigger,
        startedAt,
        finishedAt,
        durationMs: Date.now() - startedMs,
        downloaded,
        uploaded,
        changed,
        deleted,
        conflicts,
        failed
      });
      publishProgress({
        state: "idle",
        pending,
        conflicts,
        lastSyncedAt: finishedAt,
        message: pending ? "Einige Änderungen werden später erneut versucht." : undefined
      });
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : "Synchronisierung fehlgeschlagen.";
      const [conflicts, failed] = await Promise.all([
        db.syncConflicts.where("[organizationId+status]").equals([this.organizationId, "open"]).count(),
        db.syncQueue.where("organizationId").equals(this.organizationId).filter((entry) => entry.status === "failed").count()
      ]);
      const finishedAt = new Date().toISOString();
      try {
        await recordSyncRun({
          id: crypto.randomUUID(),
          organizationId: this.organizationId,
          trigger,
          startedAt,
          finishedAt,
          durationMs: Date.now() - startedMs,
          downloaded,
          uploaded,
          changed,
          deleted,
          conflicts,
          failed,
          error
        });
      } catch {
        // A diagnostics write must never hide the original sync failure.
      }
      publishProgress({ state: "error", conflicts, message: error });
      throw cause;
    }
  }

  private async flushUploads(): Promise<number> {
    let completed = 0;
    while (!this.stopped) {
      const batch = (await claimPendingChanges(this.organizationId)).sort((a, b) => priority[a.entityType] - priority[b.entityType]);
      if (!batch.length) break;
      for (const entry of batch) {
        try {
          await uploadEntry(this.client, entry);
          if (!await db.syncQueue.get(entry.id)) completed += 1;
        } catch (cause) {
          await markSyncFailed(entry.id, cause);
        }
      }
    }
    return completed;
  }

  async useCloudData(): Promise<void> {
    const authorizedAt = new Date().toISOString();
    this.migrationAuthorized = true;
    await replaceLocalCacheWithCloud();
    await db.settings.put({
      key: `cloudMigration:${this.organizationId}`,
      value: { authorizedAt, completedAt: authorizedAt, reason: "cloud-preferred" }
    });
    await this.syncNow("migration");
    if (!this.channel) this.subscribeRealtime();
  }

  async migrateLocalData(): Promise<number> {
    const authorizedAt = new Date().toISOString();
    this.migrationAuthorized = true;
    await db.settings.put({ key: `cloudMigration:${this.organizationId}`, value: { authorizedAt } });
    const queued = await enqueueLocalSnapshot(this.organizationId);
    await this.syncNow("migration");
    if (!this.channel) this.subscribeRealtime();
    await this.completeMigrationGateIfSettled(authorizedAt);
    return queued;
  }

  private async completeMigrationGateIfSettled(authorizedAt: string): Promise<void> {
    const [pending, conflicts] = await Promise.all([
      db.syncQueue.where("organizationId").equals(this.organizationId).count(),
      db.syncConflicts.where("[organizationId+status]").equals([this.organizationId, "open"]).count()
    ]);
    if (pending === 0 && conflicts === 0) {
      await db.settings.put({ key: `cloudMigration:${this.organizationId}`, value: { authorizedAt, completedAt: new Date().toISOString() } });
    }
  }

  isMigrationAuthorized(): boolean { return this.migrationAuthorized; }

  private async localBusinessRecordCount(): Promise<number> {
    const counts = await Promise.all([
      db.customers.count(), db.invoices.count(), db.payments.count(), db.expenses.count(),
      db.recurringExpenses.count(), db.serviceTemplates.count(), db.importLogs.count(), db.attachments.count()
    ]);
    return counts.reduce((sum, count) => sum + count, 0);
  }

  private async waitForLocalInitialization(): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (await db.settings.get("historicalSeedV1")) return;
      await new Promise<void>((resolve) => setTimeout(resolve, 20));
      if (this.stopped) return;
    }
  }

  private subscribeRealtime(): void {
    if (this.channel) return;
    const channel = this.client.channel(`organization-sync:${this.organizationId}`);
    const tables = [...Object.values(tableForEntity), "invoice_items"];
    for (const table of tables) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `organization_id=eq.${this.organizationId}` },
        () => this.scheduleRealtimeRefresh()
      );
    }
    this.channel = channel.subscribe();
  }

  private scheduleRealtimeRefresh(): void {
    if (this.stopped) return;
    if (this.realtimeRefreshTimer) clearTimeout(this.realtimeRefreshTimer);
    this.realtimeRefreshTimer = setTimeout(() => {
      this.realtimeRefreshTimer = undefined;
      void this.syncNow("realtime");
    }, 250);
  }
}

let activeService: CloudSyncService | undefined;
let unregisterOperations: (() => void) | undefined;
let unsubscribeRuntimeProgress: (() => void) | undefined;

async function operationResult(organizationId: string, message: string) {
  const [pending, conflicts] = await Promise.all([
    db.syncQueue.where("organizationId").equals(organizationId).count(),
    db.syncConflicts.where("[organizationId+status]").equals([organizationId, "open"]).count()
  ]);
  const current = getSyncProgress();
  if (current.state === "error") throw new Error(current.message || "Cloud-Abgleich fehlgeschlagen.");
  return {
    status: "completed" as const,
    message: conflicts ? `${message} ${conflicts} Konflikt(e) benötigen eine Entscheidung.` : message,
    pendingChanges: pending,
    lastSyncedAt: current.lastSyncedAt
  };
}

function connectCloudOperations(service: CloudSyncService, organizationId: string): void {
  unregisterOperations?.();
  unsubscribeRuntimeProgress?.();
  unregisterOperations = registerCloudOperationHandlers({
    syncNow: async () => {
      await service.refreshFromCloud();
      if (!service.isMigrationAuthorized()) return { status: "unavailable", message: "Vor dem ersten Cloud-Abgleich bitte Backup und Datenübernahme bestätigen." };
      return operationResult(organizationId, "Cloud-Abgleich abgeschlossen.");
    },
    migrateLocalData: async () => {
      const queued = await service.migrateLocalData();
      return operationResult(organizationId, `${queued} lokale Datensätze wurden für die sichere Übernahme geprüft.`);
    },
    useCloudData: async () => {
      await service.useCloudData();
      return operationResult(organizationId, "Der bestätigte Cloud-Datenstand wurde auf diesem Gerät geladen. Das Sicherheitsbackup bleibt als Rückweg erhalten.");
    }
  });
  unsubscribeRuntimeProgress = subscribeSyncProgress((next) => {
    reportCloudRuntimeStatus({
      online: typeof navigator === "undefined" ? next.state !== "offline" : navigator.onLine,
      phase: next.state === "syncing" ? "syncing" : next.state === "error" ? "error" : next.pending ? "pending" : next.lastSyncedAt ? "success" : "idle",
      pendingChanges: next.pending,
      lastSyncedAt: next.lastSyncedAt,
      lastError: next.state === "error" ? next.message : undefined
    });
  });
}

export async function startCloudSync(organizationId: string): Promise<CloudSyncService | undefined> {
  if (!supabase) return undefined;
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error("Die Cloud-Sitzung ist abgelaufen. Bitte erneut anmelden.");
  }
  await supabase.realtime.setAuth(data.session.access_token);
  activeService?.stop();
  const service = new CloudSyncService(organizationId, supabase);
  activeService = service;
  await service.start();
  if (activeService !== service) { service.stop(); return undefined; }
  connectCloudOperations(service, organizationId);
  return service;
}

export function stopCloudSync(): void {
  activeService?.stop();
  activeService = undefined;
  setActiveSyncOrganization(undefined);
  unregisterOperations?.(); unregisterOperations = undefined;
  unsubscribeRuntimeProgress?.(); unsubscribeRuntimeProgress = undefined;
}

export async function syncNow(): Promise<void> {
  await activeService?.syncNow();
}

export async function migrateLocalData(organizationId: string): Promise<number> {
  if (activeService?.organizationId === organizationId) return activeService.migrateLocalData();
  return enqueueLocalSnapshot(organizationId);
}

export async function resolveCloudConflict(
  conflictId: string,
  resolution: "use_local" | "use_remote"
): Promise<void> {
  await resolveSyncConflict(conflictId, resolution);
  if (!activeService) return;
  await activeService.syncNow("manual");
}
