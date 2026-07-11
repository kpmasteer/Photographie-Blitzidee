import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Download, Printer } from "lucide-react";
import { db } from "../db";
import { euro } from "../lib/money";
import { createAnnualReportPdf, downloadBlob, prefersNativePdfShare, sharePdfFile } from "../lib/pdf";
import { annualFigures } from "../lib/reporting";
import { printElementInNewWindow, REPORT_PRINT_CSS } from "../lib/standalonePrint";

export function Reports() {
  const invoices = useLiveQuery(() => db.invoices.toArray(), [], []);
  const payments = useLiveQuery(() => db.payments.toArray(), [], []);
  const expenses = useLiveQuery(() => db.expenses.toArray(), [], []);
  const company = useLiveQuery(() => db.company.get("company"));
  const years = useMemo(() => [...new Set([new Date().getFullYear(), ...invoices.map((item) => item.year), ...expenses.map((item) => Number(item.paidAt.slice(0, 4)))])].sort((a, b) => b - a), [invoices, expenses]);
  const [year, setYear] = useState(new Date().getFullYear());
  const { incomeCents: income, expenseCents: costs, openCents: open } = annualFigures(year, invoices, payments, expenses);
  const cancelled = invoices.filter((item) => item.year === year && item.status === "cancelled").reduce((sum, item) => sum + item.totalCents, 0);
  const months = Array.from({ length: 12 }, (_, index) => {
    const prefix = `${year}-${String(index + 1).padStart(2, "0")}`;
    const monthIncome = payments.filter((item) => item.paidAt.startsWith(prefix)).reduce((sum, item) => sum + item.amountCents, 0);
    const monthCosts = expenses.filter((item) => !item.cancelled && item.paidAt.startsWith(prefix)).reduce((sum, item) => sum + item.deductibleCents, 0);
    return { name: new Intl.DateTimeFormat("de-DE", { month: "long" }).format(new Date(year, index)), income: monthIncome, costs: monthCosts };
  });
  const categories = [...expenses.filter((item) => !item.cancelled && item.paidAt.startsWith(String(year))).reduce((map, item) => map.set(item.category, (map.get(item.category) || 0) + item.deductibleCents), new Map<string, number>())].sort((a, b) => b[1] - a[1]);
  const julyPayments = payments.filter((payment) => payment.paidAt.startsWith(`${year}-07`)).map((payment) => ({ payment, invoice: invoices.find((item) => item.id === payment.invoiceId) }));

  const pdf = async () => {
    if (!company) return;
    try {
      const result = await createAnnualReportPdf(year, company, payments, invoices, expenses);
      if (!(prefersNativePdfShare() && await sharePdfFile(result.blob, result.filename, `Gewinn-/Verlustübersicht ${year}`, "PDF speichern, öffnen oder weitergeben"))) downloadBlob(result.blob, result.filename);
    } catch (cause) { if (!(cause instanceof DOMException && cause.name === "AbortError")) window.alert(cause instanceof Error ? cause.message : "Die PDF konnte nicht erstellt werden."); }
  };
  const print = async () => {
    if (!company) return;
    try {
      if (prefersNativePdfShare()) {
        const result = await createAnnualReportPdf(year, company, payments, invoices, expenses);
        if (!(await sharePdfFile(result.blob, result.filename, `Gewinn-/Verlustübersicht ${year}`, "Zum Drucken im Menü bitte „Drucken“ auswählen."))) downloadBlob(result.blob, result.filename);
        return;
      }
      const report = document.getElementById("annual-report-root");
      if (!report) throw new Error("Das Druckdokument ist nicht verfügbar.");
      await printElementInNewWindow({ element: report, css: REPORT_PRINT_CSS, title: `Gewinn-Verlust ${year}`, requiredText: ["Gewinn-/Verlustübersicht", String(year)] });
    } catch (cause) {
      window.alert(cause instanceof Error ? cause.message : "Das Druckdokument konnte nicht erstellt werden.");
    }
  };

  return <>
    <header className="page-header print-hide"><div><span className="eyebrow">Interne EÜR-orientierte Übersicht</span><h1>Gewinn & Verlust</h1><p>Einnahmen entstehen ausschließlich aus tatsächlichen Zahlungseingängen.</p></div><div className="actions"><select value={year} onChange={(event) => setYear(Number(event.target.value))}>{years.map((item) => <option key={item}>{item}</option>)}</select><button className="secondary" onClick={() => void print()}><Printer /> Drucken</button><button className="primary" onClick={pdf}><Download /> PDF</button></div></header>
    <section className="panel print-hide income-diagnostics"><h2>Einnahmen Juli {year} – Herkunft</h2><p>Jeder Betrag ist einem Zahlungseingang zugeordnet; offene Rechnungen werden nicht als Einnahmen gezählt.</p><div className="responsive-table"><table><thead><tr><th>Datum</th><th>Betrag</th><th>Rechnung</th><th>Kunde</th><th>Zahlungsreferenz / Importquelle</th></tr></thead><tbody>{julyPayments.map(({ payment, invoice }) => <tr key={payment.id}><td>{payment.paidAt}</td><td>{euro(payment.amountCents)}</td><td>{invoice?.invoiceNumber || invoice?.draftNumber || "–"}</td><td>{invoice?.customerSnapshot?.displayName || "–"}</td><td><small>{payment.id}</small><small>{payment.importSource || invoice?.importSource || "Manuell erfasst"}</small></td></tr>)}</tbody></table></div>{!julyPayments.length && <p className="empty">Keine Zahlungseingänge im Juli.</p>}</section>
    <article id="annual-report-root" className="annual-report"><header><div><span>{company?.name} · {company?.owner}</span><h1>Gewinn-/Verlustübersicht {year}</h1><p>01.01.{year} bis 31.12.{year}</p></div><img src="/Logo Photographie Blitzidee Neu.png" alt="Photographie Blitzidee" /></header><section className="report-summary"><div><span>Betriebseinnahmen</span><strong>{euro(income)}</strong><small>tatsächlich erhalten</small></div><div><span>Betriebsausgaben</span><strong>{euro(costs)}</strong><small>abziehbarer Anteil</small></div><div className={income - costs >= 0 ? "positive" : "negative"}><span>{income - costs >= 0 ? "Gewinn" : "Verlust"}</span><strong>{euro(income - costs)}</strong><small>vorläufiges Ergebnis</small></div></section><div className="report-columns"><section><h2>Monatsübersicht</h2><table><thead><tr><th>Monat</th><th>Einnahmen</th><th>Ausgaben</th><th>Ergebnis</th></tr></thead><tbody>{months.map((month) => <tr key={month.name}><td>{month.name}</td><td>{euro(month.income)}</td><td>{euro(month.costs)}</td><td>{euro(month.income - month.costs)}</td></tr>)}</tbody></table></section><section><h2>Ausgaben nach Kategorien</h2>{categories.length ? <div className="category-list">{categories.map(([category, value]) => <div key={category}><span>{category}</span><strong>{euro(value)}</strong><i style={{ width: `${costs ? Math.max(3, value / costs * 100) : 0}%` }} /></div>)}</div> : <p className="empty">Keine Ausgaben in diesem Jahr.</p>}<dl className="summary report-notes"><div><dt>Offene Forderungen</dt><dd>{euro(open)}</dd></div><div><dt>Stornierte Rechnungen</dt><dd>{euro(cancelled)}</dd></div></dl></section></div><footer>Interne Übersicht, keine steuerliche Beratung. Erstellt am {new Intl.DateTimeFormat("de-DE").format(new Date())}.</footer></article>
  </>;
}
