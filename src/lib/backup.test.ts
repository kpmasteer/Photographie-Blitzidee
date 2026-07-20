import "fake-indexeddb/auto";
import { File } from "node:buffer";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../db";
import { createBackupBlob, restoreBackup } from "./backup";
import { defaultCompany } from "./seed";

const tables = [db.company, db.customers, db.invoices, db.payments, db.expenses, db.attachments, db.auditLogs, db.importLogs, db.settings, db.syncLogs];

beforeEach(async () => {
  await db.open();
  await db.transaction("rw", tables, async () => Promise.all(tables.map((table) => table.clear())));
  await db.company.put(defaultCompany);
  await db.customers.put({ id: "backup-customer", firstName: "Ada", lastName: "Test", street: "Testweg 1", postalCode: "26683", city: "Saterland", country: "Deutschland", archived: false, createdAt: "2026-07-10", updatedAt: "2026-07-10" });
  await db.attachments.put({ id: "backup-file", ownerType: "expense", ownerId: "expense-1", name: "beleg.txt", mimeType: "text/plain", size: 4, blob: new Blob(["test"], { type: "text/plain" }), createdAt: "2026-07-10" });
});

describe("vollständiges Backup und Restore", () => {
  it("stellt Datensätze und Blob-Anhänge in einer leeren Datenbank wieder her", async () => {
    const { blob } = await createBackupBlob();
    await db.transaction("rw", tables, async () => Promise.all(tables.map((table) => table.clear())));
    await db.syncLogs.put({
      id: "old-device-log", organizationId: "old-organization", trigger: "manual",
      startedAt: "2026-07-20T09:00:00.000Z", finishedAt: "2026-07-20T09:00:01.000Z",
      durationMs: 1_000, downloaded: 1, uploaded: 0, changed: 0, deleted: 0,
      conflicts: 0, failed: 0
    });
    const file = new File([await blob.arrayBuffer()], "backup.json", { type: "application/json" });
    const result = await restoreBackup(file as unknown as globalThis.File);
    expect(result.customers).toBe(1);
    expect(await db.company.count()).toBe(1);
    expect(await db.customers.count()).toBe(1);
    const attachment = await db.attachments.get("backup-file");
    expect(await db.syncLogs.count()).toBe(0);
    expect(await attachment?.blob.text()).toBe("test");
  });

  it("lehnt ein falsches Passwort verständlich ab", async () => {
    const { blob } = await createBackupBlob("richtiges-passwort");
    const file = new File([await blob.arrayBuffer()], "backup.encrypted.json", { type: "application/json" });
    await expect(restoreBackup(file as unknown as globalThis.File, "falsch")).rejects.toThrow("Passwort korrekt");
  });

  it("erkennt manipulierte unverschlüsselte Backups", async () => {
    const { blob } = await createBackupBlob();
    const parsed = JSON.parse(await blob.text());
    parsed.data.customers[0].lastName = "Manipuliert";
    const file = new File([JSON.stringify(parsed)], "backup.json", { type: "application/json" });
    await expect(restoreBackup(file as unknown as globalThis.File)).rejects.toThrow("Integritätsprüfung");
  });
});
