import { INVOICE_PRINT_CSS, printElementInIsolatedFrame } from "./standalonePrint";

export async function printInvoiceDocument() {
  const root = document.getElementById("invoice-print-root");
  if (!root) throw new Error("Das Rechnungsdokument ist noch nicht bereit.");
  const number = root.querySelector(".preview-meta dd")?.textContent?.trim();
  const recipient = root.querySelector(".preview-address strong")?.textContent?.trim();
  if (!number || !recipient) throw new Error("Rechnungsnummer beziehungsweise Empfänger fehlen im Druckdokument.");
  await printElementInIsolatedFrame({ element: root, css: INVOICE_PRINT_CSS, title: "Rechnung", requiredText: [number, recipient] });
}
