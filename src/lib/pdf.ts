import { jsPDF } from "jspdf";
import type { Company, Customer, Expense, Invoice, Payment } from "../types";
import { formatDate } from "./date";
import { euro } from "./money";

const loadImage = async (url: string) => {
  const blob = await fetch(url).then((response) => response.blob());
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return `data:${blob.type || "image/png"};base64,${btoa(binary)}`;
};

const safeName = (value: string) => value.normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-zA-Z0-9_-]+/g, "_")
  .replace(/^_+|_+$/g, "")
  .slice(0, 80);

export function fitDimensions(width: number, height: number, maxWidth: number, maxHeight: number) {
  if (width <= 0 || height <= 0) return { width: maxWidth, height: maxHeight };
  const scale = Math.min(maxWidth / width, maxHeight / height);
  return { width: width * scale, height: height * scale };
}

export async function createInvoicePdf(invoice: Invoice, customer: Customer | undefined, company: Company, autoPrint = false): Promise<{ blob: Blob; filename: string }> {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const margin = 18;
  const pageWidth = 210;
  const pageHeight = 297;
  const contentWidth = pageWidth - margin * 2;
  const snapshot = invoice.customerSnapshot;
  const customerName = snapshot?.displayName || [customer?.firstName, customer?.lastName].filter(Boolean).join(" ") || customer?.company || "Kunde";
  const address = snapshot || customer;

  const drawHeader = async (continuation = false) => {
    if (!continuation) {
      try {
        const logo = await loadImage("/Logo Photographie Blitzidee Neu.png");
        const properties = doc.getImageProperties(logo);
        const size = fitDimensions(properties.width, properties.height, 74, 32);
        doc.addImage(logo, "PNG", margin, 12, size.width, size.height, undefined, "FAST");
      } catch { /* The textual company header remains a complete fallback. */ }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(company.name, 192, 18, { align: "right" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      const companyLines = [company.owner, company.street, `${company.postalCode} ${company.city}`, company.email, company.website, `Steuernummer: ${company.taxNumber}`].filter(Boolean);
      doc.text(companyLines, 192, 24, { align: "right", lineHeightFactor: 1.35 });
    }
    doc.setDrawColor(35, 31, 28);
    doc.setFillColor(239, 229, 218);
    const y = continuation ? 18 : 111;
    doc.rect(margin, y, contentWidth, 9, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text("Pos.", margin + 2, y + 6);
    doc.text("Leistung", margin + 13, y + 6);
    doc.text("Menge", 137, y + 6, { align: "right" });
    doc.text("Einzelpreis", 165, y + 6, { align: "right" });
    doc.text("Gesamt", 191, y + 6, { align: "right" });
    return y + 14;
  };

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text(`${company.name} · ${company.street} · ${company.postalCode} ${company.city}`, margin, 73);
  doc.setFontSize(10.5);
  doc.text([
    snapshot?.company || customer?.company || "",
    customerName,
    address?.street || "",
    `${address?.postalCode || ""} ${address?.city || ""}`.trim(),
    address?.country && address.country !== "Deutschland" ? address.country : ""
  ].filter(Boolean), margin, 80, { lineHeightFactor: 1.35 });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(invoice.status === "draft" ? "RECHNUNGSENTWURF" : invoice.cancelledInvoiceId ? "Stornorechnung" : "Rechnung", margin, 101);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  const infoX = 125;
  const infoY = 76;
  const info = [
    ["Rechnungsnummer", invoice.invoiceNumber || invoice.draftNumber],
    ["Rechnungsdatum", formatDate(invoice.invoiceDate)],
    ["Leistungsdatum", invoice.serviceDateTo ? `${formatDate(invoice.serviceDateFrom)} - ${formatDate(invoice.serviceDateTo)}` : formatDate(invoice.serviceDateFrom)],
    ["Fällig am", formatDate(invoice.dueDate)]
  ];
  info.forEach(([label, value], index) => {
    const y = infoY + index * 6;
    doc.setFont("helvetica", "bold"); doc.text(label || "", infoX, y);
    doc.setFont("helvetica", "normal"); doc.text(value || "", 192, y, { align: "right" });
  });

  let y = await drawHeader();
  doc.setFontSize(9);
  for (const [index, item] of invoice.items.entries()) {
    const lines = doc.splitTextToSize(item.description + (item.details ? `\n${item.details}` : ""), 92) as string[];
    const height = Math.max(9, lines.length * 4.5 + 3);
    if (y + height > pageHeight - 48) {
      doc.addPage();
      y = await drawHeader(true);
    }
    doc.setFont("helvetica", "normal");
    doc.text(String(index + 1), margin + 2, y + 2);
    doc.text(lines, margin + 13, y + 2, { lineHeightFactor: 1.15 });
    doc.text((item.quantityMilli / 1000).toLocaleString("de-DE"), 137, y + 2, { align: "right" });
    doc.text(euro(item.unitPriceCents), 165, y + 2, { align: "right" });
    doc.text(euro(item.totalCents), 191, y + 2, { align: "right" });
    y += height;
    doc.setDrawColor(220, 215, 209);
    doc.line(margin, y - 2, 192, y - 2);
  }
  if (y > 236) { doc.addPage(); y = 25; }
  if (invoice.discountCents) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    doc.text("Zwischensumme", 150, y + 5, { align: "right" }); doc.text(euro(invoice.subtotalCents ?? invoice.totalCents), 191, y + 5, { align: "right" });
    doc.text(invoice.discountType === "percent" ? `Rabatt ${invoice.discountValue} %` : "Rabatt", 150, y + 11, { align: "right" }); doc.text(`-${euro(invoice.discountCents)}`, 191, y + 11, { align: "right" }); y += 12;
  }
  doc.setDrawColor(35, 31, 28);
  doc.line(128, y + 1, 192, y + 1);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Gesamtbetrag", 150, y + 9, { align: "right" });
  doc.text(euro(invoice.totalCents), 191, y + 9, { align: "right" });

  y += 21;
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  const notes = [invoice.taxExemptionNote, `Bitte überweisen Sie den Rechnungsbetrag bis zum ${formatDate(invoice.dueDate)} auf das unten genannte Konto.`, invoice.outroText].filter(Boolean);
  for (const note of notes) {
    const lines = doc.splitTextToSize(note, contentWidth) as string[];
    if (y + lines.length * 4.2 > 267) { doc.addPage(); y = 25; }
    doc.text(lines, margin, y, { lineHeightFactor: 1.3 });
    y += lines.length * 4.2 + 4;
  }

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 270, 210, 27, "F");
    doc.setDrawColor(180, 173, 166);
    doc.line(margin, 274, 192, 274);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.text([company.owner, company.street, `${company.postalCode} ${company.city}`], margin, 280, { lineHeightFactor: 1.25 });
    doc.text([company.bankName, `IBAN ${company.iban}`, `BIC ${company.bic}`], 82, 280, { lineHeightFactor: 1.25 });
    doc.text([company.email, company.phone, `Seite ${page} / ${pages}`].filter(Boolean), 192, 280, { align: "right", lineHeightFactor: 1.25 });
  }
  if (autoPrint) doc.autoPrint({ variant: "non-conform" });
  const filename = `Rechnung_${safeName(invoice.invoiceNumber || invoice.draftNumber)}_${safeName(customerName)}.pdf`;
  return { blob: doc.output("blob"), filename };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = filename; link.rel = "noopener";
  document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function openPdfInWindow(blob: Blob, view: Window | null) {
  if (!view) return false;
  const url = URL.createObjectURL(blob);
  view.location.replace(url);
  window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
  return true;
}

export const prefersNativePdfShare = () => navigator.maxTouchPoints > 0 || window.matchMedia?.("(pointer: coarse)").matches;

export async function sharePdfFile(blob: Blob, filename: string, title: string, text: string) {
  const file = new File([blob], filename, { type: "application/pdf" });
  if (!navigator.canShare?.({ files: [file] }) || !navigator.share) return false;
  await navigator.share({ files: [file], title, text });
  return true;
}

export async function createAnnualReportPdf(year: number, company: Company, payments: Payment[], invoices: Invoice[], expenses: Expense[], autoPrint = false) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const income = payments.filter((p) => p.paidAt.startsWith(String(year))).reduce((sum, p) => sum + p.amountCents, 0);
  const costs = expenses.filter((e) => !e.cancelled && e.paidAt.startsWith(String(year))).reduce((sum, e) => sum + e.deductibleCents, 0);
  const open = invoices.filter((i) => i.year === year && !["paid", "cancelled"].includes(i.status)).reduce((sum, i) => sum + i.totalCents, 0);
  try {
    const logo = await loadImage("/Logo Photographie Blitzidee Neu.png");
    const properties = doc.getImageProperties(logo); const size = fitDimensions(properties.width, properties.height, 58, 24);
    doc.addImage(logo, "PNG", 18, 12, size.width, size.height, undefined, "FAST");
  } catch { /* Vollständiger Textkopf bleibt erhalten. */ }
  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text(company.name, 192, 17, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.text([company.owner, company.street, `${company.postalCode} ${company.city}`, company.email].filter(Boolean), 192, 23, { align: "right", lineHeightFactor: 1.3 });
  doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.text(`Gewinn-/Verlustübersicht ${year}`, 18, 48);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.text(`01.01.${year} bis 31.12.${year}`, 18, 55);
  const rows = [["Erhaltene Betriebseinnahmen", income], ["Betriebsausgaben", -costs], [income - costs >= 0 ? "Gewinn" : "Verlust", income - costs], ["Offene Forderungen (separat)", open]] as const;
  let y = 68;
  rows.forEach(([label, value], index) => {
    doc.setFillColor(index === 2 ? 232 : 247, index === 2 ? 241 : 243, index === 2 ? 236 : 239); doc.rect(18, y - 6, 174, 9, "F");
    if (index === 2) doc.setFont("helvetica", "bold"); doc.setFontSize(index === 2 ? 10 : 9);
    doc.text(label, 21, y); doc.text(euro(value), 189, y, { align: "right" }); y += 11;
    doc.setFont("helvetica", "normal");
  });
  y += 5; doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text("Monatsübersicht", 18, y); y += 6;
  doc.setFillColor(239, 229, 218); doc.rect(18, y - 4, 174, 7, "F"); doc.setFontSize(8); doc.text("Monat", 21, y); doc.text("Einnahmen", 92, y, { align: "right" }); doc.text("Ausgaben", 140, y, { align: "right" }); doc.text("Ergebnis", 189, y, { align: "right" }); y += 7;
  doc.setFont("helvetica", "normal");
  for (let month = 1; month <= 12; month++) {
    const prefix = `${year}-${String(month).padStart(2, "0")}`;
    const monthIncome = payments.filter((p) => p.paidAt.startsWith(prefix)).reduce((sum, p) => sum + p.amountCents, 0);
    const monthCosts = expenses.filter((e) => !e.cancelled && e.paidAt.startsWith(prefix)).reduce((sum, e) => sum + e.deductibleCents, 0);
    doc.text(new Intl.DateTimeFormat("de-DE", { month: "long" }).format(new Date(year, month - 1)), 21, y);
    doc.text(euro(monthIncome), 92, y, { align: "right" }); doc.text(euro(monthCosts), 140, y, { align: "right" }); doc.text(euro(monthIncome - monthCosts), 189, y, { align: "right" }); y += 6;
  }
  const categories = [...expenses.filter((expense) => !expense.cancelled && expense.paidAt.startsWith(String(year))).reduce((map, expense) => map.set(expense.category, (map.get(expense.category) || 0) + expense.deductibleCents), new Map<string, number>())].sort((a, b) => b[1] - a[1]);
  y += 4; doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text("Ausgaben nach Kategorien", 18, y); y += 6; doc.setFont("helvetica", "normal"); doc.setFontSize(8);
  for (const [category, value] of categories) {
    if (y > 263) { doc.addPage(); y = 20; }
    doc.text(category || "Nicht zugeordnet", 21, y); doc.text(euro(value), 189, y, { align: "right" }); y += 6;
  }
  if (!categories.length) { doc.text("Keine Ausgaben in diesem Jahr.", 21, y); y += 6; }
  doc.setFontSize(8); doc.text("Diese Auswertung dient der internen Übersicht und ersetzt keine steuerliche Beratung oder die amtliche Anlage EÜR.", 18, 276);
  if (autoPrint) doc.autoPrint({ variant: "non-conform" });
  const blob = doc.output("blob");
  return { blob, filename: `Gewinn-Verlust_${year}.pdf` };
}
