import { afterEach, describe, expect, it, vi } from "vitest";
import { buildLocalMigrationPreview } from "./localMigration";
import {
  CLOUD_PREFERRED_CONFIRMATION_TEXT,
  MIGRATION_CONFIRMATION_TEXT,
  registerCloudOperationHandlers,
  reportCloudRuntimeStatus,
  requestLocalMigration,
  requestUseCloudData
} from "./operations";

const preview = buildLocalMigrationPreview({
  counts: { company: 1, customers: 1, invoices: 0, invoiceItems: 0, payments: 0, expenses: 0, templates: 0, recurringExpenses: 0, attachments: 0, auditLogs: 0, importLogs: 0 },
  companyConfirmed: true,
  attachmentBytes: 0,
  draftInvoices: 0,
  importedRecords: 0,
  orphanedInvoices: 0,
  orphanedPayments: 0
});

let unregister: (() => void) | undefined;
afterEach(() => { unregister?.(); unregister = undefined; });

describe("requestLocalMigration", () => {
  it("ruft ohne Backup und exakten Bestätigungstext keinen Cloud-Handler auf", async () => {
    const migrate = vi.fn(async () => ({ status: "completed" as const, message: "ok" }));
    unregister = registerCloudOperationHandlers({ migrateLocalData: migrate });
    await expect(requestLocalMigration({ preview, backupCreatedAt: "", confirmationText: "JA", confirmed: true })).rejects.toThrow("ausdrücklich bestätigt");
    await expect(requestLocalMigration({ preview, backupCreatedAt: "", confirmationText: MIGRATION_CONFIRMATION_TEXT, confirmed: true })).rejects.toThrow("Backup");
    expect(migrate).not.toHaveBeenCalled();
  });

  it("gibt den Handler erst nach Backup und ausdrücklicher Bestätigung frei", async () => {
    const migrate = vi.fn(async () => ({ status: "completed" as const, message: "übernommen" }));
    unregister = registerCloudOperationHandlers({ migrateLocalData: migrate });
    reportCloudRuntimeStatus({ online: true });
    const result = await requestLocalMigration({
      preview,
      backupCreatedAt: "2026-07-11T18:00:00.000Z",
      confirmationText: MIGRATION_CONFIRMATION_TEXT,
      confirmed: true
    });
    expect(result.status).toBe("completed");
    expect(migrate).toHaveBeenCalledOnce();

describe("requestUseCloudData", () => {
  it("ersetzt lokale Daten nur nach Backup und eigenem Bestätigungstext", async () => {
    const useCloudData = vi.fn(async () => ({ status: "completed" as const, message: "Cloud geladen" }));
    unregister = registerCloudOperationHandlers({ useCloudData });
    reportCloudRuntimeStatus({ online: true });

    await expect(requestUseCloudData({
      preview,
      backupCreatedAt: "2026-07-20T10:00:00.000Z",
      confirmationText: MIGRATION_CONFIRMATION_TEXT,
      confirmed: true
    })).rejects.toThrow("ausdrücklich bestätigt");

    const result = await requestUseCloudData({
      preview,
      backupCreatedAt: "2026-07-20T10:00:00.000Z",
      confirmationText: CLOUD_PREFERRED_CONFIRMATION_TEXT,
      confirmed: true
    });
    expect(result.status).toBe("completed");
    expect(useCloudData).toHaveBeenCalledOnce();
  });
});
  });
});
