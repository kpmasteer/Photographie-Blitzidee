export const SYNC_ENTITY_TYPES = [
  "company",
  "customer",
  "invoice",
  "payment",
  "expense",
  "recurringExpense",
  "serviceTemplate",
  "importLog",
  "attachment"
] as const;

export type SyncEntityType = (typeof SYNC_ENTITY_TYPES)[number];
export type SyncOperation = "upsert" | "delete";
export type SyncQueueStatus = "pending" | "syncing" | "conflict" | "failed";

export interface SyncQueueEntry {
  id: string;
  /** Stable, unique key used to coalesce repeated edits of one record. */
  dedupeKey: string;
  organizationId: string;
  entityType: SyncEntityType;
  entityId: string;
  operation: SyncOperation;
  status: SyncQueueStatus;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  nextAttemptAt: string;
  lastError?: string;
}

export interface SyncMetadata {
  id: string;
  organizationId: string;
  entityType: SyncEntityType;
  entityId: string;
  remoteId: string;
  remoteVersion: number;
  remoteUpdatedAt?: string;
  localUpdatedAt?: string;
  lastSyncedHash?: string;
  lastSyncedAt: string;
  deletedAt?: string;
}

export type SyncConflictStatus = "open" | "use_local" | "use_remote" | "resolved";

export interface SyncConflict {
  id: string;
  conflictKey: string;
  organizationId: string;
  entityType: SyncEntityType;
  entityId: string;
  remoteId: string;
  reason: "concurrent_change" | "remote_deleted" | "invalid_remote_data";
  localValue?: unknown;
  remoteValue?: unknown;
  localUpdatedAt?: string;
  remoteUpdatedAt?: string;
  remoteVersion?: number;
  status: SyncConflictStatus;
  createdAt: string;
  resolvedAt?: string;
}

export interface RemoteVersionedRow {
  id?: string;
  organization_id: string;
  version?: number;
  updated_at?: string;
  deleted_at?: string | null;
  [key: string]: unknown;
}

export interface RemoteRecordBundle {
  table: string;
  row: RemoteVersionedRow;
  childRows?: Array<{ table: string; rows: RemoteVersionedRow[] }>;
}

export interface SyncProgress {
  state: "idle" | "syncing" | "offline" | "error";
  pending: number;
  conflicts: number;
  lastSyncedAt?: string;
  message?: string;
}
