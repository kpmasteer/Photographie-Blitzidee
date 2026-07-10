import { useLiveQuery } from "dexie-react-hooks";
import { BellRing, CalendarClock, CheckCircle2 } from "lucide-react";
import { audit, db, newId } from "../db";
import { formatDate, isoToday } from "../lib/date";
import { euro, openAmount } from "../lib/money";
import { duePaymentReminders, initialReminderDate, nextReminderDate, type ReminderDelay } from "../lib/reminders";

const delayLabels: Record<ReminderDelay, string> = {
  tomorrow: "Morgen",
  week: "In einer Woche",
  month: "In einem Monat"
};

export function PaymentReminder() {
  const invoices = useLiveQuery(() => db.invoices.toArray(), [], []);
  const payments = useLiveQuery(() => db.payments.toArray(), [], []);
  const customers = useLiveQuery(() => db.customers.toArray(), [], []);
  const today = isoToday();
  const reminders = duePaymentReminders(invoices, payments, today);
  const invoice = reminders[0];
  if (!invoice) return null;

  const invoicePayments = payments.filter((payment) => payment.invoiceId === invoice.id);
  const outstandingCents = openAmount(invoice.totalCents, invoicePayments);
  const customer = customers.find((item) => item.id === invoice.customerId);
  const customerName = invoice.customerSnapshot?.displayName || [customer?.firstName, customer?.lastName].filter(Boolean).join(" ") || customer?.company || "Unbekannter Kunde";
  const reminderDate = invoice.paymentReminderAt || initialReminderDate(invoice);

  const markPaid = async () => {
    const timestamp = new Date().toISOString();
    await db.transaction("rw", [db.invoices, db.payments, db.auditLogs], async () => {
      await db.payments.add({
        id: newId("payment"), invoiceId: invoice.id, amountCents: outstandingCents, paidAt: today,
        method: "Überweisung", note: "Über Zahlungserinnerung als bezahlt markiert", createdAt: timestamp
      });
      await db.invoices.update(invoice.id, {
        status: "paid", paidAt: today, paymentMethod: "Überweisung",
        paymentReminderCompletedAt: timestamp, paymentReminderLastShownAt: timestamp, updatedAt: timestamp
      });
      await audit("payment-reminder-paid", "invoice", invoice.id, undefined, { amountCents: outstandingCents, paidAt: today });
    });
  };

  const snooze = async (delay: ReminderDelay) => {
    const timestamp = new Date().toISOString();
    const paymentReminderAt = nextReminderDate(today, delay);
    await db.invoices.update(invoice.id, { paymentReminderAt, paymentReminderLastShownAt: timestamp, updatedAt: timestamp });
    await audit("payment-reminder-snooze", "invoice", invoice.id, undefined, { paymentReminderAt, delay });
  };

  return <div className="modal-backdrop reminder-backdrop">
    <section className="modal payment-reminder" role="dialog" aria-modal="true" aria-labelledby="payment-reminder-title">
      <div className="reminder-icon"><BellRing aria-hidden="true" /></div>
      <span className="eyebrow">Ausstehender Zahlungseingang</span>
      <h2 id="payment-reminder-title">Zahlung für Rechnung {invoice.invoiceNumber} prüfen</h2>
      <p>Für die Rechnung an <strong>{customerName}</strong> ist noch kein vollständiger Zahlungseingang erfasst. Die erste Erinnerung ist 14 Tage nach dem Rechnungsdatum fällig.</p>
      <dl className="summary reminder-summary">
        <div><dt>Rechnungsdatum</dt><dd>{formatDate(invoice.invoiceDate)}</dd></div>
        <div><dt>Erinnerung fällig</dt><dd>{formatDate(reminderDate)}</dd></div>
        <div className="total"><dt>Offener Betrag</dt><dd>{euro(outstandingCents)}</dd></div>
      </dl>
      {reminders.length > 1 && <p className="reminder-queue">Danach warten noch {reminders.length - 1} weitere Zahlungserinnerung(en).</p>}
      <button className="primary full reminder-paid" onClick={markPaid}><CheckCircle2 /> Als bezahlt markieren</button>
      <div className="snooze-block"><span><CalendarClock /> Später erneut erinnern</span><div className="snooze-actions">{(Object.keys(delayLabels) as ReminderDelay[]).map((delay) => <button className="secondary" key={delay} onClick={() => snooze(delay)}>{delayLabels[delay]}</button>)}</div></div>
    </section>
  </div>;
}
