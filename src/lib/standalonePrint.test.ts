import { describe, expect, it } from "vitest";
import { A4_DOCUMENT_CSS, buildStandalonePrintHtml, INVOICE_PRINT_CSS, REPORT_PRINT_CSS } from "./standalonePrint";

describe("isoliertes A4-Druckdokument", () => {
  it("enthält nur das übergebene Dokument und das eigenständige Druck-CSS", () => {
    const html = buildStandalonePrintHtml('<article id="invoice-print-root">Rechnung 2026-1</article>', INVOICE_PRINT_CSS, "Rechnung", "http://localhost/");
    expect(html).toContain('id="invoice-print-root"');
    expect(html).toContain("Rechnung 2026-1");
    expect(html).not.toContain("app-shell");
    expect(html).not.toContain("preview-toolbar");
  });

  it("verwendet feste A4-Maße ohne Viewportbreite oder Skalierung", () => {
    for (const css of [A4_DOCUMENT_CSS, INVOICE_PRINT_CSS, REPORT_PRINT_CSS]) {
      expect(css).toContain("size: A4 portrait");
      expect(css).toContain("width: 210mm");
      expect(css).not.toMatch(/\b(vw|vh)\b/);
      expect(css).not.toMatch(/transform\s*:\s*scale|\bzoom\s*:/);
    }
  });

  it("erzeugt auch für die Jahresauswertung ein separates Dokument", () => {
    const html = buildStandalonePrintHtml('<article class="annual-report">Gewinn-/Verlustübersicht 2026</article>', REPORT_PRINT_CSS, "Gewinn-Verlust 2026", "http://localhost/");
    expect(html).toContain("Gewinn-/Verlustübersicht 2026");
    expect(html).not.toContain("income-diagnostics");
  });
});
