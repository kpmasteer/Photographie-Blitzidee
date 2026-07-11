import { supabase } from "./client";

export interface CloudInvoiceState {
  id: string;
  localId: string;
  invoiceNumber?: string;
  status: string;
  finalizedAt?: string;
  updatedAt?: string;
  contentHash?: string;
}

type RemoteInvoiceRow = {
  id: string;
  local_id: string;
  invoice_number?: string | null;
  status: string;
  finalized_at?: string | null;
  updated_at?: string | null;
  content_hash?: string | null;
};

const normalizeRpcRow = (value: unknown): RemoteInvoiceRow => {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") throw new Error("Die Serverantwort zur Rechnung war unvollständig.");
  return row as RemoteInvoiceRow;
};

const toState = (row: RemoteInvoiceRow): CloudInvoiceState => ({
  id: row.id,
  localId: row.local_id,
  invoiceNumber: row.invoice_number || undefined,
  status: row.status,
  finalizedAt: row.finalized_at || undefined,
  updatedAt: row.updated_at || undefined,
  contentHash: row.content_hash || undefined
});

async function remoteInvoiceId(organizationId: string, localId: string): Promise<string> {
  if (!supabase) throw new Error("Cloud ist auf diesem Gerät nicht eingerichtet.");
  const { data, error } = await supabase
    .from("invoices")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("local_id", localId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error("Der Rechnungsentwurf konnte in der Cloud nicht geladen werden.");
  if (!data?.id) throw new Error("Der Rechnungsentwurf wurde noch nicht in die Cloud übertragen.");
  return String(data.id);
}

export async function finalizeCloudInvoice(organizationId: string, localId: string): Promise<CloudInvoiceState> {
  if (!supabase) throw new Error("Cloud ist auf diesem Gerät nicht eingerichtet.");
  const remoteId = await remoteInvoiceId(organizationId, localId);
  const { data, error } = await supabase.rpc("finalize_invoice", { p_invoice: remoteId });
  if (error) throw new Error(error.message || "Die Rechnung konnte serverseitig nicht finalisiert werden.");
  return toState(normalizeRpcRow(data));
}

export async function cancelCloudInvoice(
  organizationId: string,
  originalLocalId: string,
  correctionLocalId: string
): Promise<{ original: CloudInvoiceState; correction: CloudInvoiceState }> {
  if (!supabase) throw new Error("Cloud ist auf diesem Gerät nicht eingerichtet.");
  const [originalId, correctionId] = await Promise.all([
    remoteInvoiceId(organizationId, originalLocalId),
    remoteInvoiceId(organizationId, correctionLocalId)
  ]);
  const { data, error } = await supabase.rpc("cancel_invoice", {
    p_original: originalId,
    p_correction: correctionId
  });
  if (error) throw new Error(error.message || "Die Rechnung konnte nicht storniert werden.");
  const correction = toState(normalizeRpcRow(data));
  const { data: originalRow, error: originalError } = await supabase
    .from("invoices")
    .select("id,local_id,invoice_number,status,finalized_at,updated_at,content_hash")
    .eq("id", originalId)
    .single();
  if (originalError) throw new Error("Die stornierte Ursprungsrechnung konnte nicht bestätigt werden.");
  return { original: toState(originalRow as RemoteInvoiceRow), correction };
}

export async function sealCloudInvoice(
  organizationId: string,
  localId: string,
  contentHash: string
): Promise<CloudInvoiceState> {
  if (!supabase) throw new Error("Cloud ist auf diesem Gerät nicht eingerichtet.");
  const remoteId = await remoteInvoiceId(organizationId, localId);
  const { data, error } = await supabase
    .from("invoices")
    .update({ content_hash: contentHash })
    .eq("organization_id", organizationId)
    .eq("id", remoteId)
    .select("id,local_id,invoice_number,status,finalized_at,updated_at,content_hash")
    .single();
  if (error) throw new Error(error.message || "Der Dokument-Hash konnte nicht in der Cloud versiegelt werden.");
  return toState(data as RemoteInvoiceRow);
}
