import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db";
import { annualFigures } from "../../lib/reporting";
import { openAmount } from "../../lib/money";
import type { Customer, Invoice, Payment } from "../../types";
import { syncRecordKey } from "./identity";
import { setActiveSyncOrganization } from "./localChanges";
import { reconcileCloudSnapshot, type CloudSnapshot } from "./reconcile";
import type { SyncEntityType, SyncMetadata, SyncQueueEntry } from "./types";

const organizationId = "11111111-1111-4111-8111-111111111111";
const timestamp = "2026-07-20T10:00:00.000Z";

const invoice = (
  id: string,
  status: Invoice["status"] = "draft",
  description = "Lokaler Text"
): Invoice => ({
  id,
  draftNumber: `ENTWURF-${id}`,
  invoiceNumber: status === "draft" ? undefined : `2026-${id}`,
  year: 2026,
  customerId: "customer-1",
  invoiceDate: "2026-07-01",
  serviceDateFrom: "2026-07-01",
  items: [{
    id: `item-${id}`,
    description,
    quantityMilli: 1_000,
    unit: "Pauschale",
    unitPriceCents: 10_000,
    totalCents: 10_000,
    sortOrder: 0
  }],
  totalCents: 10_000,
  paymentTermDays: 14,
  dueDate: "2026-07-15",
  status,
  introText: "",
  outroText: "",
  taxExemptionNote: "",
  createdAt: timestamp,
  updatedAt: timestamp,
  finalizedAt: status === "draft" ? undefined : timestamp,
  imported: false
});

const payment = (id: string, invoiceId: string, amountCents = 10_000): Payment => ({
  id,
  invoiceId,
  amountCents,
  paidAt: "2026-07-20",
  method: "Überweisung",
  createdAt: timestamp
});

const metadata = (
  entityType: SyncEntityType,
  entityId: string,
  remoteId = `remote-${entityId}`,
  deletedAt?: string
): SyncMetadata => ({
  id: syncRecordKey(organizationId, entityType, entityId),
  organizationId,
  entityType,
  entityId,
  remoteId,
  remoteVersion: 1,
  remoteUpdatedAt: timestamp,
  localUpdatedAt: timestamp,
  lastSyncedAt: timestamp,
  lastSyncedHash: `hash-${entityId}`,
  deletedAt
});

const emptySnapshot = (): CloudSnapshot => ({
  customers: [],
  invoices: [],
  payments: [],
  expenses: [],
  recurringExpenses: [],
  serviceTemplates: [],
  importLogs: [],
  attachments: [],
  metadata: [],
  downloaded: 0
});

beforeEach(async () => {
  await db.open();
  setActiveSyncOrganization(undefined);
  await db.transaction("rw", db.tables, async () => {
    await Promise.all(db.tables.map((table) => table.clear()));
  });
});

