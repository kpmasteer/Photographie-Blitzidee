import { describe, expect, it } from "vitest";
import { isUuid, stableRemoteId } from "./identity";

describe("deterministische Sync-IDs", () => {
  it("bildet dieselbe lokale Präfix-ID reproduzierbar auf eine UUIDv8 ab", async () => {
    const first = await stableRemoteId("11111111-1111-4111-8111-111111111111", "invoice", "invoice_abc");
    const second = await stableRemoteId("11111111-1111-4111-8111-111111111111", "invoice", "invoice_abc");
    expect(first).toBe(second);
    expect(isUuid(first)).toBe(true);
    expect(first[14]).toBe("8");
  });

  it("trennt Organisationen und Entitätstypen und behält echte UUIDs", async () => {
    const existing = "8D12C39B-2A01-4E7A-9F21-10E3DBD04AE4";
    expect(await stableRemoteId("org-a", "customer", existing)).toBe(existing.toLowerCase());
    expect(await stableRemoteId("org-a", "customer", "same-id")).not.toBe(await stableRemoteId("org-a", "invoice", "same-id"));
    expect(await stableRemoteId("org-a", "customer", "same-id")).not.toBe(await stableRemoteId("org-b", "customer", "same-id"));
  });
});
