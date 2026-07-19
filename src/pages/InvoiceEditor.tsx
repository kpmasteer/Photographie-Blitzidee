import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Copy, Download, Eye, FileCheck2, Plus, Printer, Save, Share2, Trash2, WalletCards, XCircle } from "lucide-react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { audit, db, newId } from "../db";
import { addDays, formatDate } from "../lib/date";
import { euro, openAmount, parseEuroToCents, parsePriceInput } from "../lib/money";
import { calculateInvoice } from "../lib/invoiceCalculation";
import { InvoicePreview } from "../components/InvoicePreview";
import { createInvoicePdf, downloadBlob, openPdfInWindow, prefersNativePdfShare, sharePdfFile } from "../lib/pdf";
import { makeDraft } from "../lib/seed";
import type { Company, Invoice, InvoiceItem, InvoiceStatus, Payment } from "../types";
import { useCloud } from "../cloud/context";
import { cancelCloudInvoice, finalizeCloudInvoice, sealCloudInvoice } from "../cloud/invoiceActions";
import { withRemoteWriteSuppressed } from "../cloud/sync/localChanges";
import { confirmCloudWrite } from "../cloud/writeFeedback";

const statusLabels: Record<InvoiceStatus, string> = { draft: "Entwurf", finalized: "Finalisiert", sent: "Versendet", partially_paid: "Teilbezahlt", paid: "Bezahlt", overdue: "Überfällig", cancelled: "Storniert" };

function EditableChoice({ label, value, disabled, options, multiline = false, placeholder, onChange, onBlur }: { label: string; value: string; disabled: boolean; options: { value: string; label: string }[]; multiline?: boolean; placeholder?: string; onChange: (value: string) => void; onBlur?: () => void }) {
  const input = multiline
    ? <textarea value={value} disabled={disabled} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} onBlur={onBlur} />
    : <input value={value} disabled={disabled} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} onBlur={onBlur} />;
  return <label className="editable-choice-label">{label}<span className="editable-choice">{input}<select value="" disabled={disabled} aria-label={`${label} auswählen`} onChange={(event) => { if (event.target.value) onChange(event.target.value === "__empty__" ? "" : event.target.value); }}><option value="">Auswählen</option>{options.map((option) => <option key={`${option.value}:${option.label}`} value={option.value}>{option.label}</option>)}</select></span></label>;
}

const snapshotCompany = (company: Company) => {
  const { confirmedAt: _confirmedAt, updatedAt: _updatedAt, customerNumberConfig: _customerNumberConfig, ...snapshot } = company;
  void _confirmedAt; void _updatedAt; void _customerNumberConfig;
  return snapshot;
};

