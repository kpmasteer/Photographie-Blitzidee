export async function printInvoiceDocument() {
  const root = document.getElementById("invoice-print-root");
  if (!root) throw new Error("Das Rechnungsdokument ist noch nicht bereit.");
  await document.fonts?.ready;
  const images = Array.from(root.querySelectorAll("img"));
  await Promise.all(images.map(async (image) => { if (image.complete) return; try { await image.decode(); } catch { /* Der Textkopf bleibt als Fallback druckbar. */ } }));
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  window.print();
}
