import { DB_SCHEMA_VERSION, APP_VERSION, db } from "../db";
import type { AppSetting, Attachment, AuditLog, Company, Customer, Expense, ImportLog, Invoice, Payment, RecurringExpense, ServiceTemplate } from "../types";
import { downloadBlob } from "./pdf";

type BackupPayload = {
  format: "photographie-blitzidee-backup";
  formatVersion: 1;
  schemaVersion: number;
  appVersion: string;
  createdAt: string;
  data: {
    company: Company[]; customers: Customer[]; invoices: Invoice[]; payments: Payment[];
    expenses: Expense[]; attachments: Attachment[]; auditLogs: AuditLog[]; importLogs: ImportLog[]; settings: AppSetting[]; serviceTemplates?: ServiceTemplate[]; recurringExpenses?: RecurringExpense[];
  };
  checksum?: string;
};

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};
const base64ToBytes = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
const sha256 = async (value: string) => bytesToBase64(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));

const serialize = (_key: string, value: unknown) => value instanceof Blob ? {
  __blob: true, type: value.type, data: "__PENDING_BLOB__"
} : value;

async function encodeBlobs(value: unknown): Promise<unknown> {
  if (value instanceof Blob) return { __blob: true, type: value.type, data: bytesToBase64(new Uint8Array(await value.arrayBuffer())) };
  if (Array.isArray(value)) return Promise.all(value.map(encodeBlobs));
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) result[key] = await encodeBlobs(item);
    return result;
  }
  return value;
}

function decodeBlobs(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decodeBlobs);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (record.__blob === true && typeof record.data === "string") return new Blob([base64ToBytes(record.data)], { type: String(record.type || "application/octet-stream") });
    return Object.fromEntries(Object.entries(record).map(([key, item]) => [key, decodeBlobs(item)]));
  }
  return value;
}

export async function createBackupBlob(password?: string) {
  const raw: BackupPayload = {
    format: "photographie-blitzidee-backup", formatVersion: 1, schemaVersion: DB_SCHEMA_VERSION,
    appVersion: APP_VERSION, createdAt: new Date().toISOString(),
    data: {
      company: await db.company.toArray(), customers: await db.customers.toArray(), invoices: await db.invoices.toArray(),
      payments: await db.payments.toArray(), expenses: await db.expenses.toArray(), attachments: await db.attachments.toArray(),
      auditLogs: await db.auditLogs.toArray(), importLogs: await db.importLogs.toArray(),
      settings: (await db.settings.toArray()).filter((setting) => !setting.key.startsWith("cloudMigration:")),
      serviceTemplates: await db.serviceTemplates.toArray(), recurringExpenses: await db.recurringExpenses.toArray()
    }
  };
  const withBlobs = await encodeBlobs(raw) as BackupPayload;
  const body = JSON.stringify(withBlobs, serialize);
  withBlobs.checksum = await sha256(body);
  const plaintext = JSON.stringify(withBlobs);
  let blob: Blob;
  let extension: string;
  if (password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 250_000, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
    const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext)));
    blob = new Blob([JSON.stringify({ format: "photographie-blitzidee-encrypted-backup", version: 1, salt: bytesToBase64(salt), iv: bytesToBase64(iv), data: bytesToBase64(encrypted) })], { type: "application/json" });
    extension = "encrypted.json";
  } else {
    blob = new Blob([plaintext], { type: "application/json" });
    extension = "json";
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `Blitzidee_Backup_${stamp}.${extension}`;
  return { blob, filename };
}

export async function exportBackup(password?: string) {
  const { blob, filename } = await createBackupBlob(password);
  // Safari/iPadOS teilt JSON-Dateien je nach Version nicht als application/json,
  // akzeptiert dieselbe unveränderte .json-Datei aber zuverlässig als Textdatei.
  const file = new File([blob], filename, { type: "text/plain" });
  let delivery: "shared" | "downloaded" = "downloaded";
  if (navigator.canShare?.({ files: [file] }) && navigator.share) {
    try {
      await navigator.share({ title: "Photographie Blitzidee – vollständiges Backup", text: "Sicherungsdatei der Rechnungsapp", files: [file] });
      delivery = "shared";
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return { delivery: "cancelled" as const, filename };
      downloadBlob(blob, filename);
    }
  } else downloadBlob(blob, filename);
  await db.settings.put({ key: "lastBackupAt", value: new Date().toISOString() });
  return { delivery, filename };
}

async function decryptIfNeeded(parsed: Record<string, unknown>, password?: string) {
  if (parsed.format !== "photographie-blitzidee-encrypted-backup") return parsed;
  if (!password) throw new Error("Für dieses verschlüsselte Backup wird das Passwort benötigt.");
  const salt = base64ToBytes(String(parsed.salt)); const iv = base64ToBytes(String(parsed.iv)); const data = base64ToBytes(String(parsed.data));
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 250_000, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  try {
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
    return JSON.parse(new TextDecoder().decode(plaintext)) as Record<string, unknown>;
  } catch { throw new Error("Backup konnte nicht entschlüsselt werden. Ist das Passwort korrekt?"); }
}

export async function restoreBackup(file: File, password?: string) {
  const parsed = await decryptIfNeeded(JSON.parse(await file.text()) as Record<string, unknown>, password);
  if (parsed.format !== "photographie-blitzidee-backup" || parsed.formatVersion !== 1) throw new Error("Unbekanntes oder nicht unterstütztes Backup-Format.");
  const checksum = typeof parsed.checksum === "string" ? parsed.checksum : undefined;
  delete parsed.checksum;
  if (!checksum || await sha256(JSON.stringify(parsed, serialize)) !== checksum) throw new Error("Integritätsprüfung fehlgeschlagen. Das Backup ist möglicherweise beschädigt.");
  const payload = decodeBlobs(parsed) as BackupPayload;
  if (!payload.data || !Array.isArray(payload.data.customers) || !Array.isArray(payload.data.invoices)) throw new Error("Das Backup enthält keine gültige Datenstruktur.");
  await db.transaction("rw", [db.company, db.customers, db.invoices, db.payments, db.expenses, db.attachments, db.auditLogs, db.importLogs, db.settings, db.serviceTemplates, db.recurringExpenses, db.syncQueue, db.syncMetadata, db.syncConflicts, db.syncLogs], async () => {
    await Promise.all([db.company.clear(), db.customers.clear(), db.invoices.clear(), db.payments.clear(), db.expenses.clear(), db.attachments.clear(), db.auditLogs.clear(), db.importLogs.clear(), db.settings.clear(), db.serviceTemplates.clear(), db.recurringExpenses.clear(), db.syncQueue.clear(), db.syncMetadata.clear(), db.syncConflicts.clear(), db.syncLogs.clear()]);
    await db.company.bulkPut(payload.data.company); await db.customers.bulkPut(payload.data.customers); await db.invoices.bulkPut(payload.data.invoices);
    await db.payments.bulkPut(payload.data.payments); await db.expenses.bulkPut(payload.data.expenses); await db.attachments.bulkPut(payload.data.attachments);
    await db.auditLogs.bulkPut(payload.data.auditLogs); await db.importLogs.bulkPut(payload.data.importLogs);
    await db.settings.bulkPut(payload.data.settings.filter((setting) => !setting.key.startsWith("cloudMigration:")));
    await db.serviceTemplates.bulkPut(payload.data.serviceTemplates || []); await db.recurringExpenses.bulkPut(payload.data.recurringExpenses || []);
  });
  return { customers: payload.data.customers.length, invoices: payload.data.invoices.length, expenses: payload.data.expenses.length };
}
