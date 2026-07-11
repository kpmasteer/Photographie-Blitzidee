import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Copy, Download, Eye, FileCheck2, Plus, Printer, Save, Share2, Trash2, WalletCards, XCircle } from "lucide-react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { audit, db, newId } from "../db";
import { addDays, formatDate } from "../lib/date";
import { euro, openAmount, parseEuroToCents, parsePriceInput } from "../lib/money";
import { calculateInvoice } from "../lib/invoiceCalculation";
import { InvoicePreview } from "../components/InvoicePreview";
import { downloadBlob } from "../lib/pdf";
import { createInvoiceDocumentPdf } from "../lib/invoiceDocumentPdf";
import { flushSync } from "react-dom";
import { printInvoiceDocument } from "../lib/printInvoice";
import { makeDraft } from "../lib/seed";
import type { Company, Invoice, InvoiceItem, InvoiceStatus, Payment } from "../types";

const statusLabels: Record<InvoiceStatus, string> = { draft: "Entwurf", finalized: "Finalisiert", sent: "Versendet", partially_paid: "Teilbezahlt", paid: "Bezahlt", overdue: "Überfällig", cancelled: "Storniert" };

const snapshotCompany = (company: Company) => {
  const { confirmedAt: _confirmedAt, updatedAt: _updatedAt, ...snapshot } = company;
  void _confirmedAt; void _updatedAt;
  return snapshot;
};

