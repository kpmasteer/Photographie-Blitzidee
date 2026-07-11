import { describe, expect, it } from "vitest";
import { describeCloudStatus } from "./context";
import type { CloudRuntimeStatus } from "./operations";

const runtime: CloudRuntimeStatus = { online: true, phase: "idle", pendingChanges: 0 };
const session = { user: { id: "user" } } as never;

describe("describeCloudStatus", () => {
  it("unterscheidet lokalen Betrieb und eine nicht angemeldete Cloud", () => {
    expect(describeCloudStatus(false, undefined, runtime)).toEqual({ label: "Nur auf diesem Gerät", tone: "local" });
    expect(describeCloudStatus(true, undefined, runtime)).toEqual({ label: "Nicht angemeldet", tone: "local" });
  });

  it("erklärt ausstehende Änderungen im Offlinemodus", () => {
    expect(describeCloudStatus(true, session, { ...runtime, online: false, pendingChanges: 2 })).toEqual({
      label: "Offline · 2 Änderungen warten",
      tone: "offline"
    });
  });

  it("zeigt laufenden und fehlgeschlagenen Abgleich eindeutig", () => {
    expect(describeCloudStatus(true, session, { ...runtime, phase: "syncing" }).tone).toBe("syncing");
    expect(describeCloudStatus(true, session, { ...runtime, phase: "error", lastError: "Netzwerk" }).tone).toBe("error");
  });
});
