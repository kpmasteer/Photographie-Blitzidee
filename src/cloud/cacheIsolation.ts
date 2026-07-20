import { db } from "../db";
import { withRemoteWriteSuppressed } from "./sync/localChanges";

const CACHE_IDENTITY_KEY = "cloudCacheIdentity";

export interface CloudCacheIdentity {
  userId: string;
  organizationId: string;
}

export interface LocalCacheSafety {
  migrationAuthorized: boolean;
  pending: number;
  conflicts: number;
  businessRecords: number;
  safeToClear: boolean;
}

async function businessRecordCount(): Promise<number> {
  const [company, ...counts] = await Promise.all([
    db.company.get("company"),
    db.customers.count(),
    db.invoices.count(),
    db.payments.count(),
    db.expenses.count(),
    db.recurringExpenses.count(),
    db.serviceTemplates.count(),
    db.importLogs.count(),
    db.attachments.count()
  ]);
  return counts.reduce((sum, value) => sum + Number(value), company?.confirmedAt ? 1 : 0);
}

export async function getLocalCacheSafety(organizationId: string): Promise<LocalCacheSafety> {
  const [gate, pending, conflicts, businessRecords] = await Promise.all([
    db.settings.get(`cloudMigration:${organizationId}`),
    db.syncQueue.where("organizationId").equals(organizationId).count(),
    db.syncConflicts.where("[organizationId+status]").equals([organizationId, "open"]).count(),
    businessRecordCount()
  ]);
  const migration = gate?.value && typeof gate.value === "object"
    ? gate.value as { authorizedAt?: string }
    : undefined;
  const migrationAuthorized = Boolean(migration?.authorizedAt);
  return {
    migrationAuthorized,
    pending,
    conflicts,
    businessRecords,
    safeToClear: migrationAuthorized && pending === 0 && conflicts === 0
  };
}

async function clearCache(includeSettings: boolean): Promise<void> {
  const tables = [
    db.company, db.customers, db.invoices, db.payments, db.expenses,
    db.recurringExpenses, db.serviceTemplates, db.attachments, db.auditLogs,
    db.importLogs, db.syncQueue, db.syncMetadata, db.syncConflicts, db.syncLogs,
    ...(includeSettings ? [db.settings] : [])
  ];
  await withRemoteWriteSuppressed(() => db.transaction("rw", tables, async () => {
    await Promise.all(tables.map((table) => table.clear()));
  }));
}

export async function clearLocalAccountCache(): Promise<void> {
  await clearCache(true);
}

export async function replaceLocalCacheWithCloud(): Promise<void> {
  await clearCache(false);
}

export async function prepareLocalCacheIdentity(identity: CloudCacheIdentity): Promise<void> {
  const stored = await db.settings.get(CACHE_IDENTITY_KEY);
  const previous = stored?.value && typeof stored.value === "object"
    ? stored.value as Partial<CloudCacheIdentity>
    : undefined;
  if (!previous?.userId || !previous.organizationId) {
    await db.settings.put({ key: CACHE_IDENTITY_KEY, value: identity });
    return;
  }
  if (previous.userId === identity.userId && previous.organizationId === identity.organizationId) return;

  const safety = await getLocalCacheSafety(previous.organizationId);
  if (!safety.safeToClear && safety.businessRecords > 0) {
    throw new Error("Auf diesem Gerät liegen noch nicht sicher übertragene Daten des vorherigen Kontos. Bitte zuerst mit diesem Konto anmelden, synchronisieren und danach abmelden.");
  }
  if (safety.pending > 0 || safety.conflicts > 0) {
    throw new Error("Ausstehende Änderungen des vorherigen Kontos müssen vor dem Benutzerwechsel synchronisiert oder geklärt werden.");
  }
  await clearLocalAccountCache();
  await db.settings.put({ key: CACHE_IDENTITY_KEY, value: identity });
}
