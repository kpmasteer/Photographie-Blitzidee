export const A4_DOCUMENT_CSS = `
@page { size: A4 portrait; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; width: 210mm; min-height: 297mm; background: #fff; color: #211e1b; }
body { font-family: Arial, Helvetica, sans-serif; }
`;

export const INVOICE_PRINT_CSS = `${A4_DOCUMENT_CSS}
.invoice-preview-page { width: 210mm; min-height: 296mm; margin: 0; padding: 12mm 14mm 11mm; display: flex; flex-direction: column; background: #fff; font-size: 9pt; line-height: 1.32; }
.preview-head { display: flex; justify-content: space-between; gap: 10mm; align-items: flex-start; }
.preview-head img { width: 53mm; max-height: 22mm; object-fit: contain; object-position: left top; }
.preview-head div { display: flex; flex-direction: column; text-align: right; font-size: 8pt; }
.preview-head a { color: inherit; text-decoration: none; }
.preview-address { margin: 12mm 0 6mm; min-height: 25mm; display: flex; flex-direction: column; }
.preview-address small { margin-bottom: 4mm; text-decoration: underline; font-size: 7pt; }
h1 { margin: 0 0 4mm; font: 22pt/1.1 Georgia, serif; }
.preview-meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3mm; margin: 0 0 4mm; }
.preview-meta div { display: flex; flex-direction: column; }
.preview-meta dt { color: #716961; font-size: 7pt; }
.preview-meta dd { margin: 1mm 0 0; font-weight: 700; }
p { margin: 2.5mm 0; }
table { width: 100%; border-collapse: collapse; margin: 4mm 0; }
thead { display: table-header-group; }
tr { break-inside: avoid; page-break-inside: avoid; }
th, td { padding: 1.7mm 1mm; border-bottom: .2mm solid #bbb; text-align: left; vertical-align: top; }
th { font-size: 7pt; text-transform: uppercase; letter-spacing: .03em; }
th:nth-last-child(-n+2), td:nth-last-child(-n+2) { text-align: right; }
td small { display: block; margin-top: .8mm; color: #716961; }
tfoot { break-inside: avoid; page-break-inside: avoid; }
tfoot th { font-size: 8pt; }
.draft-watermark { border: .4mm solid #9c6b43; color: #80502e; padding: 2mm; margin-bottom: 4mm; text-align: center; font-weight: 800; }
footer { margin-top: auto; padding-top: 2.5mm; border-top: .2mm solid #888; display: flex; flex-direction: column; font-size: 7.5pt; break-inside: avoid; page-break-inside: avoid; }
`;

export const REPORT_PRINT_CSS = `${A4_DOCUMENT_CSS}
.annual-report { width: 210mm; min-height: 296mm; margin: 0; padding: 12mm 14mm 11mm; background: #fff; font-size: 8.5pt; line-height: 1.3; }
.annual-report > header { display: flex; justify-content: space-between; gap: 10mm; align-items: flex-start; padding-bottom: 4mm; border-bottom: .5mm solid #211e1b; }
.annual-report > header h1 { margin: 1mm 0; font: 19pt/1.15 Georgia, serif; }
.annual-report > header p { margin: 0; color: #6f675f; }
.annual-report > header img { width: 46mm; max-height: 19mm; object-fit: contain; }
.report-summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: .2mm; margin: 5mm 0; background: #ddd5cd; break-inside: avoid; page-break-inside: avoid; }
.report-summary > div { padding: 3mm; display: flex; flex-direction: column; background: #f7f2ec; }
.report-summary span { font-size: 7pt; text-transform: uppercase; color: #716961; }
.report-summary strong { margin: 1mm 0; font: 17pt Georgia, serif; }
.report-summary small { color: #716961; }
.positive strong { color: #23664f; } .negative strong { color: #923b37; }
.report-columns { display: grid; grid-template-columns: 1.25fr .75fr; gap: 7mm; }
h2 { margin: 2mm 0; font: 11pt Georgia, serif; }
table { width: 100%; border-collapse: collapse; }
thead { display: table-header-group; }
tr { break-inside: avoid; page-break-inside: avoid; }
th, td { padding: 1.1mm; border-bottom: .2mm solid #ddd5cd; text-align: left; }
th { font-size: 7pt; text-transform: uppercase; color: #716961; }
th:not(:first-child), td:not(:first-child) { text-align: right; }
.category-list { display: flex; flex-direction: column; gap: 2.2mm; }
.category-list > div { display: grid; grid-template-columns: 1fr auto; gap: 1mm; break-inside: avoid; }
.category-list i { grid-column: 1 / -1; display: block; height: .8mm; border-radius: 1mm; background: #a85d36; }
.summary { margin: 4mm 0 0; }
.summary > div { display: flex; justify-content: space-between; gap: 4mm; padding: 1.5mm 0; border-bottom: .2mm solid #ddd5cd; }
.summary dd { margin: 0; font-weight: 700; text-align: right; }
.empty { color: #716961; }
.annual-report footer { margin-top: 5mm; padding-top: 2.5mm; border-top: .2mm solid #ddd5cd; color: #716961; font-size: 7pt; break-inside: avoid; }
`;

export function buildStandalonePrintHtml(markup: string, css: string, title: string, baseUrl: string) {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><base href="${baseUrl}"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${css}</style></head><body>${markup}</body></html>`;
}

const waitForImages = async (doc: Document) => Promise.all(Array.from(doc.images).map(async (image) => {
  if (image.complete) return;
  await new Promise<void>((resolve) => {
    image.addEventListener("load", () => resolve(), { once: true });
    image.addEventListener("error", () => resolve(), { once: true });
  });
}));

const nextLayout = (view: Window) => new Promise<void>((resolve) => view.requestAnimationFrame(() => view.requestAnimationFrame(() => resolve())));

export async function printElementInIsolatedFrame(options: { element: HTMLElement; css: string; title: string; requiredText: string[] }) {
  document.getElementById("standalone-print-frame")?.remove();
  const frame = document.createElement("iframe");
  frame.id = "standalone-print-frame";
  frame.title = "Temporäres Druckdokument";
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none";
  document.body.append(frame);
  try {
    const loaded = new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("Das Druckdokument konnte nicht geladen werden.")), 10_000);
      frame.addEventListener("load", () => { window.clearTimeout(timeout); resolve(); }, { once: true });
    });
    frame.srcdoc = buildStandalonePrintHtml(options.element.outerHTML, options.css, options.title, document.baseURI);
    await loaded;
    const view = frame.contentWindow; const doc = frame.contentDocument;
    if (!view || !doc) throw new Error("Das Druckdokument ist nicht verfügbar.");
    await doc.fonts?.ready;
    await waitForImages(doc);
    await nextLayout(view);
    const text = doc.body.textContent?.replace(/\s+/g, " ").trim() || "";
    const page = doc.body.firstElementChild as HTMLElement | null;
    if (!page || page.getBoundingClientRect().height < 1 || options.requiredText.some((value) => !text.includes(value))) throw new Error("Das Druckdokument ist unvollständig und wurde nicht gedruckt.");
    const cleanup = () => frame.remove();
    view.addEventListener("afterprint", cleanup, { once: true });
    window.setTimeout(cleanup, 60_000);
    view.focus();
    view.print();
  } catch (cause) {
    frame.remove();
    throw cause;
  }
}
