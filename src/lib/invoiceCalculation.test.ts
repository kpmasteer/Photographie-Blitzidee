import { describe, expect, it } from "vitest";
import { calculateInvoice } from "./invoiceCalculation";
import type { InvoiceItem } from "../types";

const item = (price: number, discountType?: InvoiceItem["discountType"], discountValue = 0): InvoiceItem => ({ id: crypto.randomUUID(), description: "Leistung", quantityMilli: 1000, unit: "Pauschale", unitPriceCents: price, totalCents: price, sortOrder: 0, discountType, discountValue });
describe("zentrale Rechnungsberechnung", () => {
  it("berechnet festen Positionsrabatt und Gesamtrabatt in richtiger Reihenfolge", () => { const result = calculateInvoice([item(10_000, "fixed", 1_000)], "fixed", 2_000); expect(result).toMatchObject({ subtotalCents: 9_000, discountCents: 2_000, totalCents: 7_000, errors: {} }); expect(result.items[0]).toMatchObject({ subtotalCents: 10_000, discountCents: 1_000, totalCents: 9_000 }); });
  it("berechnet 12,50 minus 2,50", () => expect(calculateInvoice([item(1250, "fixed", 250)]).items[0]?.totalCents).toBe(1000));
  it("stürzt bei zu hohem Gesamtrabatt nicht ab", () => { const result = calculateInvoice([item(1000)], "fixed", 5000); expect(result.totalCents).toBe(1000); expect(result.errors.invoice).toBe("Der feste Rabatt darf den zugrunde liegenden Betrag nicht überschreiten."); });
  it("kombiniert Prozent-Positions- und Gesamtrabatt centgenau", () => expect(calculateInvoice([item(10_000, "percent", 10)], "percent", 10).totalCents).toBe(8100));
});
