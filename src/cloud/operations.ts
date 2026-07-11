import type { LocalMigrationPreview } from "./localMigration";

export type CloudRuntimePhase = "idle" | "pending" | "syncing" | "success" | "error";

export interface CloudRuntimeStatus {
  online: boolean;
  phase: CloudRuntimePhase;
  pendingChanges: number;
  lastSyncedAt?: string;
  lastAttemptAt?: string;
  lastError?: string;
}

export interface CloudOperationResult {
  status: "completed" | "unavailable";
  message: string;
  pendingChanges?: number;
  lastSyncedAt?: string;
}

export interface LocalMigrationRequest {
  preview: LocalMigrationPreview;
  backupCreatedAt: string;
  confirmationText: string;
  confirmed: true;
}

export interface CloudOperationHandlers {
  syncNow?: () => Promise<CloudOperationResult>;
  migrateLocalData?: (request: LocalMigrationRequest) => Promise<CloudOperationResult>;
}

export const MIGRATION_CONFIRMATION_TEXT = "DATEN ÜBERNEHMEN";

const STORAGE_KEY = "blitzidee-cloud-runtime-status";
const listeners = new Set<() => void>();
let handlers: CloudOperationHandlers = {};

function loadStatus(): CloudRuntimeStatus {
  const fallback: CloudRuntimeStatus = {
    online: typeof navigator === "undefined" ? true : navigator.onLine,
    phase: "idle",
    pendingChanges: 0
  };
  if (typeof localStorage === "undefined") return fallback;
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as Partial<CloudRuntimeStatus>;
    return {
      ...fallback,
      pendingChanges: Number.isFinite(stored.pendingChanges) ? Math.max(0, Number(stored.pendingChanges)) : 0,
      lastSyncedAt: typeof stored.lastSyncedAt === "string" ? stored.lastSyncedAt : undefined,
      lastAttemptAt: typeof stored.lastAttemptAt === "string" ? stored.lastAttemptAt : undefined,
      lastError: typeof stored.lastError === "string" ? stored.lastError : undefined
    };
  } catch {
    return fallback;
  }
}

let runtimeStatus = loadStatus();

function persistStatus() {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      pendingChanges: runtimeStatus.pendingChanges,
      lastSyncedAt: runtimeStatus.lastSyncedAt,
      lastAttemptAt: runtimeStatus.lastAttemptAt,
      lastError: runtimeStatus.lastError
    }));
  } catch {
    // Status persistence must never prevent the app from working in private mode.
  }
}

export function getCloudRuntimeStatus() {
  return runtimeStatus;
}

export function subscribeCloudRuntimeStatus(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function reportCloudRuntimeStatus(update: Partial<CloudRuntimeStatus>) {
  runtimeStatus = {
    ...runtimeStatus,
    ...update,
    pendingChanges: Math.max(0, update.pendingChanges ?? runtimeStatus.pendingChanges)
  };
  persistStatus();
  listeners.forEach((listener) => listener());
}

export function setCloudConnectivity(online: boolean) {
  reportCloudRuntimeStatus({ online });
}

/**
 * Integration point for the sync engine. Registering only wires capabilities;
 * it never starts a write operation by itself.
 */
export function registerCloudOperationHandlers(next: CloudOperationHandlers) {
  handlers = next;
  return () => {
    if (handlers === next) handlers = {};
  };
}

export async function requestManualSync(): Promise<CloudOperationResult> {
  if (!runtimeStatus.online) return { status: "unavailable", message: "Keine Internetverbindung. Die lokalen Daten bleiben erhalten." };
  if (!handlers.syncNow) return { status: "unavailable", message: "Der Cloud-Abgleich wird gerade vorbereitet und ist noch nicht verbunden." };
  const lastAttemptAt = new Date().toISOString();
  reportCloudRuntimeStatus({ phase: "syncing", lastAttemptAt, lastError: undefined });
  try {
    const result = await handlers.syncNow();
    const pendingChanges = result.pendingChanges ?? runtimeStatus.pendingChanges;
    const lastSyncedAt = result.lastSyncedAt ?? (pendingChanges === 0 ? new Date().toISOString() : runtimeStatus.lastSyncedAt);
    reportCloudRuntimeStatus({
      phase: pendingChanges > 0 ? "pending" : "success",
      pendingChanges,
      lastSyncedAt,
      lastError: undefined
    });
    return { ...result, pendingChanges, lastSyncedAt };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Der Cloud-Abgleich ist fehlgeschlagen.";
    reportCloudRuntimeStatus({ phase: "error", lastError: message });
    throw new Error(message);
  }
}

export async function requestLocalMigration(request: LocalMigrationRequest): Promise<CloudOperationResult> {
  if (!request.confirmed || request.confirmationText !== MIGRATION_CONFIRMATION_TEXT) {
    throw new Error("Die Cloud-Übernahme wurde nicht ausdrücklich bestätigt.");
  }
  if (!request.backupCreatedAt) throw new Error("Vor der Cloud-Übernahme muss ein aktuelles Backup erstellt werden.");
  if (!runtimeStatus.online) return { status: "unavailable", message: "Keine Internetverbindung. Es wurden keine Cloud-Daten verändert." };
  if (!handlers.migrateLocalData) return { status: "unavailable", message: "Die Cloud-Übernahme ist noch nicht mit dem Synchronisationsdienst verbunden." };
  return handlers.migrateLocalData(request);
}
