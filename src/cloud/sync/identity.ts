import type { SyncEntityType } from "./types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/**
 * Converts the local, often prefixed string IDs into stable UUIDs.
 *
 * UUIDv8 is intentionally used here: SHA-256 supplies 122 deterministic bits,
 * while the organisation and entity type provide a collision-resistant scope.
 */
export async function stableRemoteId(organizationId: string, entityType: SyncEntityType | "invoiceItem", localId: string): Promise<string> {
  if (isUuid(localId)) return localId.toLowerCase();
  const bytes = new Uint8Array(await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`photographie-blitzidee\u0000${organizationId}\u0000${entityType}\u0000${localId}`)
  )).slice(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x80;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function syncRecordKey(organizationId: string, entityType: SyncEntityType, entityId: string): string {
  return `${organizationId}:${entityType}:${entityId}`;
}

export function conflictRecordKey(organizationId: string, entityType: SyncEntityType, entityId: string, remoteVersion?: number): string {
  return `${syncRecordKey(organizationId, entityType, entityId)}:${remoteVersion ?? "unknown"}`;
}
