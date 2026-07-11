import type { Company, Customer, Invoice } from "../types";
import { euro } from "../lib/money";
import { formatDate } from "../lib/date";

const clientData = (invoice: Invoice, customer?: Customer) => invoice.customerSnapshot || (customer ? { displayName: [customer.firstName, customer.lastName].filter(Boolean).join(" ") || customer.company || "", company: customer.company, street: customer.street, postalCode: customer.postalCode, city: customer.city, country: customer.country } : undefined);

export function InvoiceDocument({ invoice, customer, company }: { invoice: Invoice; customer?: Customer; company: Company }) {
  const client = clientData(invoice, customer); const isDraft = invoice.status === "draft";
  return <article id="invoice-print-root" className="invoice-preview-page invoice-document">
    {isDraft && <div className="draft-watermark">ENTWURF – noch keine endgültige Rechnung</div>}
    <header className="preview-head"><img src="/Logo Photographie Blitzidee Neu.png" alt="Photographie Blitzidee" /><div><strong>{company.name}</strong><span>{company.owner}</span><span>{company.street}, {company.postalCode} {company.city}</span><span>{company.email}</span><a href={company.website} target="_blank" rel="noopener noreferrer">photographie-blitzidee.de</a></div></header>
    <section className="preview-address"><small>{company.name} · {company.street} · {company.postalCode} {company.city}</small><strong>{client?.company || client?.displayName}</strong>{client?.company && <span>{client.displayName}</span>}<span>{client?.street}</span><span>{client?.postalCode} {client?.city}</span></section>
    <h1>{isDraft ? "Rechnungsentwurf" : "Rechnung"}</h1>
    <dl className="preview-meta"><div><dt>Rechnungsnummer</dt><dd>{isDraft ? `Entwurf (${invoice.draftNumber})` : invoice.invoiceNumber || "FEHLT"}</dd></div><div><dt>Rechnungsdatum</dt><dd>{formatDate(invoice.invoiceDate)}</dd></div><div><dt>Leistungsdatum</dt><dd>{formatDate(invoice.serviceDateFrom)}{invoice.serviceDateTo && ` – ${formatDate(invoice.serviceDateTo)}`}</dd></div><div><dt>Fällig am</dt><dd>{formatDate(invoice.dueDate)}</dd></div></dl>
    {invoice.introText && <p>{invoice.introText}</p>}
    <table><thead><tr><th>Pos.</th><th>Beschreibung</th><th>Menge</th><th>Einheit</th><th>Einzelpreis</th><th>Gesamt</th></tr></thead><tbody>{invoice.items.map((item, index) => <tr key={item.id}><td>{index + 1}</td><td>{item.description}{Boolean(item.discountCents) && <small>{item.discountType === "percent" ? `${item.discountValue} % Rabatt` : "Rabatt"}: −{euro(item.discountCents || 0)}</small>}</td><td>{item.quantityMilli / 1000}</td><td>{item.unit}</td><td>{euro(item.unitPriceCents)}</td><td>{euro(item.totalCents)}</td></tr>)}</tbody><tfoot>{Boolean(invoice.discountCents) && <><tr><th colSpan={5}>Zwischensumme</th><th>{euro(invoice.subtotalCents ?? invoice.totalCents)}</th></tr><tr><th colSpan={5}>Rabatt{invoice.discountType === "percent" ? ` ${invoice.discountValue} %` : ""}</th><th>−{euro(invoice.discountCents || 0)}</th></tr></>}<tr><th colSpan={5}>Gesamtbetrag</th><th>{euro(invoice.totalCents)}</th></tr></tfoot></table>
    {invoice.outroText && <p>{invoice.outroText}</p>}<p><strong>Zahlbar bis {formatDate(invoice.dueDate)}.</strong></p><p>{invoice.taxExemptionNote}</p>
    <footer><span>{company.bankName} · IBAN {company.iban} · BIC {company.bic}</span><span>Steuernummer {company.taxNumber} · {company.email} · {company.website}</span></footer>
  </article>;
}

export function InvoicePreview(props: { invoice: Invoice; customer?: Customer; company: Company; onClose: () => void }) {
  return <div className="preview-overlay" role="dialog" aria-modal="true" aria-label="Rechnungsvorschau"><div className="preview-toolbar print-hide"><button type="button" className="secondary" onClick={props.onClose}>Zurück</button><button type="button" className="primary" onClick={() => window.print()}>Drucken</button><span>Feste DIN-A4-Vorschau · Zoomen und Scrollen möglich</span></div><div className="invoice-preview-stage"><InvoiceDocument invoice={props.invoice} customer={props.customer} company={props.company} /></div></div>;
}
