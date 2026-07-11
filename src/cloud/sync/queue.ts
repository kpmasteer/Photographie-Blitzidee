import { db } from "../../db";
import { conflictRecordKey, syncRecordKey } from "./identity";
import type { SyncConflict, SyncEntityType, SyncOperation, SyncQueueEntry } from "./types";

const nowIso = () => new Date().toISOString();

export function retryDelayMs(attempts: number): number {
  return Math.min(5 * 60_000, 1_000 * (2 ** Math.min(Math.max(attempts, 0), 8)));
}

export async function enqueueSyncChange(
  organizationId: string,
  entityType: SyncEntityType,
  entityId: string,
  operation: SyncOperation = "upsert"
): Promise<SyncQueueEntry> {
  const dedupeKey = syncRecordKey(organizationId, entityType, entityId);
  const timestamp = nowIso();
  return db.transaction("rw", db.syncQueue, async () => {
    const existing = await db.syncQueue.where("dedupeKey").equals(dedupeKey).first();
    if (existing) {
      const next: SyncQueueEntry = {
        ...existing,
        operation,
        status: "pending",
        attempts: existing.status === "syncing" ? existing.attempts : 0,
        updatedAt: timestamp,
        nextAttemptAt: timestamp,
        lastError: undefined
      };
      await db.syncQueue.put(next);
      return next;
    }
    const entry: SyncQueueEntry = {
      id: crypto.randomUUID(), dedupeKey, organizationId, entityType, entityId, operation,
      status: "pending", attempts: 0, createdAt: timestamp, updatedAt: timestamp, nextAttemptAt: timestamp
    };
    await db.syncQueue.add(entry);
    return entry;
  });
}

export async function claimPendingChanges(organizationId: string, limit = 25, timestamp = nowIso()): Promise<SyncQueueEntry[]> {
  return db.transaction("rw", db.syncQueue, async () => {
    const candidates = (await db.syncQueue.where("organizationId").equals(organizationId).toArray())
      .filter((entry) => (entry.status === "pending" || entry.status === "failed") && entry.nextAttemptAt <= timestamp)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, limit);
    const claimedAt = nowIso();
    await Promise.all(candidates.map((entry) => db.syncQueue.update(entry.id, {
      status: "syncing",
      attempts: entry.attempts + 1,
      updatedAt: claimedAt
    })));
    return candidates.map((entry) => ({ ...entry, status: "syncing", attempts: entry.attempts + 1, updatedAt: claimedAt }));
  });
}

export async function recoverInterruptedChanges(organizationId: string): Promise<number> {
  const timestamp = nowIso();
  return db.syncQueue.where("organizationId").equals(organizationId).filter((entry) => entry.status === "syncing").modify({
    status: "pending",
    updatedAt: timestamp,
    nextAttemptAt: timestamp,
    lastError: "Vorheriger Abgleich wurde unterbrochen und sicher wiederaufgenommen."
  });
}

export async function markSyncComplete(entryId: string): Promise<void> {
  await db.syncQueue.delete(entryId);
}

export async function markSyncFailed(entryId: string, cause: unknown): Promise<void> {
  const entry = await db.syncQueue.get(entryId);
  if (!entry) return;
  const timestamp = nowIso();
  const message = cause instanceof Error ? cause.message : String(cause);
  await db.syncQueue.update(entryId, {
    status: "failed",
    updatedAt: timestamp,
    nextAttemptAt: new Date(Date.now() + retryDelayMs(entry.attempts)).toISOString(),
    lastError: message.slice(0, 1_000)
  });
}

export async function recordSyncConflict(input: Omit<SyncConflict, "id" | "conflictKey" | "status" | "createdAt">): Promise<SyncConflict> {
  const conflictKey = conflictRecordKey(input.organizationId, input.entityType, input.entityId, input.remoteVersion);
  const existing = await db.syncConflicts.where("conflictKey").equals(conflictKey).first();
  const queue = await db.syncQueue.where("dedupeKey").equals(syncRecordKey(input.organizationId, input.entityType, input.entityId)).first();
  if (queue) await db.syncQueue.update(queue.id, { status: "conflict", updatedAt: nowIso(), lastError: "Konkurrierende Änderung erkannt." });
  if (existing) return existing;
  const conflict: SyncConflict = {
    ...input,
    id: crypto.randomUUID(),
    conflictKey,
    status: "open",
    createdAt: nowIso()
  };
  await db.syncConflicts.add(conflict);
  return conflict;
}

export async function resolveSyncConflict(conflictId: string, resolution: "use_local" | "use_remote"): Promise<void> {
  const conflict = await db.syncConflicts.get(conflictId);
  if (!conflict || conflict.status === "resolved") return;
  const timestamp = nowIso();
  await db.syncConflicts.update(conflictId, { status: "resolved", resolvedAt: timestamp });
  if (resolution === "use_local") {
    const metadataId = syncRecordKey(conflict.organizationId, conflict.entityType, conflict.entityId);
    const metadata = await db.syncMetadata.get(metadataId);
    if (metadata && conflict.remoteVersion != null) {
      await db.syncMetadata.update(metadataId, {
        remoteVersion: conflict.remoteVersion,
        remoteUpdatedAt: conflict.remoteUpdatedAt,
        lastSyncedHash: undefined
      });
    }
    await enqueueSyncChange(conflict.organizationId, conflict.entityType, conflict.entityId);
  }
  else {
    const queue = await db.syncQueue.where("dedupeKey").equals(syncRecordKey(conflict.organizationId, conflict.entityType, conflict.entityId)).first();
    if (queue) await db.syncQueue.delete(queue.id);
  }
}
