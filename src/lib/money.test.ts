import { describe, expect, it } from "vitest";
import { calculateDiscount, itemTotal, openAmount, parseEuroToCents, parsePriceInput } from "./money";

describe("cent-genaue Geldberechnung", () => {
  it("addiert Euroeingaben ohne Gleitkommafehler", () => expect(parseEuroToCents("0,10") + parseEuroToCents("0,20")).toBe(30));
  it("interpretiert deutsche Tausendertrennzeichen", () => expect(parseEuroToCents("1.234,56 €")).toBe(123456));
  it("berechnet Menge mal Einzelpreis", () => expect(itemTotal(2500, 1999)).toBe(4998));
  it("rundet halbe Cent kaufmännisch auf ganze Cent", () => expect(itemTotal(1500, 101)).toBe(152));
  it("berechnet eine Teilzahlung", () => expect(openAmount(20_000, [{ amountCents: 5_000 }])).toBe(15_000));
  it("lässt keinen negativen offenen Betrag zu", () => expect(openAmount(10_000, [{ amountCents: 12_000 }])).toBe(0));
});

describe("Einzelpreiseingabe", () => {
  it.each([["10", 1000], ["10,5", 1050], ["10,50", 1050], ["10.5", 1050], ["10.50", 1050], ["0,50", 50], ["0.50", 50], ["1000,00", 100000]])("normalisiert %s centgenau", (value, expected) => expect(parsePriceInput(value)).toMatchObject({ valid: true, cents: expected }));
  it.each(["", "1,234", "abc", "1.2.3"])("weist %s zurück", (value) => expect(parsePriceInput(value).valid).toBe(false));
});

describe("Rabatte", () => {
  it("berechnet 10 Prozent centgenau", () => expect(calculateDiscount(25_000, "percent", 10)).toEqual({ discountCents: 2500, totalCents: 22500 }));
  it("berechnet einen festen Rabatt", () => expect(calculateDiscount(25_000, "fixed", 2500)).toEqual({ discountCents: 2500, totalCents: 22500 }));
  it("erlaubt 100 Prozent", () => expect(calculateDiscount(999, "percent", 100).totalCents).toBe(0));
  it("verweigert mehr als 100 Prozent", () => expect(() => calculateDiscount(1000, "percent", 101)).toThrow());
  it("verweigert einen zu großen Festbetrag", () => expect(() => calculateDiscount(1000, "fixed", 1001)).toThrow());
});
