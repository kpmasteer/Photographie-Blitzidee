import { db, newId } from "../db";
import type { Company, Customer, Invoice, InvoiceItem } from "../types";
import { addDays } from "./date";
import { cloudConfigured } from "../cloud/config";

const now = "2026-07-10T20:20:09.000Z";

export const defaultCompany: Company = {
  id: "company",
  name: "Photographie Blitzidee",
  owner: "Lidia Lang",
  street: "Hauptstr. 441",
  postalCode: "26683",
  city: "Saterland",
  country: "Deutschland",
  phone: "",
  email: "info@Photographie-Blitzidee.de",
  secondaryEmail: "Lidia@Photographie-Blitzidee.de",
  website: "https://photographie-blitzidee.de",
  taxNumber: "56/126/09694",
  vatId: "",
  iban: "DE92 2805 0100 0084 1695 64",
  bic: "SLZODE22XXX",
  bankName: "Landessparkasse zu Oldenburg",
  accountHolder: "Lidia Lang",
  smallBusiness: true,
  taxExemptionNote: "Steuerbefreiung für Kleinunternehmer gemäß § 19 UStG.",
  paymentTermDays: 14,
  defaultIntro: "Vielen Dank für Ihr Vertrauen. Für die erbrachte Leistung berechne ich:",
  defaultOutro: "Vielen Dank und freundliche Grüße",
  invoiceNumberPattern: "NNNNN",
  updatedAt: now
};

const historical = [
  ["00001", "Frank Budde", "Alte Meeschen 15", "26169", "Friesoythe", "2016-05-22", 15, 16000, 0, 290, 0, 16290],
  ["00002", "Eva Schulte", "Schepser Str. 1", "26676", "Barßel", "2016-06-04", 10, 12000, 5, 290, 2500, 12290],
  ["00003", "Lidia Steinmetz", "Propst-Wehage-Str. 7", "26169", "Friesoythe", "2016-06-09", 10, 12000, 5, 0, 2500, 12000],
  ["00004", "Elena Webert", "Am Ried 27", "26683", "Ramsloh", "2016-06-18", 10, 12000, 5, 0, 2500, 12000],
  ["00005", "Viktoria Schmidt", "Evertskamp 9", "26789", "Leer", "2016-06-24", 15, 16000, 2, 0, 1000, 16000],
  ["00006", "Irina Isheim", "Orfstr. 11", "26169", "Altenoythe", "2016-06-24", 10, 12000, 7, 0, 3500, 12000]
] as const;