export function InvoiceEditor() {
  const { invoiceId } = useParams(); const navigate = useNavigate(); const [searchParams] = useSearchParams();
  const company = useLiveQuery(() => db.company.get("company"), [], undefined);
  const customers = useLiveQuery(() => db.customers.filter((customer) => !customer.archived).sortBy("lastName"), [], []);
  const stored = useLiveQuery<Invoice | undefined, undefined>(async () => invoiceId ? await db.invoices.get(invoiceId) : undefined, [invoiceId], undefined);
  const payments = useLiveQuery<Payment[], Payment[]>(async () => invoiceId ? await db.payments.where("invoiceId").equals(invoiceId).toArray() : [], [invoiceId], []);
  const templates = useLiveQuery(() => db.serviceTemplates.filter((template) => !template.archived).sortBy("sortOrder"), [], []);
  const [form, setForm] = useState<Invoice>(); const [message, setMessage] = useState(""); const [errors, setErrors] = useState<string[]>([]); const [busy, setBusy] = useState(false);
  const [priceInputs, setPriceInputs] = useState<Record<string, string>>({}); const [discountInputs, setDiscountInputs] = useState<Record<string, string>>({}); const [itemErrors, setItemErrors] = useState<Record<string, string[]>>({}); const [showPreview, setShowPreview] = useState(false);
  useEffect(() => { const selectAmount = (event: FocusEvent) => { const input = event.target; if (input instanceof HTMLInputElement && input.inputMode === "decimal") window.setTimeout(() => input.select(), 0); }; document.addEventListener("focusin", selectAmount); return () => document.removeEventListener("focusin", selectAmount); }, []);
  useEffect(() => { setForm((current) => { if (!current) return current; let changed = false; const items = current.items.map((item) => { const raw = priceInputs[item.id]; if (raw === undefined) return item; const parsed = parsePriceInput(raw); if (!parsed.valid || parsed.cents === item.unitPriceCents) return item; changed = true; return { ...item, unitPriceCents: parsed.cents }; }); if (!changed) return current; const result = calculateInvoice(items, current.discountType, current.discountValue || 0); return { ...current, items: result.items, subtotalCents: result.subtotalCents, discountCents: result.discountCents, totalCents: result.totalCents, updatedAt: new Date().toISOString() }; }); }, [priceInputs]);
  useEffect(() => { if (stored) setForm(stored); else if (!invoiceId && company && !form) setForm(makeDraft(company, searchParams.get("customer") || "")); }, [stored, invoiceId, company, form, searchParams]);
  const editable = form?.status === "draft";
  const selectedCustomer = customers.find((customer) => customer.id === form?.customerId);
  const paidCents = payments.reduce((sum, payment) => sum + payment.amountCents, 0);
  const restCents = form ? openAmount(form.totalCents, payments) : 0;
  const update = <K extends keyof Invoice>(key: K, value: Invoice[K]) => setForm((current) => current ? { ...current, [key]: value, updatedAt: new Date().toISOString() } : current);
  const recalc = (items: InvoiceItem[], invoiceDiscount?: { type?: Invoice["discountType"]; value?: number }) => { if (!form) return; const type = invoiceDiscount ? invoiceDiscount.type : form.discountType; const value = invoiceDiscount ? invoiceDiscount.value || 0 : form.discountValue || 0; const result = calculateInvoice(items, type, value); setErrors(Object.values(result.errors)); setForm({ ...form, items: result.items, subtotalCents: result.subtotalCents, discountCents: result.discountCents, totalCents: result.totalCents, discountType: type, discountValue: value, updatedAt: new Date().toISOString() }); };
  const patchItem = (id: string, patch: Partial<InvoiceItem>) => recalc(form!.items.map((item) => {
    if (item.id !== id) return item; return { ...item, ...patch };
  }));
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
    if (!form) return; setBusy(true);
    try { if (!normalizePrices()) { setErrors(["Bitte korrigieren Sie ungültige Einzelpreise."]); return; } const before = await db.invoices.get(form.id); await db.invoices.put(form); await audit(before ? "update" : "create", "invoice", form.id, before, form); setMessage("Entwurf gespeichert."); if (!invoiceId) navigate(`/invoices/${form.id}`, { replace: true }); }
    finally { setBusy(false); }
  };
  const nextInvoiceNumber = async () => {
    const all = await db.invoices.toArray(); const max = all.map((invoice) => invoice.invoiceNumber).filter((value): value is string => Boolean(value && /^\d{5}$/.test(value))).map(Number).reduce((a, b) => Math.max(a, b), 0);
    return String(max + 1).padStart(5, "0");
  };
  const finalize = async () => {
    if (!form || !company || !normalizePrices() || validate().length) return; setBusy(true);
    try {
      const customer = selectedCustomer!;
      const customerSnapshot = { customerNumber: customer.customerNumber, displayName: [customer.firstName, customer.lastName].filter(Boolean).join(" ") || customer.company || "", company: customer.company, street: customer.street, postalCode: customer.postalCode, city: customer.city, country: customer.country, email: customer.email };
      let finalized!: Invoice;
      await db.transaction("rw", db.invoices, db.auditLogs, async () => {
        const current = await db.invoices.get(form.id); if (current && current.status !== "draft") throw new Error("Diese Rechnung wurde bereits finalisiert.");
        const number = await nextInvoiceNumber();
        finalized = { ...form, invoiceNumber: number, customerSnapshot, companySnapshot: snapshotCompany(company), status: "finalized", finalizedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        await db.invoices.put(finalized); await audit("finalize", "invoice", finalized.id, current, finalized);
      });
      const hashInput = JSON.stringify({ ...finalized, pdfBlob: undefined });
      const contentHash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(hashInput)))).map((byte) => byte.toString(16).padStart(2, "0")).join("");
      const { blob } = await createInvoiceDocumentPdf(finalized, customer, company);
      finalized = { ...finalized, contentHash, pdfBlob: blob };
      await db.invoices.update(finalized.id, { contentHash, pdfBlob: blob });
      setForm(finalized); setMessage(`Rechnung ${finalized.invoiceNumber} wurde finalisiert und ist nun unveränderlich.`);
    } catch (cause) { setErrors([cause instanceof Error ? cause.message : String(cause)]); } finally { setBusy(false); }
  };
  const getPdf = async () => {
    if (!form || !company) throw new Error("Rechnung nicht geladen.");
    if (form.status !== "draft" && !form.invoiceNumber) throw new Error("Eine finalisierte Rechnung benötigt eine gültige Rechnungsnummer.");
    if (form.pdfBlob) return { blob: form.pdfBlob, filename: `Rechnung_${form.invoiceNumber}.pdf` };
    return createInvoiceDocumentPdf(form, selectedCustomer, company);
  };
  const download = async () => { const result = await getPdf(); downloadBlob(result.blob, result.filename); };
  const print = async () => { if (form?.status !== "draft" && !form?.invoiceNumber) return setErrors(["Eine finalisierte Rechnung benötigt vor dem Drucken eine gültige Rechnungsnummer."]); flushSync(() => setShowPreview(true)); try { await printInvoiceDocument(); } catch (cause) { setErrors([cause instanceof Error ? cause.message : String(cause)]); } };
  const deleteDraft = async () => { if (!form || form.status !== "draft") return; const filled = Boolean(form.customerId || form.items.some((item) => item.description.trim() && (item.unitPriceCents || item.description !== "Fotoshooting"))); if (filled && !window.confirm("Möchtest du diesen Rechnungsentwurf wirklich löschen?\nDiese Aktion kann nicht rückgängig gemacht werden.")) return; const storedDraft = await db.invoices.get(form.id); if (storedDraft) { await db.transaction("rw", db.invoices, db.attachments, async () => { await db.invoices.delete(form.id); const temporary = await db.attachments.where("[ownerType+ownerId]").equals(["invoice", form.id]).toArray(); await db.attachments.bulkDelete(temporary.map((item) => item.id)); }); await audit("delete", "invoice-draft", form.id, storedDraft, undefined); } navigate("/invoices"); };
  const share = async () => {
    if (!form) return; const { blob, filename } = await getPdf(); const file = new File([blob], filename, { type: "application/pdf" });
    const customerName = form.customerSnapshot?.displayName || [selectedCustomer?.firstName, selectedCustomer?.lastName].filter(Boolean).join(" ");
    const text = `Guten Tag ${customerName},\n\nanbei erhalten Sie die Rechnung ${form.invoiceNumber}.\n\nVielen Dank und freundliche Grüße\nLidia Lang\nPhotographie Blitzidee`;
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ title: `Rechnung ${form.invoiceNumber}`, text, files: [file] }); await db.invoices.update(form.id, { status: form.status === "finalized" ? "sent" : form.status, sentAt: new Date().toISOString() }); }
    else { downloadBlob(blob, filename); window.location.href = `mailto:${encodeURIComponent(selectedCustomer?.email || "")}?subject=${encodeURIComponent(`Rechnung ${form.invoiceNumber}`)}&body=${encodeURIComponent(`${text}\n\nHinweis: Bitte fügen Sie die gespeicherte PDF-Datei manuell als Anhang hinzu.`)}`; setMessage("Das Gerät unterstützt keine Dateifreigabe. Die PDF wurde gespeichert; im E-Mail-Entwurf muss sie manuell angehängt werden."); }
  };
  const recordPayment = async () => {
    if (!form || restCents <= 0) return; const raw = window.prompt(`Zahlungsbetrag (offen: ${euro(restCents)})`, (restCents / 100).toFixed(2).replace(".", ",")); if (!raw) return;
    const amountCents = parseEuroToCents(raw); if (amountCents <= 0 || amountCents > restCents) return setErrors(["Der Zahlungsbetrag muss positiv sein und darf den offenen Betrag nicht überschreiten."]);
    const paidAt = window.prompt("Zahlungsdatum (JJJJ-MM-TT)", new Date().toISOString().slice(0, 10)) || ""; if (!/^\d{4}-\d{2}-\d{2}$/.test(paidAt)) return setErrors(["Ungültiges Zahlungsdatum."]);
    await db.payments.add({ id: newId("payment"), invoiceId: form.id, amountCents, paidAt, method: "Überweisung", createdAt: new Date().toISOString() });
    const nextStatus: InvoiceStatus = amountCents === restCents ? "paid" : "partially_paid"; await db.invoices.update(form.id, { status: nextStatus, paidAt: nextStatus === "paid" ? paidAt : undefined, updatedAt: new Date().toISOString() }); await audit("payment", "invoice", form.id, undefined, { amountCents, paidAt }); setMessage("Zahlung wurde erfasst.");
  };
  const cancel = async () => {
    if (!form || !company || form.status === "draft" || form.status === "cancelled" || !window.confirm(`Rechnung ${form.invoiceNumber} wirklich nachvollziehbar stornieren?`)) return;
    const number = await db.transaction("rw", db.invoices, () => nextInvoiceNumber());
    const cancellation: Invoice = { ...form, id: newId("invoice"), draftNumber: `STORNO-${Date.now()}`, invoiceNumber: number, items: form.items.map((item) => ({ ...item, id: newId("item"), unitPriceCents: -item.unitPriceCents, totalCents: -item.totalCents })), totalCents: -form.totalCents, status: "finalized", invoiceDate: new Date().toISOString().slice(0, 10), year: new Date().getFullYear(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), finalizedAt: new Date().toISOString(), cancelledInvoiceId: form.id, paidAt: undefined, paymentMethod: undefined, pdfBlob: undefined, imported: false };
    const { blob } = await createInvoiceDocumentPdf(cancellation, selectedCustomer, company); cancellation.pdfBlob = blob;
    await db.transaction("rw", db.invoices, async () => { await db.invoices.add(cancellation); await db.invoices.update(form.id, { status: "cancelled", correctionInvoiceId: cancellation.id, updatedAt: new Date().toISOString() }); });
    await audit("cancel", "invoice", form.id, form, { cancellationInvoiceId: cancellation.id }); navigate(`/invoices/${cancellation.id}`);
  };
  if (!form || !company) return <p>Rechnung wird geladen …</p>;
  return <>
    <header className="page-header compact"><div><Link className="back" to="/invoices"><ArrowLeft /> Rechnungen</Link><h1>{form.invoiceNumber ? `Rechnung ${form.invoiceNumber}` : "Neue Rechnung"}</h1><p><span className={`status ${form.status}`}>{statusLabels[form.status]}</span>{form.imported && " · Historischer Excel-Import"}</p></div><div className="actions"><button type="button" className="secondary" onClick={() => setShowPreview(true)}><Eye /> Vorschau</button>{editable ? <><button type="button" className="secondary" onClick={save} disabled={busy}><Save /> Entwurf speichern</button><button type="button" className="primary" onClick={finalize} disabled={busy}><FileCheck2 /> Finalisieren</button></> : <><button type="button" className="secondary" onClick={download}><Download /> PDF</button><button type="button" className="secondary" onClick={print}><Printer /> Drucken</button><button type="button" className="primary" onClick={share}><Share2 /> Teilen</button></>}</div></header>
    {editable && <div className="draft-actions"><button type="button" className="danger" onClick={deleteDraft}><Trash2 /> Entwurf löschen</button></div>}
    {(message || errors.length > 0) && <div className={errors.length ? "notice error" : "notice success"} role="status">{errors.length ? <ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul> : message}</div>}
    {!editable && <div className="locked"><FileCheck2 /><span><strong>Finalisierter Beleg</strong> Inhalt und Kundensnapshot sind gegen stilles Überschreiben geschützt. Korrekturen erfolgen per Storno.</span></div>}
    <div className="editor-grid"><section className="panel editor-form"><h2>Rechnungsdaten</h2><div className="form-grid">
      <label className="wide">Kunde*<select value={form.customerId} disabled={!editable} onChange={(e) => update("customerId", e.target.value)}><option value="">Kunde auswählen</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{[customer.firstName, customer.lastName].filter(Boolean).join(" ") || customer.company} · {customer.city}</option>)}</select></label>
      <label>Rechnungsdatum*<input type="date" value={form.invoiceDate} disabled={!editable} onChange={(e) => { update("invoiceDate", e.target.value); update("year", Number(e.target.value.slice(0, 4))); update("dueDate", addDays(e.target.value, form.paymentTermDays)); }} /></label>
      <label>Leistungsdatum*<input type="date" value={form.serviceDateFrom} disabled={!editable} onChange={(e) => update("serviceDateFrom", e.target.value)} /></label>
      <label>Zahlungsziel<input type="number" min="0" value={form.paymentTermDays} disabled={!editable} onChange={(e) => { const days = Number(e.target.value); update("paymentTermDays", days); update("dueDate", addDays(form.invoiceDate, days)); }} /></label>
      <label>Fällig am<input type="date" value={form.dueDate} disabled={!editable} onChange={(e) => update("dueDate", e.target.value)} /></label>
    </div><h2>Positionen</h2><div className="items">{form.items.map((item, index) => <div className={`item-card ${itemErrors[item.id] ? "invalid" : ""}`} key={item.id}><span className="item-number">{index + 1}</span>{editable && templates.length > 0 && <label>Beschreibungsvorlage<select value="" onChange={(e) => { const template = templates.find((entry) => entry.id === e.target.value); if (template) { patchItem(item.id, { description: template.description }); void db.serviceTemplates.update(template.id, { usageCount: template.usageCount + 1 }); } }}><option value="">Keine Vorlage / Freitext</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.title}</option>)}</select></label>}<label>Beschreibung*<textarea value={item.description} disabled={!editable} onChange={(e) => patchItem(item.id, { description: e.target.value })} /></label><label>Menge<input type="number" inputMode="decimal" step="0.001" value={item.quantityMilli / 1000} disabled={!editable} onChange={(e) => patchItem(item.id, { quantityMilli: Math.round(Number(e.target.value) * 1000) })} /></label><label>Einheit<input value={item.unit} disabled={!editable} onChange={(e) => patchItem(item.id, { unit: e.target.value })} /></label><label>Einzelpreis<input inputMode="decimal" value={priceValue(item)} disabled={!editable} aria-invalid={itemErrors[item.id]?.some((v) => v.includes("Einzelpreis"))} onChange={(e) => setPriceInputs((values) => ({ ...values, [item.id]: e.target.value }))} onBlur={() => commitPrice(item)} /></label><strong>{euro(item.totalCents)}</strong>{itemErrors[item.id] && <ul className="field-errors">{itemErrors[item.id]!.map((error) => <li key={error}>{error}</li>)}</ul>}{editable && <div className="item-actions"><button type="button" aria-label="Position duplizieren" title="Duplizieren" onClick={() => duplicateItem(item)}><Copy /></button><button type="button" aria-label="Position löschen" title="Löschen" onClick={() => removeItem(item.id)}><Trash2 /></button></div>}</div>)}{editable && <button type="button" className="add-line" onClick={addItem}><Plus /> Position hinzufügen</button>}</div>
      {editable && <div className="position-discounts"><h3>Positionsrabatte</h3>{form.items.map((item, index) => <div className="discount-controls" key={item.id}><span>Position {index + 1}</span><label>Rabattart<select value={item.discountType || ""} onChange={(e) => { setDiscountInputs((current) => ({ ...current, [item.id]: "" })); patchItem(item.id, { discountType: (e.target.value || undefined) as InvoiceItem["discountType"], discountValue: 0 }); }}><option value="">Kein Rabatt</option><option value="percent">Prozent</option><option value="fixed">Fester Betrag</option></select></label>{item.discountType && <label>{item.discountType === "percent" ? "Rabatt in %" : "Rabattbetrag"}<input inputMode="decimal" value={discountValueText(item.id, item.discountType, item.discountValue)} onFocus={(e) => e.currentTarget.select()} onChange={(e) => changeItemDiscount(item, e.target.value)} /></label>}{Boolean(item.discountCents) && <span>−{euro(item.discountCents || 0)} · Position {euro(item.totalCents)}</span>}</div>)}</div>}
      {editable && <div className="discount-controls"><label>Gesamtrabatt<select value={form.discountType || ""} onChange={(e) => { const type = (e.target.value || undefined) as Invoice["discountType"]; setDiscountInputs((current) => ({ ...current, invoice: "" })); recalc(form.items, { type, value: 0 }); }}><option value="">Kein Rabatt</option><option value="percent">Prozent</option><option value="fixed">Fester Betrag</option></select></label>{form.discountType && <label>{form.discountType === "percent" ? "Rabatt in %" : "Rabattbetrag"}<input inputMode="decimal" value={discountValueText("invoice", form.discountType, form.discountValue)} onFocus={(e) => e.currentTarget.select()} onChange={(e) => changeInvoiceDiscount(e.target.value)} /></label>}</div>}
      <div className="invoice-total">{Boolean(form.discountCents) && <span>Zwischensumme {euro(form.subtotalCents ?? form.totalCents)} · Rabatt −{euro(form.discountCents || 0)}</span>}<span>Gesamtbetrag</span><strong>{euro(form.totalCents)}</strong></div>
      <label>Einleitung<textarea value={form.introText} disabled={!editable} onChange={(e) => update("introText", e.target.value)} /></label><label>Schlusstext<textarea value={form.outroText} disabled={!editable} onChange={(e) => update("outroText", e.target.value)} /></label><label>Kleinunternehmerhinweis*<textarea value={form.taxExemptionNote} disabled={!editable} onChange={(e) => update("taxExemptionNote", e.target.value)} /></label>
    </section><aside className="editor-aside"><article className="panel"><h2>Zahlungsstand</h2><dl className="summary"><div><dt>Rechnungsbetrag</dt><dd>{euro(form.totalCents)}</dd></div><div><dt>Erhalten</dt><dd>{euro(paidCents)}</dd></div><div className="total"><dt>Offen</dt><dd>{euro(restCents)}</dd></div></dl>{!editable && form.status !== "cancelled" && restCents > 0 && <button className="secondary full" onClick={recordPayment}><WalletCards /> Zahlung erfassen</button>}<div className="payment-list">{payments.map((payment) => <small key={payment.id}>{formatDate(payment.paidAt)} · {euro(payment.amountCents)} · {payment.method}</small>)}</div></article>{!editable && form.status !== "cancelled" && <article className="panel danger-zone"><h2>Korrektur</h2><p>Eine finalisierte Rechnung wird nicht bearbeitet oder gelöscht.</p><button className="danger" onClick={cancel}><XCircle /> Stornorechnung erstellen</button></article>}</aside></div>
    {showPreview && <InvoicePreview invoice={form} customer={selectedCustomer} company={company} onClose={() => setShowPreview(false)} />}
  </>;
}
