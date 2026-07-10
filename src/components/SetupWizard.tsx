import { useState } from "react";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { audit, db } from "../db";
import type { Company } from "../types";

export function SetupWizard({ company }: { company: Company }) {
  const [form, setForm] = useState(company);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");
  const update = (key: keyof Company, value: string | number | boolean) => setForm((current) => ({ ...current, [key]: value }));
  const save = async () => {
    if (!form.name || !form.owner || !form.street || !form.postalCode || !form.city || !form.taxNumber || !form.iban) return setError("Bitte prüfen Sie die markierten Pflichtangaben.");
    if (form.smallBusiness && !form.taxExemptionNote.trim()) return setError("Der Kleinunternehmerhinweis darf nicht leer sein.");
    if (!accepted) return setError("Bitte bestätigen Sie die Prüfung der Angaben.");
    const next = { ...form, confirmedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    await db.company.put(next); await audit("confirm", "company", "company", company, next, "setup");
  };
  return <main className="setup">
    <section className="setup-card">
      <div className="eyebrow"><ShieldCheck /> Sicherer Erststart</div>
      <img src="/logo-schrift.png" alt="Photographie Blitzidee" />
      <h1>Unternehmensdaten prüfen</h1>
      <p>Die Angaben wurden aus der historischen Rechnung übernommen. Rechtlich relevante Daten werden erst nach Ihrer Bestätigung für neue Rechnungen verwendet.</p>
      <div className="form-grid">
        <label>Unternehmen*<input value={form.name} onChange={(e) => update("name", e.target.value)} /></label>
        <label>Inhaberin*<input value={form.owner} onChange={(e) => update("owner", e.target.value)} /></label>
        <label className="wide">Straße*<input value={form.street} onChange={(e) => update("street", e.target.value)} /></label>
        <label>PLZ*<input inputMode="numeric" value={form.postalCode} onChange={(e) => update("postalCode", e.target.value)} /></label>
        <label>Ort*<input value={form.city} onChange={(e) => update("city", e.target.value)} /></label>
        <label>Telefon<input type="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="In Excel nicht vorhanden" /></label>
        <label>E-Mail<input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} /></label>
        <label>Steuernummer*<input value={form.taxNumber} onChange={(e) => update("taxNumber", e.target.value)} /></label>
        <label>Bank<input value={form.bankName} onChange={(e) => update("bankName", e.target.value)} /></label>
        <label className="wide">IBAN*<input value={form.iban} onChange={(e) => update("iban", e.target.value)} /></label>
        <label>BIC<input value={form.bic} onChange={(e) => update("bic", e.target.value)} /></label>
        <label>Zahlungsziel (Tage)<input type="number" min="0" value={form.paymentTermDays} onChange={(e) => update("paymentTermDays", Number(e.target.value))} /></label>
        <label className="wide">Kleinunternehmerhinweis*<textarea value={form.taxExemptionNote} onChange={(e) => update("taxExemptionNote", e.target.value)} /></label>
      </div>
      <label className="check"><input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} /><span>Ich habe Anschrift, Steuernummer und Bankverbindung geprüft.</span></label>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="primary" onClick={save}><CheckCircle2 /> Angaben bestätigen und App öffnen</button>
      <p className="fineprint">Die App unterstützt nachvollziehbare Abläufe, ist aber keine steuerliche oder rechtliche Zertifizierung.</p>
    </section>
  </main>;
}
