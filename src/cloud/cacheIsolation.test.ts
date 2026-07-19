import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../db";
import { prepareLocalCacheIdentity } from "./cacheIsolation";
import { setActiveSyncOrganization } from "./sync/localChanges";

const first = { userId: "user-a", organizationId: "org-a" };
const second = { userId: "user-b", organizationId: "org-b" };
const customer = {
  id: "customer-account-a", customerNumber: "K-0001", firstName: "Konto", lastName: "A",
  street: "Testweg 1", postalCode: "26683", city: "Saterland", country: "Deutschland",
  archived: false, createdAt: "2026-07-20T10:00:00.000Z", updatedAt: "2026-07-20T10:00:00.000Z"
};

beforeEach(async () => {
  await db.open();
  setActiveSyncOrganization(undefined);
  await db.transaction("rw", db.tables, async () => {
    await Promise.all(db.tables.map((table) => table.clear()));
  });
});

describe("lokale Kontentrennung", () => {
  it("blockiert den Benutzerwechsel, solange lokale Geschäftsdaten nicht zur Cloud-Übernahme freigegeben sind", async () => {
    await prepareLocalCacheIdentity(first);
    await db.customers.put(customer);

    await expect(prepareLocalCacheIdentity(second)).rejects.toThrow("vorherigen Kontos");
    expect(await db.customers.get(customer.id)).toBeDefined();
    expect((await db.settings.get("cloudCacheIdentity"))?.value).toEqual(first);
  });

  it("entfernt einen vollständig synchronisierten Kontocache vor dem Wechsel", async () => {
    await prepareLocalCacheIdentity(first);
    await db.customers.put(customer);
    await db.settings.put({ key: "cloudMigration:org-a", value: { authorizedAt: "2026-07-20T10:01:00.000Z" } });

    await prepareLocalCacheIdentity(second);

    expect(await db.customers.count()).toBe(0);
    expect((await db.settings.get("cloudCacheIdentity"))?.value).toEqual(second);
  });
});
