import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../db";
import { addMonthsClamped, catchUpRecurringExpenses, periodKey } from "./recurringExpenses";

describe("wiederkehrende Ausgaben", () => {
  beforeEach(async () => { await db.delete(); await db.open(); });
  it("behandelt Monatsenden und Schaltjahre nachvollziehbar", () => { expect(addMonthsClamped("2026-01-31", 1)).toBe("2026-02-28"); expect(addMonthsClamped("2024-01-31", 1)).toBe("2024-02-29"); expect(addMonthsClamped("2024-02-29", 12)).toBe("2025-02-28"); });
  it("holt verpasste Monate nach, ohne Perioden zu duplizieren", async () => { const now = "2026-01-01T00:00:00.000Z"; await db.recurringExpenses.add({ id: "r1", name: "Cloudspeicher", supplier: "Cloud", category: "Computer und Software", amountCents: 1000, startDate: "2026-01-01", interval: "monthly", intervalMonths: 1, nextDueDate: "2026-01-01", status: "active", creationMode: "confirm", businessSharePercent: 100, createdAt: now, updatedAt: now }); expect(await catchUpRecurringExpenses("2026-03-15")).toBe(3); expect(await db.expenses.count()).toBe(3); expect(await catchUpRecurringExpenses("2026-03-15")).toBe(0); expect(await db.expenses.where("periodKey").equals(periodKey("r1", "2026-02-01")).count()).toBe(1); });
  it("schreibt ohne neue Fälligkeit keinen geräteübergreifenden Prüfzeitpunkt", async () => { const now = "2026-01-01T00:00:00.000Z"; await db.recurringExpenses.add({ id: "r2", name: "Versicherung", supplier: "Versicherer", category: "Versicherungen", amountCents: 2500, startDate: "2026-08-01", interval: "monthly", intervalMonths: 1, nextDueDate: "2026-08-01", status: "active", creationMode: "confirm", businessSharePercent: 100, createdAt: now, updatedAt: now }); const before = await db.recurringExpenses.get("r2"); expect(await catchUpRecurringExpenses("2026-07-20")).toBe(0); expect(await db.recurringExpenses.get("r2")).toEqual(before); });
});
