import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db";
import { installLocalChangeCapture, setActiveSyncOrganization, withRemoteWriteSuppressed } from "./localChanges";

const organizationId = "11111111-1111-4111-8111-111111111111";
const customer = {
  id: "customer_hook", customerNumber: "K-0042", firstName: "Hook", lastName: "Test", street: "Testweg 1",
  postalCode: "26683", city: "Saterland", country: "Deutschland", archived: false,
  createdAt: "2026-07-11T10:00:00.000Z", updatedAt: "2026-07-11T10:00:00.000Z"
};

beforeEach(async () => {
  await db.open();
  installLocalChangeCapture();
  setActiveSyncOrganization(undefined);
  await db.transaction("rw", [db.customers, db.syncQueue], async () => {
    await db.customers.clear();
    await db.syncQueue.clear();
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  await db.syncQueue.clear();
  setActiveSyncOrganization(organizationId);
});

afterEach(() => setActiveSyncOrganization(undefined));

describe("automatische Änderungserfassung", () => {
  it("stellt lokale Schreibvorgänge nach dem Commit in die Queue", async () => {
    await db.customers.put(customer);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(await db.syncQueue.toCollection().first()).toMatchObject({ entityType: "customer", entityId: customer.id, operation: "upsert" });
  });

  it("unterdrückt Rückschleifen beim Anwenden von Remote-Daten", async () => {
    await withRemoteWriteSuppressed(() => db.customers.put(customer));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(await db.syncQueue.count()).toBe(0);
  });
});
