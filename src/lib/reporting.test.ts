import { describe, expect, it } from "vitest";
import type { Expense, Invoice, Payment } from "../types";
import { annualFigures } from "./reporting";

const invoice = (status: Invoice["status"], totalCents: number): Invoice => ({ id: crypto.randomUUID(), draftNumber: "D", invoiceNumber: "00001", year: 2026, customerId: "c", invoiceDate: "2026-01-01", serviceDateFrom: "2026-01-01", items: [], totalCents, paymentTermDays: 14, dueDate: "2026-01-15", status, introText: "", outroText: "", taxExemptionNote: "§ 19", createdAt: "", updatedAt: "", imported: false });
const expense = (paidAt: string, cents: number, cancelled = false): Expense => ({ id: crypto.randomUUID(), date: paidAt, paidAt, supplier: "Test", description: "Test", category: "Sonstiges", totalCents: cents, businessSharePercent: 100, deductibleCents: cents, cancelled, createdAt: "", updatedAt: "" });

describe("Jahresauswertung nach Zahlungsdatum", () => {
  it("wertet erhaltene Zahlungen, nicht gestellte Rechnungen, als Einnahmen", () => {
    const payments: Payment[] = [{ id: "p", invoiceId: "i", amountCents: 5000, paidAt: "2026-02-01", method: "Bank", createdAt: "" }];
    expect(annualFigures(2026, [invoice("finalized", 10_000)], payments, []).incomeCents).toBe(5000);
  });
  it("nimmt offene Rechnungen nicht als Einnahmen", () => expect(annualFigures(2026, [invoice("finalized", 10_000)], [], []).incomeCents).toBe(0));
  it("weist offene Forderungen separat aus", () => expect(annualFigures(2026, [invoice("finalized", 10_000)], [], []).openCents).toBe(10_000));
  it("schließt stornierte Rechnungen aus", () => expect(annualFigures(2026, [invoice("cancelled", 10_000)], [], []).openCents).toBe(0));
  it("schließt stornierte Ausgaben aus", () => expect(annualFigures(2026, [], [], [expense("2026-03-01", 2500, true)]).expenseCents).toBe(0));
  it("berechnet Gewinn als Einnahmen minus Ausgaben", () => {
    const payments: Payment[] = [{ id: "p", invoiceId: "i", amountCents: 10_000, paidAt: "2026-02-01", method: "Bank", createdAt: "" }];
    expect(annualFigures(2026, [], payments, [expense("2026-03-01", 2500)]).profitCents).toBe(7500);
  });
});
