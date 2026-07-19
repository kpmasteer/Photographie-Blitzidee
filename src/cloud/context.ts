import { createContext, useContext } from "react";
import type { Session } from "@supabase/supabase-js";
import { getCloudRuntimeStatus, type CloudOperationResult, type CloudRuntimeStatus } from "./operations";

export type MembershipRole = "owner" | "admin" | "member" | "read_only";
export type Membership = {
  organization_id: string;
  role: MembershipRole;
  organizations?: { name?: string } | null;
};

export const ROLE_LABELS: Record<MembershipRole, string> = {
  owner: "Inhaberin",
  admin: "Administration",
  member: "Mitarbeit",
  read_only: "Nur lesen"
};

export type CloudStatusTone = "local" | "online" | "offline" | "pending" | "syncing" | "error";

export interface CloudContextValue {
  configured: boolean;
  session?: Session;
  membership?: Membership;
  runtime: CloudRuntimeStatus;
  syncStatus: string;
  statusTone: CloudStatusTone;
  roleLabel?: string;
  organizationName?: string;
  signOut: () => Promise<void>;
  changePassword: (nextPassword: string) => Promise<void>;
  syncNow: () => Promise<CloudOperationResult>;
}

export function describeCloudStatus(configured: boolean, session: Session | undefined, runtime: CloudRuntimeStatus) {
  if (!configured) return { label: "Nur auf diesem Gerät", tone: "local" as const };
  if (!session) return { label: "Nicht angemeldet", tone: "local" as const };
  if (!runtime.online) {
    return runtime.pendingChanges > 0
      ? { label: `Offline · ${runtime.pendingChanges} ${runtime.pendingChanges === 1 ? "Änderung wartet" : "Änderungen warten"}`, tone: "offline" as const }
      : { label: "Offline · lokal weiterarbeiten", tone: "offline" as const };
  }
  if (runtime.phase === "syncing") return { label: "Cloud-Abgleich läuft …", tone: "syncing" as const };
  if (runtime.phase === "error") return { label: "Cloud-Abgleich fehlgeschlagen", tone: "error" as const };
  if (runtime.pendingChanges > 0) return {
    label: `${runtime.pendingChanges} ${runtime.pendingChanges === 1 ? "Änderung wartet" : "Änderungen warten"}`,
    tone: "pending" as const
  };
  return { label: runtime.lastSyncedAt ? "Cloud aktuell" : "Cloud verbunden", tone: "online" as const };
}

const defaultRuntime = getCloudRuntimeStatus();
const defaultStatus = describeCloudStatus(false, undefined, defaultRuntime);

export const CloudContext = createContext<CloudContextValue>({
  configured: false,
  runtime: defaultRuntime,
  syncStatus: defaultStatus.label,
  statusTone: defaultStatus.tone,
  signOut: async () => undefined,
  changePassword: async () => undefined,
  syncNow: async () => ({ status: "unavailable", message: "Cloud ist nicht eingerichtet." })
});

export function useCloud() {
  return useContext(CloudContext);
}