export function InvoiceEditor() {
  const { invoiceId } = useParams(); const navigate = useNavigate(); const [searchParams] = useSearchParams();
  const cloud = useCloud();
  const canWrite = !cloud.configured || cloud.membership?.role !== "read_only";
  const company = useLiveQuery(() => db.company.get("company"), [], undefined);
  const customers = useLiveQuery(() => db.customers.filter((customer) => !customer.archived).sortBy("lastName"), [], []);
  const stored = useLiveQuery<Invoice | undefined, undefined>(async () => invoiceId ? await db.invoices.get(invoiceId) : undefined, [invoiceId], undefined);
  const payments = useLiveQuery<Payment[], Payment[]>(async () => invoiceId ? await db.payments.where("invoiceId").equals(invoiceId).toArray() : [], [invoiceId], []);
  const templates = useLiveQuery(() => db.serviceTemplates.filter((template) => !template.archived).sortBy("sortOrder"), [], []);
  const [form, setForm] = useState<Invoice>(); const [message, setMessage] = useState(""); const [errors, setErrors] = useState<string[]>([]); const [busy, setBusy] = useState(false);
  const [priceInputs, setPriceInputs] = useState<Record<string, string>>({}); const [discountInputs, setDiscountInputs] = useState<Record<string, string>>({}); const [itemErrors, setItemErrors] = useState<Record<string, string[]>>({}); const [showPreview, setShowPreview] = useState(false);
  const declinedTemplateTexts = useRef(new Set<string>());
  useEffect(() => {
    const selectQuantity = (event: FocusEvent) => {
      const input = event.target;
      if (input instanceof HTMLInputElement && input.type === "number" && input.step === "0.001") input.select();
    };
    document.addEventListener("focusin", selectQuantity);
    return () => document.removeEventListener("focusin", selectQuantity);
  }, []);
  useEffect(() => { if (stored) setForm(stored); else if (!invoiceId && company && !form) setForm(makeDraft(company, searchParams.get("customer") || "")); }, [stored, invoiceId, company, form, searchParams]);
  const isDraft = form?.status === "draft";
  const editable = isDraft && canWrite;
  const selectedCustomer = customers.find((customer) => customer.id === form?.customerId);
  const paidCents = payments.reduce((sum, payment) => sum + payment.amountCents, 0);
  const restCents = form ? openAmount(form.totalCents, payments) : 0;
  const update = <K extends keyof Invoice>(key: K, value: Invoice[K]) => setForm((current) => current ? { ...current, [key]: value, updatedAt: new Date().toISOString() } : current);
  const recalc = (items: InvoiceItem[], invoiceDiscount?: { type?: Invoice["discountType"]; value?: number }) => { if (!form) return; const type = invoiceDiscount ? invoiceDiscount.type : form.discountType; const value = invoiceDiscount ? invoiceDiscount.value || 0 : form.discountValue || 0; const result = calculateInvoice(items, type, value); setErrors(Object.values(result.errors)); setForm({ ...form, items: result.items, subtotalCents: result.subtotalCents, discountCents: result.discountCents, totalCents: result.totalCents, discountType: type, discountValue: value, updatedAt: new Date().toISOString() }); };
  const patchItem = (id: string, patch: Partial<InvoiceItem>) => recalc(form!.items.map((item) => {
    if (item.id !== id) return item; return { ...item, ...patch };
  }));
  const selectDescription = (item: InvoiceItem, description: string) => {
    const template = templates.find((entry) => entry.description === description);
    patchItem(item.id, { description });
    if (template) void db.serviceTemplates.update(template.id, { usageCount: template.usageCount + 1, updatedAt: new Date().toISOString() });
  };
  const offerDescriptionTemplate = async (item: InvoiceItem) => {
    const description = item.description.trim();
    const normalized = description.toLocaleLowerCase("de-DE");
    if (!description || templates.some((template) => template.description.trim().toLocaleLowerCase("de-DE") === normalized) || declinedTemplateTexts.current.has(normalized)) return;
    if (!window.confirm("Möchtest du diesen neuen Beschreibungstext als Vorlage speichern?")) { declinedTemplateTexts.current.add(normalized); return; }
    const now = new Date().toISOString();
    await db.serviceTemplates.add({ id: newId("template"), title: description.split(/[,.]/)[0]!.slice(0, 80), description, sortOrder: await db.serviceTemplates.count(), archived: false, usageCount: 0, createdAt: now, updatedAt: now });
    setMessage("Beschreibung wurde als Vorlage gespeichert.");
  };
  const addItem = () => recalc([...(form?.items || []), { id: newId("item"), description: "", quantityMilli: 1000, unit: "Pauschale", unitPriceCents: 0, totalCents: 0, sortOrder: form?.items.length || 0 }]);
  const duplicateItem = (item: InvoiceItem) => { const copy = { ...item, id: newId("item"), sortOrder: form?.items.length || 0 }; setPriceInputs((v) => ({ ...v, [copy.id]: v[item.id] ?? (item.unitPriceCents / 100).toFixed(2).replace(".", ",") })); recalc([...(form?.items || []), copy]); };
  const removeItem = (id: string) => { const remaining = (form?.items || []).filter((item) => item.id !== id).map((item, sortOrder) => ({ ...item, sortOrder })); recalc(remaining.length ? remaining : [{ id: newId("item"), description: "", quantityMilli: 1000, unit: "Pauschale", unitPriceCents: 0, totalCents: 0, sortOrder: 0 }]); };
  const priceValue = (item: InvoiceItem) => priceInputs[item.id] ?? (item.unitPriceCents / 100).toFixed(2).replace(".", ",");
  const commitPrice = (item: InvoiceItem, raw = priceValue(item)) => { const parsed = parsePriceInput(raw); if (!parsed.valid) return false; setPriceInputs((values) => ({ ...values, [item.id]: parsed.normalized })); patchItem(item.id, { unitPriceCents: parsed.cents }); return true; };
  const discountValueText = (key: string, type: InvoiceItem["discountType"], value = 0) => discountInputs[key] ?? (type === "fixed" ? (value / 100).toFixed(2).replace(".", ",") : String(value || ""));
  const changeItemDiscount = (item: InvoiceItem, raw: string) => { setDiscountInputs((current) => ({ ...current, [item.id]: raw })); if (raw === "") return; if (item.discountType === "fixed") { const parsed = parsePriceInput(raw); if (parsed.valid) patchItem(item.id, { discountValue: parsed.cents }); } else { const value = Number(raw.replace(",", ".")); if (Number.isFinite(value)) patchItem(item.id, { discountValue: value }); } };
  const changeInvoiceDiscount = (raw: string) => { setDiscountInputs((current) => ({ ...current, invoice: raw })); if (raw === "") return; if (form?.discountType === "fixed") { const parsed = parsePriceInput(raw); if (parsed.valid) recalc(form.items, { type: "fixed", value: parsed.cents }); } else { const value = Number(raw.replace(",", ".")); if (form && Number.isFinite(value)) recalc(form.items, { type: "percent", value }); } };
  const validate = () => {
    const found: string[] = [];
    if (!company?.confirmedAt) found.push("Unternehmensprofil wurde nicht bestätigt.");
    if (!company?.taxNumber) found.push("Steuernummer fehlt.");
    if (!form?.customerId || !selectedCustomer) found.push("Kunde fehlt.");
    if (selectedCustomer && (!selectedCustomer.street || !selectedCustomer.postalCode || !selectedCustomer.city)) found.push("Kundenanschrift ist unvollständig.");
    if (!form?.invoiceDate) found.push("Rechnungsdatum fehlt."); if (!form?.serviceDateFrom) found.push("Leistungsdatum fehlt.");
    const perItem: Record<string, string[]> = {};
    for (const item of form?.items || []) { const issues: string[] = []; if (!item.description.trim()) issues.push("Bitte eine Beschreibung eingeben."); if (!(item.quantityMilli > 0)) issues.push("Bitte eine Menge größer als null eingeben."); const price = parsePriceInput(priceValue(item)); if (!price.valid) issues.push("Bitte einen gültigen Einzelpreis eingeben (z. B. 12,50)."); if (issues.length) perItem[item.id] = issues; }
    setItemErrors(perItem); if (!form?.items.length || Object.keys(perItem).length) found.push("Bitte korrigieren Sie die markierten Rechnungspositionen.");
    if (form) { const calculation = calculateInvoice(form.items, form.discountType, form.discountValue || 0); found.push(...Object.values(calculation.errors)); }
    if (!form || form.totalCents <= 0) found.push("Der Gesamtbetrag muss größer als 0 sein.");
    if (company?.smallBusiness && !form?.taxExemptionNote.trim()) found.push("Kleinunternehmerhinweis fehlt.");
    setErrors(found); return found;
  };
  const normalizePrices = () => (form?.items || []).every((item) => commitPrice(item));
  const save = async () => {
    if (!form || !canWrite) return; setBusy(true);
    try { if (!normalizePrices()) { setErrors(["Bitte korrigieren Sie ungültige Einzelpreise."]); return; } const before = await db.invoices.get(form.id); await db.invoices.put(form); await audit(before ? "update" : "create", "invoice", form.id, before, form); setMessage(await confirmCloudWrite(cloud, "Entwurf")); if (!invoiceId) navigate(`/invoices/${form.id}`, { replace: true }); }
    finally { setBusy(false); }
  };
  const nextInvoiceNumber = async () => {
    const all = await db.invoices.where("year").equals(form?.year ?? new Date().getFullYear()).toArray(); const max = all.map((invoice) => invoice.invoiceNumber).filter((value): value is string => Boolean(value && /^\d{5}$/.test(value))).map(Number).reduce((a, b) => Math.max(a, b), 0);
    return String(max + 1).padStart(5, "0");
  };
  const finalize = async () => {
    if (!form || !company || !canWrite || !normalizePrices() || validate().length) return; setBusy(true);
    try {
      const customer = selectedCustomer!;
      const customerSnapshot = { customerNumber: customer.customerNumber, displayName: [customer.firstName, customer.lastName].filter(Boolean).join(" ") || customer.company || "", company: customer.company, street: customer.street, postalCode: customer.postalCode, city: customer.city, country: customer.country, email: customer.email };
      let finalized!: Invoice;
      const preparedDraft: Invoice = {
        ...form,
        customerSnapshot,
        companySnapshot: snapshotCompany(company),
        updatedAt: new Date().toISOString()
      };
      if (cloud.configured) {
        if (!cloud.runtime.online) throw new Error("Zum Finalisieren und zur sicheren Vergabe der Rechnungsnummer ist eine Internetverbindung erforderlich. Der Entwurf bleibt erhalten.");
        const organizationId = cloud.membership?.organization_id;
        if (!organizationId) throw new Error("Es ist kein gemeinsamer Datenbereich zugeordnet.");
        const current = await db.invoices.get(form.id);
        if (current && current.status !== "draft") throw new Error("Diese Rechnung wurde bereits finalisiert.");
        await db.invoices.put(preparedDraft);
        const syncResult = await cloud.syncNow();
        if (syncResult.status !== "completed") throw new Error(syncResult.message);
        const remote = await finalizeCloudInvoice(organizationId, preparedDraft.id);
        if (!remote.invoiceNumber) throw new Error("Der Server hat keine endgültige Rechnungsnummer zurückgegeben.");
        finalized = {
          ...preparedDraft,
          invoiceNumber: remote.invoiceNumber,
          status: remote.status as InvoiceStatus,
          finalizedAt: remote.finalizedAt || new Date().toISOString(),
          updatedAt: remote.updatedAt || new Date().toISOString()
        };
        await withRemoteWriteSuppressed(() => db.invoices.put(finalized));
        await audit("finalize-cloud", "invoice", finalized.id, current, finalized);
      } else {
        await db.transaction("rw", db.invoices, db.auditLogs, async () => {
          const current = await db.invoices.get(form.id); if (current && current.status !== "draft") throw new Error("Diese Rechnung wurde bereits finalisiert.");
          const number = await nextInvoiceNumber();
          finalized = { ...preparedDraft, invoiceNumber: number, status: "finalized", finalizedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
          await db.invoices.put(finalized); await audit("finalize", "invoice", finalized.id, current, finalized);
        });
      }
      const hashInput = JSON.stringify({ ...finalized, pdfBlob: undefined });
      const contentHash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(hashInput)))).map((byte) => byte.toString(16).padStart(2, "0")).join("");
      const { blob } = await createInvoicePdf(finalized, customer, company);
      finalized = { ...finalized, contentHash, pdfBlob: blob };
      if (cloud.configured && cloud.membership?.organization_id) {
        await sealCloudInvoice(cloud.membership.organization_id, finalized.id, contentHash);
        await withRemoteWriteSuppressed(() => db.invoices.update(finalized.id, { contentHash, pdfBlob: blob }));
      } else {
        await db.invoices.update(finalized.id, { contentHash, pdfBlob: blob });
      }
      setForm(finalized); setMessage(`Rechnung ${finalized.invoiceNumber} wurde finalisiert und ist nun unveränderlich.`);
    } catch (cause) { setErrors([cause instanceof Error ? cause.message : String(cause)]); } finally { setBusy(false); }
  };
  const getPdf = async () => {
    if (!form || !company) throw new Error("Rechnung nicht geladen.");
    if (form.status !== "draft" && !form.invoiceNumber) throw new Error("Eine finalisierte Rechnung benötigt eine gültige Rechnungsnummer.");
    return createInvoicePdf(form, selectedCustomer, company);
  };
  const download = async () => {
    setBusy(true); setErrors([]);
    try {
      const result = await getPdf();
      if (prefersNativePdfShare() && await sharePdfFile(result.blob, result.filename, `Rechnung ${form?.invoiceNumber || form?.draftNumber}`, "PDF speichern, öffnen oder weitergeben")) setMessage("Die PDF wurde an das Gerät übergeben.");
      else { downloadBlob(result.blob, result.filename); setMessage("Die PDF wurde erstellt und gespeichert."); }
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setErrors([cause instanceof Error ? cause.message : "Die PDF konnte nicht erstellt werden."]);
    } finally { setBusy(false); }
  };
  const print = async () => {
    if (form?.status !== "draft" && !form?.invoiceNumber) return setErrors(["Eine finalisierte Rechnung benötigt vor dem Drucken eine gültige Rechnungsnummer."]);
    const nativeShare = prefersNativePdfShare();
    const viewer = nativeShare ? null : window.open("", "_blank");
    setBusy(true); setErrors([]);
    try {
      if (nativeShare) {
        const result = await getPdf();
        const shared = await sharePdfFile(result.blob, result.filename, `Rechnung ${form?.invoiceNumber || form?.draftNumber}`, "Zum Drucken im Menü bitte „Drucken“ auswählen.");
        if (!shared) { downloadBlob(result.blob, result.filename); setMessage("Die druckfertige PDF wurde gespeichert. Bitte im PDF-Viewer öffnen und dort drucken."); }
      } else {
        const result = await createInvoicePdf(form!, selectedCustomer, company!, true);
        if (!openPdfInWindow(result.blob, viewer)) { downloadBlob(result.blob, result.filename); throw new Error("Das Druckfenster wurde blockiert. Die PDF wurde stattdessen gespeichert."); }
      }
    } catch (cause) {
      if (viewer && !viewer.closed && viewer.location.href === "about:blank") viewer.close();
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setErrors([cause instanceof Error ? cause.message : "Das Dokument konnte nicht gedruckt werden."]);
    } finally { setBusy(false); }
  };
  const deleteDraft = async () => { if (!form || !canWrite || form.status !== "draft") return; const filled = Boolean(form.customerId || form.items.some((item) => item.description.trim() && (item.unitPriceCents || item.description !== "Fotoshooting"))); if (filled && !window.confirm("Möchtest du diesen Rechnungsentwurf wirklich löschen?\nDiese Aktion kann nicht rückgängig gemacht werden.")) return; const storedDraft = await db.invoices.get(form.id); if (storedDraft) { await db.transaction("rw", db.invoices, db.attachments, async () => { await db.invoices.delete(form.id); const temporary = await db.attachments.where("[ownerType+ownerId]").equals(["invoice", form.id]).toArray(); await db.attachments.bulkDelete(temporary.map((item) => item.id)); }); await audit("delete", "invoice-draft", form.id, storedDraft, undefined); } navigate("/invoices"); };
  const share = async () => {
    if (!form) return; const { blob, filename } = await getPdf(); const file = new File([blob], filename, { type: "application/pdf" });
    const customerName = form.customerSnapshot?.displayName || [selectedCustomer?.firstName, selectedCustomer?.lastName].filter(Boolean).join(" ");
    const text = `Guten Tag ${customerName},\n\nanbei erhalten Sie die Rechnung ${form.invoiceNumber}.\n\nVielen Dank und freundliche Grüße\nLidia Lang\nPhotographie Blitzidee`;
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ title: `Rechnung ${form.invoiceNumber}`, text, files: [file] }); await db.invoices.update(form.id, { status: form.status === "finalized" ? "sent" : form.status, sentAt: new Date().toISOString() }); }
    else { downloadBlob(blob, filename); window.location.href = `mailto:${encodeURIComponent(selectedCustomer?.email || "")}?subject=${encodeURIComponent(`Rechnung ${form.invoiceNumber}`)}&body=${encodeURIComponent(`${text}\n\nHinweis: Bitte fügen Sie die gespeicherte PDF-Datei manuell als Anhang hinzu.`)}`; setMessage("Das Gerät unterstützt keine Dateifreigabe. Die PDF wurde gespeichert; im E-Mail-Entwurf muss sie manuell angehängt werden."); }
  };
  const recordPayment = async () => {
    if (!form || !canWrite || restCents <= 0) return; const raw = window.prompt(`Zahlungsbetrag (offen: ${euro(restCents)})`, (restCents / 100).toFixed(2).replace(".", ",")); if (!raw) return;
    const amountCents = parseEuroToCents(raw); if (amountCents <= 0 || amountCents > restCents) return setErrors(["Der Zahlungsbetrag muss positiv sein und darf den offenen Betrag nicht überschreiten."]);
    const paidAt = window.prompt("Zahlungsdatum (JJJJ-MM-TT)", new Date().toISOString().slice(0, 10)) || ""; if (!/^\d{4}-\d{2}-\d{2}$/.test(paidAt)) return setErrors(["Ungültiges Zahlungsdatum."]);
    const method = window.prompt("Zahlungsart", "Überweisung")?.trim(); if (!method) return;
    await db.payments.add({ id: newId("payment"), invoiceId: form.id, amountCents, paidAt, method, createdAt: new Date().toISOString() });
    const nextStatus: InvoiceStatus = amountCents === restCents ? "paid" : "partially_paid"; await db.invoices.update(form.id, { status: nextStatus, paidAt: nextStatus === "paid" ? paidAt : undefined, updatedAt: new Date().toISOString() }); await audit("payment", "invoice", form.id, undefined, { amountCents, paidAt, method }); setMessage(nextStatus === "paid" ? "Zahlung wurde vollständig erfasst." : "Teilzahlung wurde erfasst.");
  };
  const cancel = async () => {
    if (!form || !company || !canWrite || form.status === "draft" || form.status === "cancelled" || !window.confirm(`Rechnung ${form.invoiceNumber} wirklich nachvollziehbar stornieren?`)) return;
    if (cloud.configured) {
      if (!cloud.runtime.online) return setErrors(["Für eine rechtssichere Stornorechnung und eindeutige Nummer wird eine Internetverbindung benötigt."]);
      const organizationId = cloud.membership?.organization_id;
      if (!organizationId) return setErrors(["Es ist kein gemeinsamer Datenbereich zugeordnet."]);
      setBusy(true); setErrors([]);
      try {
        const now = new Date().toISOString();
        const cancellation: Invoice = {
          ...form,
          id: newId("invoice"),
          draftNumber: `STORNO-${Date.now()}`,
          invoiceNumber: undefined,
          items: form.items.map((item, sortOrder) => ({
            ...item,
            id: newId("item"),
            description: `Storno: ${item.description}`,
            quantityMilli: 1000,
            unitPriceCents: -item.totalCents,
            subtotalCents: -item.totalCents,
            discountType: undefined,
            discountValue: undefined,
            discountCents: 0,
            totalCents: -item.totalCents,
            sortOrder
          })),
          subtotalCents: -form.totalCents,
          discountType: undefined,
          discountValue: undefined,
          discountCents: 0,
          totalCents: -form.totalCents,
          status: "draft",
          invoiceDate: now.slice(0, 10),
          dueDate: now.slice(0, 10),
          paymentTermDays: 0,
          year: Number(now.slice(0, 4)),
          createdAt: now,
          updatedAt: now,
          finalizedAt: undefined,
          cancelledInvoiceId: form.id,
          correctionInvoiceId: undefined,
          paidAt: undefined,
          paymentMethod: undefined,
          contentHash: undefined,
          pdfBlob: undefined,
          imported: false
        };
        await db.invoices.add(cancellation);
        const syncResult = await cloud.syncNow();
        if (syncResult.status !== "completed") throw new Error(syncResult.message);
        const remote = await cancelCloudInvoice(organizationId, form.id, cancellation.id);
        if (!remote.correction.invoiceNumber) throw new Error("Der Server hat keine Nummer für die Stornorechnung zurückgegeben.");
        const finalizedCancellation: Invoice = {
          ...cancellation,
          invoiceNumber: remote.correction.invoiceNumber,
          status: remote.correction.status as InvoiceStatus,
          finalizedAt: remote.correction.finalizedAt || now,
          updatedAt: remote.correction.updatedAt || now
        };
        await withRemoteWriteSuppressed(async () => {
          await db.invoices.put(finalizedCancellation);
          await db.invoices.update(form.id, { status: "cancelled", correctionInvoiceId: cancellation.id, updatedAt: remote.original.updatedAt || now });
        });
        const hashInput = JSON.stringify({ ...finalizedCancellation, pdfBlob: undefined });
        const contentHash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(hashInput)))).map((byte) => byte.toString(16).padStart(2, "0")).join("");
        const { blob } = await createInvoicePdf(finalizedCancellation, selectedCustomer, company);
        await sealCloudInvoice(organizationId, finalizedCancellation.id, contentHash);
        await withRemoteWriteSuppressed(() => db.invoices.update(finalizedCancellation.id, { contentHash, pdfBlob: blob }));
        await audit("cancel-cloud", "invoice", form.id, form, { cancellationInvoiceId: cancellation.id });
        navigate(`/invoices/${cancellation.id}`);
      } catch (cause) {
        setErrors([cause instanceof Error ? cause.message : "Die Rechnung konnte nicht storniert werden."]);
      } finally {
        setBusy(false);
      }
      return;
    }
    const number = await db.transaction("rw", db.invoices, () => nextInvoiceNumber());
    const cancellation: Invoice = { ...form, id: newId("invoice"), draftNumber: `STORNO-${Date.now()}`, invoiceNumber: number, items: form.items.map((item) => ({ ...item, id: newId("item"), unitPriceCents: -item.unitPriceCents, totalCents: -item.totalCents })), totalCents: -form.totalCents, status: "finalized", invoiceDate: new Date().toISOString().slice(0, 10), year: new Date().getFullYear(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), finalizedAt: new Date().toISOString(), cancelledInvoiceId: form.id, paidAt: undefined, paymentMethod: undefined, pdfBlob: undefined, imported: false };
    const { blob } = await createInvoicePdf(cancellation, selectedCustomer, company); cancellation.pdfBlob = blob;
    await db.transaction("rw", db.invoices, async () => { await db.invoices.add(cancellation); await db.invoices.update(form.id, { status: "cancelled", correctionInvoiceId: cancellation.id, updatedAt: new Date().toISOString() }); });
    await audit("cancel", "invoice", form.id, form, { cancellationInvoiceId: cancellation.id }); navigate(`/invoices/${cancellation.id}`);
  };
  if (!form || !company) return <p>Rechnung wird geladen …</p>;
  return <>
    <header className="page-header compact"><div><Link className="back" to="/invoices"><ArrowLeft /> Rechnungen</Link><h1>{form.invoiceNumber ? `Rechnung ${form.invoiceNumber}` : "Neue Rechnung"}</h1><p><span className={`status ${form.status}`}>{statusLabels[form.status]}</span>{form.imported && " · Historischer Import"}{!canWrite && " · Nur-Lesen-Zugriff"}</p></div><div className="actions"><button type="button" className="secondary" onClick={() => setShowPreview(true)}><Eye /> Vorschau</button>{isDraft ? (canWrite ? <><button type="button" className="secondary" onClick={save} disabled={busy}><Save /> Entwurf speichern</button><button type="button" className="primary" onClick={finalize} disabled={busy}><FileCheck2 /> Finalisieren</button></> : null) : <><button type="button" className="secondary" onClick={download}><Download /> PDF</button><button type="button" className="secondary" onClick={print}><Printer /> Drucken</button><button type="button" className="primary" onClick={share}><Share2 /> Teilen</button></>}</div></header>
    {editable && <div className="draft-actions"><button type="button" className="danger" onClick={deleteDraft}><Trash2 /> Entwurf löschen</button></div>}
    {(message || errors.length > 0) && <div className={errors.length ? "notice error" : "notice success"} role="status">{errors.length ? <ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul> : message}</div>}
    {!isDraft && <div className="locked"><FileCheck2 /><span><strong>Finalisierter Beleg</strong> Inhalt und Kundensnapshot sind gegen stilles Überschreiben geschützt. Korrekturen erfolgen per Storno.</span></div>}
    <div className={`editor-grid ${isDraft ? "draft-editor" : "finalized-editor"}`}><section className="panel editor-form"><h2>Rechnungsdaten</h2><div className="form-grid">
      <label className="wide">Kunde*<select value={form.customerId} disabled={!editable} onChange={(e) => update("customerId", e.target.value)}><option value="">Kunde auswählen</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{[customer.firstName, customer.lastName].filter(Boolean).join(" ") || customer.company} · {customer.city}</option>)}</select></label>
      <label>Rechnungsdatum*<input type="date" value={form.invoiceDate} disabled={!editable} onChange={(e) => { update("invoiceDate", e.target.value); update("year", Number(e.target.value.slice(0, 4))); update("dueDate", addDays(e.target.value, form.paymentTermDays)); }} /></label>
      <label>Leistungsdatum*<input type="date" value={form.serviceDateFrom} disabled={!editable} onChange={(e) => update("serviceDateFrom", e.target.value)} /></label>
      <label>Zahlungsziel<input type="number" min="0" value={form.paymentTermDays} disabled={!editable} onChange={(e) => { const days = Number(e.target.value); update("paymentTermDays", days); update("dueDate", addDays(form.invoiceDate, days)); }} /></label>
      <label>Fällig am<input type="date" value={form.dueDate} disabled={!editable} onChange={(e) => update("dueDate", e.target.value)} /></label>
    </div><h2>Positionen</h2><div className="items">{form.items.map((item, index) => <div className={`item-card ${itemErrors[item.id] ? "invalid" : ""}`} key={item.id}><span className="item-number">{index + 1}</span><EditableChoice label="Beschreibung*" value={item.description} disabled={!editable} multiline placeholder="Vorlage auswählen oder Beschreibung eingeben" options={templates.map((template) => ({ value: template.description, label: template.title }))} onChange={(description) => selectDescription(item, description)} onBlur={() => void offerDescriptionTemplate(item)} /><label>Menge<input type="number" inputMode="decimal" step="0.001" value={item.quantityMilli / 1000} disabled={!editable} onChange={(e) => patchItem(item.id, { quantityMilli: Math.round(Number(e.target.value) * 1000) })} /></label><EditableChoice label="Einheit" value={item.unit} disabled={!editable} placeholder="Keine Einheit oder Freitext" options={[{ value: "__empty__", label: "Keine Einheit" }, { value: "Pauschale", label: "Pauschale" }, { value: "Bilder", label: "Bilder" }]} onChange={(unit) => patchItem(item.id, { unit })} /><label>Einzelpreis<input inputMode="decimal" value={priceValue(item)} disabled={!editable} aria-invalid={itemErrors[item.id]?.some((v) => v.includes("Einzelpreis"))} onFocus={(e) => e.currentTarget.select()} onChange={(e) => setPriceInputs((values) => ({ ...values, [item.id]: e.target.value }))} onBlur={() => commitPrice(item)} /></label><strong>{euro(item.totalCents)}</strong>{itemErrors[item.id] && <ul className="field-errors">{itemErrors[item.id]!.map((error) => <li key={error}>{error}</li>)}</ul>}{editable && <div className="item-actions"><button type="button" aria-label="Position duplizieren" title="Duplizieren" onClick={() => duplicateItem(item)}><Copy /></button><button type="button" aria-label="Position löschen" title="Löschen" onClick={() => removeItem(item.id)}><Trash2 /></button></div>}</div>)}{editable && <button type="button" className="add-line" onClick={addItem}><Plus /> Position hinzufügen</button>}</div>
      {editable && <div className="position-discounts"><h3>Positionsrabatte</h3>{form.items.map((item, index) => <div className="discount-controls" key={item.id}><span>Position {index + 1}</span><label>Rabattart<select value={item.discountType || ""} onChange={(e) => { setDiscountInputs((current) => ({ ...current, [item.id]: "" })); patchItem(item.id, { discountType: (e.target.value || undefined) as InvoiceItem["discountType"], discountValue: 0 }); }}><option value="">Kein Rabatt</option><option value="percent">Prozent</option><option value="fixed">Fester Betrag</option></select></label>{item.discountType && <label>{item.discountType === "percent" ? "Rabatt in %" : "Rabattbetrag"}<input inputMode="decimal" value={discountValueText(item.id, item.discountType, item.discountValue)} onFocus={(e) => e.currentTarget.select()} onChange={(e) => changeItemDiscount(item, e.target.value)} /></label>}{Boolean(item.discountCents) && <span>−{euro(item.discountCents || 0)} · Position {euro(item.totalCents)}</span>}</div>)}</div>}
      {editable && <div className="discount-controls"><label>Gesamtrabatt<select value={form.discountType || ""} onChange={(e) => { const type = (e.target.value || undefined) as Invoice["discountType"]; setDiscountInputs((current) => ({ ...current, invoice: "" })); recalc(form.items, { type, value: 0 }); }}><option value="">Kein Rabatt</option><option value="percent">Prozent</option><option value="fixed">Fester Betrag</option></select></label>{form.discountType && <label>{form.discountType === "percent" ? "Rabatt in %" : "Rabattbetrag"}<input inputMode="decimal" value={discountValueText("invoice", form.discountType, form.discountValue)} onFocus={(e) => e.currentTarget.select()} onChange={(e) => changeInvoiceDiscount(e.target.value)} /></label>}</div>}
      <div className="invoice-total">{Boolean(form.discountCents) && <span>Zwischensumme {euro(form.subtotalCents ?? form.totalCents)} · Rabatt −{euro(form.discountCents || 0)}</span>}<span>Gesamtbetrag</span><strong>{euro(form.totalCents)}</strong></div>
      <label>Einleitung<textarea value={form.introText} disabled={!editable} onChange={(e) => update("introText", e.target.value)} /></label><label>Schlusstext<textarea value={form.outroText} disabled={!editable} onChange={(e) => update("outroText", e.target.value)} /></label><label>Kleinunternehmerhinweis*<textarea value={form.taxExemptionNote} disabled={!editable} onChange={(e) => update("taxExemptionNote", e.target.value)} /></label>
    </section><aside className="editor-aside"><article className="panel"><h2>Zahlungsstand</h2><p className="section-note">Hier können vollständige Zahlungen und beliebige Teilzahlungen verbucht werden.</p><dl className="summary"><div><dt>Rechnungsbetrag</dt><dd>{euro(form.totalCents)}</dd></div><div><dt>Erhalten</dt><dd>{euro(paidCents)}</dd></div><div className="total"><dt>Offen</dt><dd>{euro(restCents)}</dd></div></dl>{!isDraft && canWrite && form.status !== "cancelled" && restCents > 0 && <button className="secondary full" onClick={recordPayment}><WalletCards /> Teilzahlung / Zahlung erfassen</button>}<div className="payment-list">{payments.map((payment) => <small key={payment.id}>{formatDate(payment.paidAt)} · {euro(payment.amountCents)} · {payment.method}</small>)}</div></article>{!isDraft && canWrite && form.status !== "cancelled" && <article className="panel danger-zone"><h2>Korrektur</h2><p>Eine finalisierte Rechnung wird nicht bearbeitet oder gelöscht.</p><button className="danger" onClick={cancel}><XCircle /> Stornorechnung erstellen</button></article>}</aside></div>
    {showPreview && <InvoicePreview invoice={form} customer={selectedCustomer} company={company} onClose={() => setShowPreview(false)} />}
  </>;
}
