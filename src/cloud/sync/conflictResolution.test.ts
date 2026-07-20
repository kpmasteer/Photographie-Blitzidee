import { describe, expect, it } from "vitest";
import { timestampWinner } from "./conflictResolution";

describe("zeitbasierter Cloud-Konfliktentscheid", () => {
  it("lädt die Cloud, wenn der lokale Stand älter oder gleich alt ist", () => {
    expect(timestampWinner("2026-07-20T09:59:59.000Z", "2026-07-20T10:00:00.000Z")).toBe("cloud");
    expect(timestampWinner("2026-07-20T10:00:00.000Z", "2026-07-20T12:00:00.000+02:00")).toBe("cloud");
  });

  it("lädt nur nachweislich neuere lokale Änderungen hoch", () => {
    expect(timestampWinner("2026-07-20T10:00:01.000Z", "2026-07-20T10:00:00.000Z")).toBe("local");
  });

  it("erzwingt bei fehlenden oder ungültigen Zeitstempeln einen Konflikt", () => {
    expect(timestampWinner(undefined, "2026-07-20T10:00:00.000Z")).toBe("conflict");
    expect(timestampWinner("kein-datum", "2026-07-20T10:00:00.000Z")).toBe("conflict");
  });
});
