import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db";
import { claimPendingChanges, enqueueSyncChange, markSyncFailed, recordSyncConflict, recoverInterruptedChanges, resolveSyncConflict } from "./queue";

const organizationId = "11111111-1111-4111-8111-111111111111";

beforeEach(async () => {
  await db.open();
  await db.transaction("rw", [db.syncQueue, db.syncMetadata, db.syncConflicts], async () => {
    await Promise.all([db.syncQueue.clear(), db.syncMetadata.clear(), db.syncConflicts.clear()]);
  });
});

describe("lokale Sync-Queue", () => {
  it("fasst mehrere Änderungen desselben Datensatzes zusammen", async () => {
    const first = await enqueueSyncChange(organizationId, "invoice", "invoice_1");
    const second = await enqueueSyncChange(organizationId, "invoice", "invoice_1", "delete");
    expect(second.id).toBe(first.id);
    expect(second.operation).toBe("delete");
    expect(await db.syncQueue.count()).toBe(1);
  });

  it("beansprucht Einträge atomar und plant Fehler mit Backoff neu", async () => {
    const queued = await enqueueSyncChange(organizationId, "customer", "customer_1");
    const [claimed] = await claimPendingChanges(organizationId);
    expect(claimed?.status).toBe("syncing");
    expect(claimed?.attempts).toBe(1);
    await markSyncFailed(queued.id, new Error("Netzwerk nicht erreichbar"));
    const failed = await db.syncQueue.get(queued.id);
    expect(failed?.status).toBe("failed");
    expect(failed?.lastError).toContain("Netzwerk");
    expect(failed!.nextAttemptAt > failed!.updatedAt).toBe(true);
  });

  it("nimmt nach einem App-Abbruch steckengebliebene Einträge wieder auf", async () => {
    await enqueueSyncChange(organizationId, "customer", "customer_interrupted");
    await claimPendingChanges(organizationId);
    expect((await db.syncQueue.toCollection().first())?.status).toBe("syncing");
    expect(await recoverInterruptedChanges(organizationId)).toBe(1);
    expect((await db.syncQueue.toCollection().first())?.status).toBe("pending");
  });
});

describe("Sync-Konflikte", () => {
  it("speichert denselben Versionskonflikt nur einmal und kann lokal auflösen", async () => {
    await enqueueSyncChange(organizationId, "expense", "expense_1");
    const input = {
      organizationId, entityType: "expense" as const, entityId: "expense_1", remoteId: "22222222-2222-4222-8222-222222222222",
      reason: "concurrent_change" as const, localValue: { totalCents: 100 }, remoteValue: { total_cents: 200 }, remoteVersion: 3
    };
    const first = await recordSyncConflict(input);
    const second = await recordSyncConflict(input);
    expect(second.id).toBe(first.id);
    expect(await db.syncConflicts.count()).toBe(1);
    expect((await db.syncQueue.toCollection().first())?.status).toBe("conflict");
    await resolveSyncConflict(first.id, "use_local");
    expect((await db.syncConflicts.get(first.id))?.status).toBe("resolved");
    expect((await db.syncQueue.toCollection().first())?.status).toBe("pending");
  });
});
