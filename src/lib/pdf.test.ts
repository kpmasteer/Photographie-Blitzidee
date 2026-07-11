import { describe, expect, it } from "vitest";
import type { Company, Invoice } from "../types";
import { createInvoicePdf } from "./pdf";

const company: Company = {
  id: "company", name: "Photographie Blitzidee", owner: "Lidia Lang", street: "Teststraße 1", postalCode: "12345", city: "Teststadt", country: "Deutschland",
  phone: "0123", email: "test@example.de", secondaryEmail: "", website: "https://example.de", taxNumber: "12/345/67890", vatId: "", iban: "DE001234", bic: "TESTBIC", bankName: "Testbank", accountHolder: "Lidia Lang",
  smallBusiness: true, taxExemptionNote: "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.", paymentTermDays: 14, defaultIntro: "", defaultOutro: "", invoiceNumberPattern: "{number}", updatedAt: "2026-07-11"
};

const invoice: Invoice = {
  id: "invoice-1", draftNumber: "ENTWURF-1", invoiceNumber: "00042", year: 2026, customerId: "customer-1",
  customerSnapshot: { displayName: "Erika Muster", street: "Musterweg 2", postalCode: "54321", city: "Musterstadt", country: "Deutschland" },
  invoiceDate: "2026-07-01", serviceDateFrom: "2026-06-30", dueDate: "2026-07-15", paymentTermDays: 14, status: "finalized",
  items: [{ id: "item-1", description: "Fotografische Leistung", quantityMilli: 1000, unit: "Pauschale", unitPriceCents: 12500, totalCents: 12500, sortOrder: 0 }],
  totalCents: 12500, introText: "Vielen Dank für Ihren Auftrag.", outroText: "Mit freundlichen Grüßen", taxExemptionNote: company.taxExemptionNote,
  createdAt: "2026-07-01", updatedAt: "2026-07-01", finalizedAt: "2026-07-01", imported: false
};

describe("textbasierte Rechnungs-PDF", () => {
  it("erzeugt nach der Finalisierung eine nichtleere echte PDF-Datei", async () => {
    const result = await createInvoicePdf(invoice, undefined, company);
    const signature = new TextDecoder().decode(await result.blob.slice(0, 5).arrayBuffer());
    expect(result.filename).toBe("Rechnung_00042_Erika_Muster.pdf");
    expect(result.blob.type).toBe("application/pdf");
    expect(result.blob.size).toBeGreaterThan(1_000);
    expect(signature).toBe("%PDF-");
  });
});
