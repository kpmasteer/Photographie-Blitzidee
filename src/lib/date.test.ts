import { describe, expect, it } from "vitest";
import { addDays, excelSerialToIso } from "./date";

describe("Datumsfunktionen", () => {
  it("übernimmt historische Excel-Seriennummern", () => expect(excelSerialToIso(42512)).toBe("2016-05-22"));
  it("berechnet das Zahlungsziel", () => expect(addDays("2026-07-10", 14)).toBe("2026-07-24"));
  it("behandelt ein geleertes oder ungültiges Datumsfeld sicher", () => {
    expect(addDays("", 14)).toBe("");
    expect(addDays("ungültig", 14)).toBe("");
  });
});