export async function seedDatabase() {
  const seeded = await db.settings.get("historicalSeedV1");
  if (seeded?.value) return;

  // Auf einem neuen Cloud-Gerät dürfen die historischen Demo-/Probezeilen nicht
  // erneut entstehen. Der gemeinsame Datenbestand wird anschließend vom Sync-
  // Dienst geladen. Bereits vorhandene lokale Installationen besitzen das Flag
  // schon und behalten ihre Daten unverändert.
  if (cloudConfigured) {
    await db.transaction("rw", [db.company, db.settings], async () => {
      if (!(await db.company.get("company"))) await db.company.add(defaultCompany);
      await db.settings.put({ key: "historicalSeedV1", value: "cloud-device-skipped" });
      if (!(await db.settings.get("lastBackupAt"))) await db.settings.put({ key: "lastBackupAt", value: null });
      if (!(await db.settings.get("installedAt"))) await db.settings.put({ key: "installedAt", value: new Date().toISOString() });
    });
    return;
  }

  await db.transaction("rw", [db.company, db.customers, db.invoices, db.payments, db.importLogs, db.settings], async () => {
    if (!(await db.company.get("company"))) await db.company.add(defaultCompany);
    let imported = 0;
    for (const [number, name, street, postalCode, city, date, photos, base, extraPhotos, shipping, discount, total] of historical) {
      const fingerprint = `probe1:${number}`;
      if (await db.invoices.where("importFingerprint").equals(fingerprint).first()) continue;
      const [firstName = "", ...rest] = name.split(" ");
      const lastName = rest.join(" ");
      const customerId = `import_customer_${number}`;
      const customer: Customer = {
        id: customerId, customerNumber: number, firstName, lastName, street, postalCode, city,
        country: "Deutschland", archived: false, createdAt: date, updatedAt: date,
        importFingerprint: `probe1:customer:${number}`
      };
      await db.customers.put(customer);
      const items: InvoiceItem[] = [{
        id: newId("item"),
        description: `Fotoshooting inkl. ${photos} bearbeitete Bilder in 13x18 + Bildmaterial als Datei`,
        quantityMilli: 1000, unit: "Pauschale", unitPriceCents: base, totalCents: base, sortOrder: 0
      }];
      if (extraPhotos) items.push({
        id: newId("item"), description: `${extraPhotos} zusätzlich bearbeitete Bilder`, quantityMilli: 1000,
        unit: "Pauschale", unitPriceCents: extraPhotos * 500, totalCents: extraPhotos * 500, sortOrder: 1
      });
      if (shipping) items.push({
        id: newId("item"), description: "Verpackung und Versand", quantityMilli: 1000,
        unit: "Pauschale", unitPriceCents: shipping, totalCents: shipping, sortOrder: 2
      });
      if (discount) items.push({
        id: newId("item"), description: "Rabatt", quantityMilli: 1000,
        unit: "Pauschale", unitPriceCents: -discount, totalCents: -discount, sortOrder: 3
      });
      const invoiceId = `import_invoice_${number}`;
      const { confirmedAt: _confirmedAt, updatedAt: _updatedAt, ...companySnapshot } = defaultCompany;
      void _confirmedAt; void _updatedAt;
      const invoice: Invoice = {
        id: invoiceId, draftNumber: `IMPORT-${number}`, invoiceNumber: number, year: 2016, customerId,
        customerSnapshot: { customerNumber: number, displayName: name, street, postalCode, city, country: "Deutschland" },
        companySnapshot,
        invoiceDate: date, serviceDateFrom: date, items, totalCents: total, paymentTermDays: 0, dueDate: date,
        status: "paid", paidAt: date, paymentMethod: "Bar", introText: "", outroText: "",
        taxExemptionNote: "Durch Kleinunternehmerregelung im Sinne von § 19 Abs. 1 UStG wird keine Umsatzsteuer berechnet.",
        createdAt: date, updatedAt: date, finalizedAt: date, imported: true,
        importSource: "Rechnung Makro Probe1.xlsm / Kunden", importFingerprint: fingerprint
      };
      await db.invoices.add(invoice);
      await db.payments.add({
        id: `import_payment_${number}`, invoiceId, amountCents: total, paidAt: date,
        method: "Bar", note: "Zahlungsstatus aus Excel: Ja", createdAt: date
      });
      imported++;
    }
    await db.importLogs.put({
      id: "import_probe1_seed_v1", createdAt: now, sourceName: "Rechnung Makro Probe1.xlsm",
      sourceFingerprint: "sha256:ddaba4a89c6f7c8016b358c4307de6e1a48d715753e257d0f3cb1cce71a8ad2f",
      years: [2016], customersFound: 6, invoicesFound: 6, imported, skipped: 6 - imported,
      warnings: ["E-Mail-Adressen und Telefonnummern waren nicht vorhanden.", "Leistungsdatum wurde mangels separater Angabe dem Rechnungsdatum gleichgesetzt."]
    });
    await db.settings.put({ key: "historicalSeedV1", value: true });
    await db.settings.put({ key: "lastBackupAt", value: null });
    await db.settings.put({ key: "installedAt", value: new Date().toISOString() });
  });
}

export const makeDraft = (company: Company, customerId = ""): Invoice => {
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: newId("invoice"), draftNumber: `ENTWURF-${Date.now()}`, year: Number(today.slice(0, 4)), customerId,
    invoiceDate: today, serviceDateFrom: today, items: [{
      id: newId("item"), description: "Fotoshooting", quantityMilli: 1000, unit: "Pauschale",
      unitPriceCents: 0, totalCents: 0, sortOrder: 0
    }], totalCents: 0, paymentTermDays: company.paymentTermDays, dueDate: addDays(today, company.paymentTermDays),
    status: "draft", introText: company.defaultIntro, outroText: company.defaultOutro,
    taxExemptionNote: company.taxExemptionNote, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), imported: false
  };
};
