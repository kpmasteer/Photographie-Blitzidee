import { useLiveQuery } from "dexie-react-hooks";
import { ArrowRight, CircleAlert, FilePlus2, Receipt, WalletCards } from "lucide-react";
import { Link } from "react-router-dom";
import { db } from "../db";
import { euro } from "../lib/money";
import { formatDate } from "../lib/date";

export function Dashboard() {
  const year = new Date().getFullYear();
  const data = useLiveQuery(async () => {
    const [invoices, payments, expenses] = await Promise.all([db.invoices.toArray(), db.payments.toArray(), db.expenses.toArray()]);
    const yearInvoices = invoices.filter((invoice) => invoice.year === year);
    const income = payments.filter((payment) => payment.paidAt.startsWith(String(year))).reduce((sum, item) => sum + item.amountCents, 0);
    const costs = expenses.filter((expense) => !expense.cancelled && expense.paidAt.startsWith(String(year))).reduce((sum, item) => sum + item.deductibleCents, 0);
    const open = yearInvoices.filter((invoice) => ["finalized", "sent", "partially_paid", "overdue"].includes(invoice.status)).reduce((sum, item) => sum + item.totalCents, 0);
    return { yearInvoices, income, costs, open, overdue: yearInvoices.filter((invoice) => invoice.status === "overdue").length, recent: invoices.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5) };
  }, [year]);
  if (!data) return <p>Lade Übersicht …</p>;
  return <>
    <header className="page-header"><div><span className="eyebrow">Kalenderjahr {year}</span><h1>Guten Tag, Lidia.</h1><p>Ihre Rechnungen, Zahlungseingänge und Ausgaben auf einen Blick.</p></div><Link className="primary" to="/invoices/new"><FilePlus2 /> Neue Rechnung</Link></header>
    <section className="kpi-grid">
      <article className="kpi featured"><span>Einnahmen</span><strong>{euro(data.income)}</strong><small>nach Zahlungsdatum</small></article>
      <article className="kpi"><span>Ausgaben</span><strong>{euro(data.costs)}</strong><small>betrieblicher Anteil</small></article>
      <article className="kpi"><span>{data.income - data.costs >= 0 ? "Gewinn" : "Verlust"}</span><strong>{euro(data.income - data.costs)}</strong><small>vorläufig</small></article>
      <article className="kpi"><span>Offene Forderungen</span><strong>{euro(data.open)}</strong><small>{data.overdue ? `${data.overdue} überfällig` : "nichts überfällig"}</small></article>
    </section>
    <section className="dashboard-grid">
      <article className="panel"><div className="panel-title"><h2>Letzte Rechnungen</h2><Link to="/invoices">Alle <ArrowRight /></Link></div>
        {data.recent.length ? <div className="list">{data.recent.map((invoice) => <Link to={`/invoices/${invoice.id}`} className="list-row" key={invoice.id}><span><strong>{invoice.invoiceNumber || invoice.draftNumber}</strong><small>{formatDate(invoice.invoiceDate)}</small></span><span className={`status ${invoice.status}`}>{invoice.status === "paid" ? "Bezahlt" : invoice.status === "draft" ? "Entwurf" : invoice.status === "cancelled" ? "Storniert" : "Offen"}</span><b>{euro(invoice.totalCents)}</b></Link>)}</div> : <div className="empty">Noch keine Rechnungen in {year}.</div>}
      </article>
      <aside className="quick-stack">
        <Link className="quick-card" to="/expenses"><Receipt /><span><strong>Ausgabe erfassen</strong><small>Beleg und betrieblicher Anteil</small></span><ArrowRight /></Link>
        <Link className="quick-card" to="/reports"><WalletCards /><span><strong>Jahresauswertung</strong><small>EÜR-orientierte Übersicht</small></span><ArrowRight /></Link>
        {data.overdue > 0 && <Link className="quick-card warning" to="/invoices"><CircleAlert /><span><strong>{data.overdue} überfällige Rechnung(en)</strong><small>Jetzt prüfen</small></span><ArrowRight /></Link>}
      </aside>
    </section>
  </>;
}
