import type { CloudContextValue } from "./context";

/** Wait for Dexie's after-commit hook before asking the sync service to flush. */
const afterLocalCommit = () => new Promise<void>((resolve) => window.setTimeout(resolve, 0));

export async function confirmCloudWrite(cloud: CloudContextValue, subject: string): Promise<string> {
  if (!cloud.configured) return `${subject} lokal gespeichert.`;
  await afterLocalCommit();
  if (!cloud.runtime.online) return `${subject} lokal gespeichert – wird bei bestehender Verbindung synchronisiert.`;
  try {
    const result = await cloud.syncNow();
    if (result.status !== "completed" || (result.pendingChanges ?? 0) > 0) {
      return `${subject} lokal gespeichert – wird synchronisiert.`;
    }
    return `${subject} synchronisiert.`;
  } catch {
    return `${subject} lokal gespeichert – die Cloud wird automatisch erneut versucht.`;
  }
}
