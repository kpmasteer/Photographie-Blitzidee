import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import type { Invoice } from "./types";

const invoice = (id: string, year: number): Invoice => ({
  id,
  draftNumber: `IMPORT-${year}-00001`,
  invoiceNumber: "00001",
  year,
  customerId: "customer",
  invoiceDate: `${year}-01-01`,
  serviceDateFrom: `${year}-01-01`,
  items: [],
  totalCents: 100,
  paymentTermDays: 14,
  dueDate: `${year}-01-15`,
  status: "finalized",
  introText: "",
  outroText: "",
  taxExemptionNote: "",
  createdAt: `${year}-01-01T00:00:00.000Z`,
  updatedAt: `${year}-01-01T00:00:00.000Z`,
  imported: true
});

beforeEach(async () => {
  await db.open();
  await db.invoices.clear();
});

describe("jahresbezogene Rechnungsnummern", () => {
  it("erlaubt dieselbe historische Nummer in unterschiedlichen Jahren", async () => {
    await db.invoices.bulkAdd([invoice("invoice-2016", 2016), invoice("invoice-2017", 2017)]);
    expect(await db.invoices.count()).toBe(2);
  });

  it("verhindert dieselbe Nummer innerhalb desselben Jahres", async () => {
    await db.invoices.add(invoice("invoice-a", 2017));
    await expect(db.invoices.add(invoice("invoice-b", 2017))).rejects.toMatchObject({ name: "ConstraintError" });
  });
});
