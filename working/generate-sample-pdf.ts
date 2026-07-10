import fs from "node:fs/promises";
import { defaultCompany } from "../src/lib/seed";
import { createInvoicePdf } from "../src/lib/pdf";
import type { Customer, Invoice, InvoiceItem } from "../src/types";

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(String(input), "http://127.0.0.1:4173/");
  if (url.hostname === "127.0.0.1") return new Response(await fs.readFile(`public${url.pathname}`), { headers: { "content-type": url.pathname.endsWith(".jpg") ? "image/jpeg" : "image/png" } });
  return originalFetch(url, init);
};

const customer: Customer = { id: "qa-customer", customerNumber: "K-100", firstName: "Marie", lastName: "Mustermann", company: "Muster & Licht GmbH", street: "Beispielstraße 12", postalCode: "26169", city: "Friesoythe", country: "Deutschland", email: "marie@example.test", archived: false, createdAt: "2026-07-10", updatedAt: "2026-07-10" };
const items: InvoiceItem[] = Array.from({ length: 28 }, (_, index) => ({ id: `item-${index}`, description: index === 0 ? "Hochzeitsreportage inklusive sorgfältiger Auswahl und professioneller Bearbeitung der Aufnahmen" : `Fotografische Leistung ${index + 1}`, details: index % 4 === 0 ? "Zusatzbeschreibung für den kontrollierten mehrseitigen Seitenumbruch." : undefined, quantityMilli: index % 3 === 0 ? 2500 : 1000, unit: "Stunde", unitPriceCents: 7500 + index * 25, totalCents: Math.round((index % 3 === 0 ? 2500 : 1000) * (7500 + index * 25) / 1000), sortOrder: index }));
const invoice: Invoice = { id: "qa-invoice", draftNumber: "QA", invoiceNumber: "2026-001", year: 2026, customerId: customer.id, customerSnapshot: { customerNumber: customer.customerNumber, displayName: "Marie Mustermann", company: customer.company, street: customer.street, postalCode: customer.postalCode, city: customer.city, country: customer.country, email: customer.email }, invoiceDate: "2026-07-10", serviceDateFrom: "2026-06-01", serviceDateTo: "2026-06-30", items, totalCents: items.reduce((sum, item) => sum + item.totalCents, 0), paymentTermDays: 14, dueDate: "2026-07-24", status: "finalized", introText: "Vielen Dank für Ihr Vertrauen.", outroText: "Vielen Dank und freundliche Grüße", taxExemptionNote: defaultCompany.taxExemptionNote, createdAt: "2026-07-10", updatedAt: "2026-07-10", finalizedAt: "2026-07-10", imported: false };
const result = await createInvoicePdf(invoice, customer, { ...defaultCompany, confirmedAt: "2026-07-10" });
await fs.mkdir("output/pdf", { recursive: true });
await fs.writeFile("output/pdf/qa-mehrseitige-rechnung.pdf", new Uint8Array(await result.blob.arrayBuffer()));
console.log(`output/pdf/qa-mehrseitige-rechnung.pdf|${result.filename}`);