describe("Cloud-Snapshot als führender Datenstand", () => {
  it("ersetzt Rechnungen samt Positionen und entfernt lokale Geisterdaten", async () => {
    const staleInvoice = invoice("invoice-1", "finalized", "Alter Positionstext");
    const ghostDraft = invoice("ghost-draft");
    const stalePayment = payment("ghost-payment", ghostDraft.id);
    await db.invoices.bulkPut([staleInvoice, ghostDraft]);
    await db.payments.put(stalePayment);
    await db.syncMetadata.bulkPut([
      metadata("invoice", staleInvoice.id),
      metadata("invoice", ghostDraft.id),
      metadata("payment", stalePayment.id)
    ]);

    const cloudInvoice = {
      ...invoice("invoice-1", "paid", "Cloud-Position"),
      paidAt: "2026-07-20",
      updatedAt: "2026-07-20T11:00:00.000Z"
    };
    const cloudPayment = payment("payment-1", cloudInvoice.id);
    const snapshot = emptySnapshot();
    snapshot.invoices = [cloudInvoice];
    snapshot.payments = [cloudPayment];
    snapshot.metadata = [
      metadata("invoice", cloudInvoice.id),
      metadata("payment", cloudPayment.id)
    ];
    snapshot.downloaded = 3;

    const result = await reconcileCloudSnapshot(organizationId, snapshot);

    expect(result.deleted).toBe(2);
    expect(await db.invoices.get(ghostDraft.id)).toBeUndefined();
    expect(await db.payments.get(stalePayment.id)).toBeUndefined();
    expect(await db.invoices.get(cloudInvoice.id)).toMatchObject({
      status: "paid",
      paidAt: "2026-07-20",
      items: [{ description: "Cloud-Position" }]
    });
    expect(await db.payments.toArray()).toEqual([cloudPayment]);
  });

  it("schützt ausdrücklich noch nicht synchronisierte lokale Änderungen", async () => {
    const localCustomer: Customer = {
      id: "customer-1",
      customerNumber: "K-0001",
      firstName: "Lokal",
      lastName: "Neuer",
      street: "Lokalweg 1",
      postalCode: "26683",
      city: "Saterland",
      country: "Deutschland",
      archived: false,
      createdAt: timestamp,
      updatedAt: "2026-07-20T12:00:00.000Z"
    };
    const cloudCustomer = {
      ...localCustomer,
      firstName: "Cloud",
      updatedAt: "2026-07-20T11:00:00.000Z"
    };
    const key = syncRecordKey(organizationId, "customer", localCustomer.id);
    const queue: SyncQueueEntry = {
      id: "queue-1",
      dedupeKey: key,
      organizationId,
      entityType: "customer",
      entityId: localCustomer.id,
      operation: "upsert",
      status: "pending",
      attempts: 0,
      createdAt: timestamp,
      updatedAt: localCustomer.updatedAt,
      nextAttemptAt: timestamp
    };
    await db.customers.put(localCustomer);
    await db.syncQueue.put(queue);

    const snapshot = emptySnapshot();
    snapshot.customers = [cloudCustomer];
    snapshot.metadata = [metadata("customer", localCustomer.id)];

    await reconcileCloudSnapshot(organizationId, snapshot);

    expect((await db.customers.get(localCustomer.id))?.firstName).toBe("Lokal");
    expect(await db.syncQueue.get(queue.id)).toBeDefined();
    expect(await db.syncMetadata.get(key)).toBeUndefined();
  });

  it("verwirft eine finalisierte Rechnung bei unerklärlichem Cloud-Fehlen nicht still", async () => {
    const finalInvoice = invoice("invoice-final", "finalized");
    await db.invoices.put(finalInvoice);
    await db.syncMetadata.put(metadata("invoice", finalInvoice.id));

    const result = await reconcileCloudSnapshot(organizationId, emptySnapshot());

    expect(result.preservedFinalizedInvoices).toEqual([finalInvoice.id]);
    expect(await db.invoices.get(finalInvoice.id)).toEqual(finalInvoice);
    expect(await db.syncMetadata.get(syncRecordKey(organizationId, "invoice", finalInvoice.id))).toBeDefined();
  });

  it("ist wiederholbar und liefert auf allen Geräten dieselben offenen Beträge und Auswertungen", async () => {
    const cloudInvoice = invoice("invoice-open", "partially_paid", "Fotoshooting");
    const cloudPayment = payment("payment-partial", cloudInvoice.id, 2_500);
    const snapshot = emptySnapshot();
    snapshot.invoices = [cloudInvoice];
    snapshot.payments = [cloudPayment];
    snapshot.metadata = [
      metadata("invoice", cloudInvoice.id),
      metadata("payment", cloudPayment.id)
    ];

    const first = await reconcileCloudSnapshot(organizationId, snapshot);
    const second = await reconcileCloudSnapshot(organizationId, snapshot);
    const invoices = await db.invoices.toArray();
    const payments = await db.payments.toArray();

    expect(first.changed).toBe(2);
    expect(second).toMatchObject({ changed: 0, deleted: 0 });
    expect(invoices).toHaveLength(1);
    expect(payments).toHaveLength(1);
    expect(openAmount(invoices[0]!.totalCents, payments)).toBe(7_500);
    expect(annualFigures(2026, invoices, payments, [])).toEqual({
      incomeCents: 2_500,
      expenseCents: 0,
      profitCents: 2_500,
      openCents: 10_000
    });
  });
});
