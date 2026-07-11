import { jsPDF } from "jspdf";
import { createRoot } from "react-dom/client";
import { InvoiceDocument } from "../components/InvoicePreview";
import type { Company, Customer, Invoice } from "../types";

const safeName = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80);

export async function createInvoiceDocumentPdf(invoice: Invoice, customer: Customer | undefined, company: Company) {
  if (invoice.status !== "draft" && !invoice.invoiceNumber) throw new Error("Eine finalisierte Rechnung benötigt vor PDF-Erstellung eine gültige Rechnungsnummer.");
  const host = document.createElement("div"); host.className = "pdf-render-host"; host.style.cssText = "position:fixed;left:-10000px;top:0;width:210mm;background:white;z-index:-1"; document.body.append(host); const root = createRoot(host); root.render(<InvoiceDocument invoice={invoice} customer={customer} company={company} />); await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  try { const doc = new jsPDF({ unit: "mm", format: "a4", compress: true }); await doc.html(host.querySelector("#invoice-print-root") as HTMLElement, { x: 0, y: 0, width: 210, windowWidth: 794, autoPaging: "text", html2canvas: { scale: 1, useCORS: true, backgroundColor: "#ffffff" } }); const customerName = invoice.customerSnapshot?.displayName || [customer?.firstName, customer?.lastName].filter(Boolean).join(" ") || customer?.company || "Kunde"; return { blob: doc.output("blob"), filename: `Rechnung_${safeName(invoice.invoiceNumber || invoice.draftNumber)}_${safeName(customerName)}.pdf` }; }
  finally { root.unmount(); host.remove(); }
}
