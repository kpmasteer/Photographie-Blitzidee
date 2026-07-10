import { describe, expect, it } from "vitest";
import type { Invoice, Payment } from "../types";
import { duePaymentReminders, initialReminderDate, nextReminderDate, reminderIsDue } from "./reminders";

const invoice = (patch: Partial<Invoice> = {}): Invoice => ({
  id: "invoice-1", draftNumber: "D", invoiceNumber: "00007", year: 2026, customerId: "customer-1",
  invoiceDate: "2026-06-01", serviceDateFrom: "2026-06-01", items: [], totalCents: 10_000,
  paymentTermDays: 14, dueDate: "2026-06-15", status: "finalized", introText: "", outroText: "",
  taxExemptionNote: "§ 19", createdAt: "2026-06-01", updatedAt: "2026-06-01", imported: false,
  ...patch
});

describe("Zahlungserinnerungen", () => {
  it("erinnert erstmals 14 Tage nach dem Rechnungsdatum", () => expect(initialReminderDate(invoice())).toBe("2026-06-15"));
  it("erinnert nicht vor Ablauf der 14 Tage", () => expect(reminderIsDue(invoice(), [], "2026-06-14")).toBe(false));
  it("erinnert bei offenem Betrag am Stichtag", () => expect(reminderIsDue(invoice(), [], "2026-06-15")).toBe(true));
  it("erinnert bei Teilzahlung weiterhin", () => {
    const payments: Payment[] = [{ id: "p", invoiceId: "invoice-1", amountCents: 4_000, paidAt: "2026-06-10", method: "Bank", createdAt: "" }];
    expect(reminderIsDue(invoice(), payments, "2026-06-15")).toBe(true);
  });
  it("erinnert nicht bei vollständiger Zahlung oder Storno", () => {
    const payments: Payment[] = [{ id: "p", invoiceId: "invoice-1", amountCents: 10_000, paidAt: "2026-06-10", method: "Bank", createdAt: "" }];
    expect(reminderIsDue(invoice(), payments, "2026-06-15")).toBe(false);
    expect(reminderIsDue(invoice({ status: "cancelled" }), [], "2026-06-15")).toBe(false);
  });
  it("verlängert auf morgen, eine Woche oder einen Kalendermonat", () => {
    expect(nextReminderDate("2026-07-10", "tomorrow")).toBe("2026-07-11");
    expect(nextReminderDate("2026-07-10", "week")).toBe("2026-07-17");
    expect(nextReminderDate("2026-07-10", "month")).toBe("2026-08-10");
    expect(nextReminderDate("2027-01-31", "month")).toBe("2027-02-28");
  });
  it("verwendet einen ausdrücklich verlängerten Termin", () => expect(reminderIsDue(invoice({ paymentReminderAt: "2026-07-20" }), [], "2026-07-10")).toBe(false));
  it("sortiert mehrere fällige Erinnerungen chronologisch", () => {
    const second = invoice({ id: "invoice-2", invoiceDate: "2026-05-01" });
    expect(duePaymentReminders([invoice(), second], [], "2026-07-10").map((item) => item.id)).toEqual(["invoice-2", "invoice-1"]);
  });
});
