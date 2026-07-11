import { describe, expect, it } from "vitest";
import { buildLocalMigrationPreview, type LocalMigrationAnalysisInput } from "./localMigration";

const base: LocalMigrationAnalysisInput = {
  counts: {
    company: 1,
    customers: 2,
    invoices: 3,
    invoiceItems: 4,
    payments: 1,
    expenses: 2,
    templates: 3,
    recurringExpenses: 0,
    attachments: 1,
    auditLogs: 5,
    importLogs: 1
  },
  companyConfirmed: true,
  attachmentBytes: 512,
  draftInvoices: 1,
  importedRecords: 2,
  orphanedInvoices: 0,
  orphanedPayments: 0,
  latestLocalChangeAt: "2026-07-11T12:00:00.000Z"
};

describe("buildLocalMigrationPreview", () => {
  it("erstellt eine nachvollziehbare Vorschau ohne Daten zu verändern", () => {
    const preview = buildLocalMigrationPreview(base, "2026-07-11T13:00:00.000Z");
    expect(preview.totalRecords).toBe(23);
    expect(preview.canMigrate).toBe(true);
    expect(preview.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining("Rechnungsentwurf"),
      expect.stringContaining("Importkennungen")
    ]));
    expect(preview.blockers).toEqual([]);
    expect(preview.id).toContain("2026-07-11T12:00:00.000Z");
  });

  it("blockiert die Übernahme bei verwaisten Beziehungen", () => {
    const preview = buildLocalMigrationPreview({ ...base, orphanedInvoices: 1, orphanedPayments: 2 });
    expect(preview.canMigrate).toBe(false);
    expect(preview.blockers).toHaveLength(2);
  });

  it("lässt ein vollständig frisches Gerät ohne Migrationsschritt weiter", () => {
    const emptyCounts = Object.fromEntries(Object.keys(base.counts).map((key) => [key, 0])) as unknown as typeof base.counts;
    const preview = buildLocalMigrationPreview({ ...base, counts: emptyCounts, companyConfirmed: false, draftInvoices: 0, importedRecords: 0 });
    expect(preview.canMigrate).toBe(false);
    expect(preview.freshDevice).toBe(true);
    expect(preview.blockers).toEqual([]);
    expect(preview.warnings[0]).toContain("keine Übernahme nötig");
  });

  it("blockiert vorhandene Geschäftsdaten ohne Unternehmensprofil", () => {
    const preview = buildLocalMigrationPreview({ ...base, counts: { ...base.counts, company: 0 } });
    expect(preview.freshDevice).toBe(false);
    expect(preview.canMigrate).toBe(false);
    expect(preview.blockers).toContain("Das Unternehmensprofil fehlt.");
  });

  it("behandelt das unbestätigte Standardprofil eines neuen Cloud-Geräts nicht als Altbestand", () => {
    const counts = Object.fromEntries(Object.keys(base.counts).map((key) => [key, key === "company" ? 1 : 0])) as unknown as typeof base.counts;
    const preview = buildLocalMigrationPreview({ ...base, counts, companyConfirmed: false, draftInvoices: 0, importedRecords: 0 });
    expect(preview.freshDevice).toBe(true);
    expect(preview.canMigrate).toBe(false);
  });
});
