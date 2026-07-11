import { describe, expect, it } from "vitest";
import type { Customer, Invoice } from "../../types";
import { customerFromRemote, invoiceFromRemote, toRemoteBundle } from "./mapping";

const organizationId = "11111111-1111-4111-8111-111111111111";

describe("Sync-Mapping", () => {
  it("behält die lokale ID explizit und bildet Kundenfelder verlustfrei ab", async () => {
    const customer: Customer = {
      id: "customer_import_17", customerNumber: "K-0017", firstName: "Ada", lastName: "Test",
      street: "Testweg 1", postalCode: "26683", city: "Saterland", country: "Deutschland",
      email: "ada@example.test", archived: false, createdAt: "2026-07-01T10:00:00.000Z", updatedAt: "2026-07-02T10:00:00.000Z"
    };
    const bundle = await toRemoteBundle(organizationId, "customer", customer);
    expect(bundle.row.local_id).toBe(customer.id);
    expect(bundle.row.id).not.toBe(customer.id);
    expect(customerFromRemote(bundle.row)).toEqual(customer);
  });

  it("überträgt Rechnungspositionen als strukturierte Kinddatensätze", async () => {
    const invoice: Invoice = {
      id: "invoice_17", draftNumber: "ENTWURF-17", invoiceNumber: "00017", year: 2026, customerId: "customer_import_17",
      invoiceDate: "2026-07-01", serviceDateFrom: "2026-07-01", items: [{
        id: "item_17", description: "Fotoshooting", quantityMilli: 1500, unit: "Stunden", unitPriceCents: 10000,
        subtotalCents: 15000, totalCents: 13500, discountType: "percent", discountValue: 10, discountCents: 1500, sortOrder: 0
      }], subtotalCents: 15000, discountType: "fixed", discountValue: 500, discountCents: 500, totalCents: 14500,
      paymentTermDays: 14, dueDate: "2026-07-15", status: "finalized", introText: "Hallo", outroText: "Danke",
      taxExemptionNote: "§ 19 UStG", createdAt: "2026-07-01T10:00:00.000Z", updatedAt: "2026-07-01T11:00:00.000Z",
      finalizedAt: "2026-07-01T11:00:00.000Z", imported: false
    };
    const bundle = await toRemoteBundle(organizationId, "invoice", invoice);
    const items = bundle.childRows?.[0]?.rows ?? [];
    expect(bundle.row.local_id).toBe("invoice_17");
    expect(items).toHaveLength(1);
    expect(items[0]?.local_id).toBe("item_17");
    expect(items[0]?.quantity_milli).toBe(1500);
    const roundTrip = invoiceFromRemote(bundle.row, items);
    expect(roundTrip.items[0]).toMatchObject({ id: "item_17", totalCents: 13500, discountCents: 1500 });
    expect(roundTrip.totalCents).toBe(14500);
  });

  it("legt Anhänge in einem privaten Organisationspfad ab, ohne den Blob in die Tabellenzeile zu kopieren", async () => {
    const bundle = await toRemoteBundle(organizationId, "attachment", {
      id: "attachment_receipt_1", ownerType: "expense", ownerId: "expense_1", name: "Beleg Juli.pdf",
      mimeType: "application/pdf", size: 4, blob: new Blob(["test"], { type: "application/pdf" }), createdAt: "2026-07-11T12:00:00.000Z"
    });
    expect(bundle.table).toBe("attachments");
    expect(bundle.row).toMatchObject({ local_id: "attachment_receipt_1", bucket: "receipts", filename: "Beleg Juli.pdf", size_bytes: 4 });
    expect(String(bundle.row.object_path)).toMatch(/^11111111-1111-4111-8111-111111111111\/[0-9a-f-]+\/Beleg%20Juli\.pdf$/);
    expect(bundle.row).not.toHaveProperty("blob");
  });
});
