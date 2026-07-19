import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AlertTriangle, CheckCircle2, Cloud, CloudOff, DatabaseBackup, HardDrive, KeyRound, Laptop, LogOut, RefreshCw, ShieldCheck, UploadCloud } from "lucide-react";
import { useCloud } from "../cloud/context";
import { getCurrentDeviceInfo } from "../cloud/device";
import { analyzeLocalDataForMigration, type LocalMigrationPreview } from "../cloud/localMigration";
import { CLOUD_PREFERRED_CONFIRMATION_TEXT, MIGRATION_CONFIRMATION_TEXT, requestLocalMigration, requestUseCloudData } from "../cloud/operations";
import { exportBackup } from "../lib/backup";
import { db } from "../db";
import { resolveCloudConflict } from "../cloud/sync/service";
import type { SyncConflict } from "../cloud/sync/types";

const MIGRATION_DEFERRED_KEY = "blitzidee-cloud-migration-deferred";
const formatDateTime = (value?: string) => value
  ? new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
  : "noch kein erfolgreicher Abgleich";
const formatBytes = (value: number) => new Intl.NumberFormat("de-DE", { style: "unit", unit: "megabyte", maximumFractionDigits: 1 }).format(value / 1024 / 1024);

export function CloudSettingsPanel({ backupPassword }: { backupPassword?: string }) {
  const cloud = useCloud();
  const mayMigrate = cloud.membership?.role === "owner";
  const device = useMemo(() => getCurrentDeviceInfo(), []);
  const migrationGate = useLiveQuery(async () => {
    if (!cloud.membership?.organization_id) return { loading: false as const };
    const setting = await db.settings.get(`cloudMigration:${cloud.membership.organization_id}`);
    return { loading: false as const, value: setting?.value as { authorizedAt?: string; completedAt?: string; reason?: string } | undefined };
  }, [cloud.membership?.organization_id], { loading: true as const });
  const conflicts = useLiveQuery(async () => {
    const organizationId = cloud.membership?.organization_id;
    if (!organizationId) return [];
    return db.syncConflicts.where("[organizationId+status]").equals([organizationId, "open"]).toArray();
  }, [cloud.membership?.organization_id], []);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"sync" | "analysis" | "backup" | "migration" | "password">();
  const [preview, setPreview] = useState<LocalMigrationPreview>();
  const [backupCreatedAt, setBackupCreatedAt] = useState("");
  const [confirmationText, setConfirmationText] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [migrationReport, setMigrationReport] = useState<{ preview: LocalMigrationPreview; completedAt: string }>();
  const [migrationDeferred, setMigrationDeferred] = useState(() => {
    try { return Boolean(localStorage.getItem(MIGRATION_DEFERRED_KEY)); } catch { return false; }
  });

  const clearFeedback = () => { setMessage(""); setError(""); };
  const syncNow = async () => {
    clearFeedback();
    setBusy("sync");
    try {
      const result = await cloud.syncNow();
      setMessage(result.message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Der Cloud-Abgleich ist fehlgeschlagen.");
    } finally {
      setBusy(undefined);
    }
  };
  const signOut = async () => {
    if (!window.confirm("Dieses Gerät abmelden? Synchronisierte Kontodaten werden aus dem lokalen Cache entfernt. Noch nicht übertragene Bestandsdaten bleiben geschützt.")) return;
    clearFeedback();
    try { await cloud.signOut(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Abmeldung fehlgeschlagen."); }
  };
  const analyze = async () => {
    clearFeedback();
    setBusy("analysis");
    setBackupCreatedAt("");
    setConfirmed(false);
    setConfirmationText("");
    try {
      setPreview(await analyzeLocalDataForMigration());
      setMigrationDeferred(false);
      try { localStorage.removeItem(MIGRATION_DEFERRED_KEY); } catch { /* optional preference */ }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Die lokalen Daten konnten nicht analysiert werden.");
    } finally {
      setBusy(undefined);
    }
  };
  const createMigrationBackup = async () => {
    clearFeedback();
    setBusy("backup");
    try {
      const result = await exportBackup(backupPassword || undefined);
      if (result.delivery === "cancelled") return setMessage("Backup wurde abgebrochen. Es wurden keine Cloud-Daten verändert.");
      const createdAt = new Date().toISOString();
      setBackupCreatedAt(createdAt);
      setMessage(result.delivery === "shared"
        ? "Backup wurde an das Speichern-/Teilen-Menü übergeben. Nach dem Sichern kann die Übernahme bestätigt werden."
        : "Backup wurde heruntergeladen. Jetzt kann die Übernahme ausdrücklich bestätigt werden.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Das Sicherheitsbackup konnte nicht erstellt werden.");
    } finally {
      setBusy(undefined);
    }
  };
  const deferMigration = () => {
    setPreview(undefined);
    setBackupCreatedAt("");
    setConfirmationText("");
    setConfirmed(false);
    setMigrationDeferred(true);
    setMessage("Die Entscheidung wurde verschoben. Lokale und Cloud-Daten wurden nicht verändert.");
    try { localStorage.setItem(MIGRATION_DEFERRED_KEY, new Date().toISOString()); } catch { /* optional preference */ }
  };
  const migrate = async () => {
    if (!preview || !backupCreatedAt || !confirmed || confirmationText !== MIGRATION_CONFIRMATION_TEXT) return;
    clearFeedback();
    setBusy("migration");
    try {
      const currentPreview = await analyzeLocalDataForMigration();
      if (currentPreview.id !== preview.id) {
        setPreview(currentPreview);
        setBackupCreatedAt("");
        setConfirmed(false);
        setConfirmationText("");
        throw new Error("Die lokalen Daten haben sich seit der Vorschau verändert. Bitte die neue Vorschau prüfen und danach ein frisches Backup erstellen.");
      }
      const result = await requestLocalMigration({ preview, backupCreatedAt, confirmationText, confirmed: true });
      setMessage(result.message);
      if (result.status === "completed" && (result.pendingChanges ?? 0) === 0) {
        setMigrationReport({ preview: currentPreview, completedAt: new Date().toISOString() });
        setPreview(undefined);
        setBackupCreatedAt("");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Die Cloud-Übernahme ist fehlgeschlagen.");
    } finally {
      setBusy(undefined);
    }
  };
  const preferCloudData = async () => {
    if (!preview || !backupCreatedAt) return;
    const confirmation = window.prompt(`Zum Laden des zentralen Cloud-Datenstands bitte ${CLOUD_PREFERRED_CONFIRMATION_TEXT} eingeben. Das soeben erstellte Backup bleibt erhalten.`);
    if (confirmation !== CLOUD_PREFERRED_CONFIRMATION_TEXT) return;
    clearFeedback();
    setBusy("migration");
    try {
      const currentPreview = await analyzeLocalDataForMigration();
      if (currentPreview.id !== preview.id) throw new Error("Die lokalen Daten haben sich seit der Vorschau verändert. Bitte neu prüfen und ein frisches Backup erstellen.");
      const result = await requestUseCloudData({ preview, backupCreatedAt, confirmationText: confirmation, confirmed: true });
      setMessage(result.message);
      if (result.status === "completed") {
        setPreview(undefined);
        setBackupCreatedAt("");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Der Cloud-Datenstand konnte nicht geladen werden.");
    } finally {
      setBusy(undefined);
    }
  };
  const updatePassword = async () => {
    clearFeedback();
    if (newPassword.length < 8) return setError("Das neue Passwort muss mindestens acht Zeichen lang sein.");
    if (newPassword !== passwordConfirmation) return setError("Die beiden Passworteingaben stimmen nicht überein.");
    setBusy("password");
    try {
      await cloud.changePassword(newPassword);
      setNewPassword("");
      setPasswordConfirmation("");
      setMessage("Passwort wurde geändert.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Das Passwort konnte nicht geändert werden.");
    } finally {
      setBusy(undefined);
    }
  };
  const resolveConflict = async (conflict: SyncConflict, resolution: "use_local" | "use_remote") => {
    const choice = resolution === "use_local" ? "die lokale Version" : "die Cloud-Version";
    if (!window.confirm(`Für diesen Datensatz wirklich ${choice} übernehmen? Die andere Version bleibt im Konfliktprotokoll nachvollziehbar.`)) return;
    clearFeedback();
    try {
      await resolveCloudConflict(conflict.id, resolution);
      setMessage(`${choice[0]!.toUpperCase()}${choice.slice(1)} wurde übernommen.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Der Konflikt konnte nicht aufgelöst werden.");
    }
  };

  return <section className="panel settings-section cloud-settings-section">
    <div className="section-icon">{cloud.runtime.online ? <Cloud /> : <CloudOff />}</div>
    <h2>Cloud & dieses Gerät</h2>
    <p className="section-note">Die App bleibt offline nutzbar. Sobald eine Verbindung besteht, kann der geschützte Datenbereich abgeglichen werden.</p>
    {(message || error) && <div className={`notice cloud-notice ${error ? "error" : "success"}`}>{error || message}</div>}
    {migrationReport && <div className="notice success migration-report"><CheckCircle2 /><span><strong>Cloud-Migration abgeschlossen</strong><small>{migrationReport.preview.counts.customers} Kunden · {migrationReport.preview.counts.invoices} Rechnungen · {migrationReport.preview.counts.invoiceItems} Positionen · {migrationReport.preview.counts.expenses} Ausgaben · {migrationReport.preview.counts.templates} Vorlagen · 0 Fehler · {formatDateTime(migrationReport.completedAt)}</small></span></div>}

    <div className="cloud-overview">
      <div className={`cloud-state-card ${cloud.statusTone}`}><span>{cloud.runtime.online ? <Cloud /> : <CloudOff />} Verbindung</span><strong>{cloud.syncStatus}</strong><small>{cloud.configured ? (cloud.organizationName || "Organisation wird geladen") : "Cloud in dieser Installation nicht aktiviert"}</small></div>
      <div className="cloud-state-card"><span><Laptop /> Aktuelles Gerät</span><strong>{device.label}</strong><small>Gerätekennung {device.id.slice(0, 8)}</small></div>
      <div className="cloud-state-card"><span><RefreshCw /> Letzter Sync</span><strong>{formatDateTime(cloud.runtime.lastSyncedAt)}</strong><small>{cloud.runtime.pendingChanges} {cloud.runtime.pendingChanges === 1 ? "ausstehende Änderung" : "ausstehende Änderungen"}</small></div>
    </div>

    {cloud.configured ? <>
      <dl className="summary cloud-account-summary">
        <div><dt>Konto</dt><dd>{cloud.session?.user.email || "nicht angemeldet"}</dd></div>
        <div><dt>Organisation</dt><dd>{cloud.organizationName || "–"}</dd></div>
        <div><dt>Rolle</dt><dd>{cloud.roleLabel || "–"}</dd></div>
      </dl>
      {cloud.runtime.lastError && <p className="cloud-inline-error"><AlertTriangle /> {cloud.runtime.lastError}</p>}
      <div className="cloud-actions">
        <button className="primary" disabled={!cloud.runtime.online || busy === "sync" || cloud.runtime.phase === "syncing"} onClick={() => void syncNow()}><RefreshCw className={busy === "sync" ? "spin" : ""} /> {busy === "sync" ? "Abgleich läuft …" : "Jetzt synchronisieren"}</button>
        <button className="secondary" onClick={() => void signOut()}><LogOut /> Dieses Gerät abmelden</button>
      </div>
      <div className="password-change">
        <h3><KeyRound /> Passwort ändern</h3>
        <div className="form-grid">
          <label>Neues Passwort<input type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label>
          <label>Passwort wiederholen<input type="password" autoComplete="new-password" minLength={8} value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} /></label>
        </div>
        <button className="secondary" disabled={busy === "password" || !newPassword || !passwordConfirmation} onClick={() => void updatePassword()}>{busy === "password" ? "Passwort wird geändert …" : "Passwort ändern"}</button>
      </div>
      {conflicts.length > 0 && <div className="sync-conflicts">
        <h3><AlertTriangle /> {conflicts.length} {conflicts.length === 1 ? "Datenkonflikt" : "Datenkonflikte"}</h3>
        <p>Keine Version wird still überschrieben. Bitte je Datensatz auswählen, welche Fassung gelten soll.</p>
        {conflicts.map((conflict) => <article key={conflict.id}>
          <div><strong>{conflict.entityType} · {conflict.entityId}</strong><small>Lokal: {formatDateTime(conflict.localUpdatedAt)} · Cloud: {formatDateTime(conflict.remoteUpdatedAt)}</small></div>
          <div><button className="small-button" onClick={() => void resolveConflict(conflict, "use_remote")}>Cloud-Version</button><button className="secondary" onClick={() => void resolveConflict(conflict, "use_local")}>Lokale Version</button></div>
        </article>)}
      </div>}
    </> : <div className="cloud-local-info"><HardDrive /><span><strong>Lokaler Betrieb</strong><small>Alle Daten bleiben ausschließlich in diesem Browser. Backups sind weiterhin möglich.</small></span></div>}

    {cloud.configured && cloud.session && cloud.membership && migrationGate.loading && <p className="section-note migration-gate-loading">Status der ersten Cloud-Übernahme wird geprüft …</p>}
    {cloud.configured && cloud.session && cloud.membership && !migrationGate.loading && migrationGate.value?.authorizedAt && <div className="migration-authorized"><CheckCircle2 /><span><strong>{migrationGate.value.reason === "empty-device" ? "Frisches Gerät automatisch verbunden" : migrationGate.value.reason === "cloud-preferred" ? "Cloud-Datenstand verwendet" : "Lokale Übernahme freigegeben"}</strong><small>{migrationGate.value.completedAt ? `Abgeschlossen am ${formatDateTime(migrationGate.value.completedAt)}` : "Der Abgleich wird fortgesetzt, bis alle Änderungen übertragen oder als Konflikt gemeldet sind."}</small></span></div>}
    {cloud.configured && cloud.session && cloud.membership && !migrationGate.loading && !migrationGate.value?.authorizedAt && !mayMigrate && <div className="migration-assistant"><div className="migration-heading"><ShieldCheck /><div><h3>Lokale Datenübernahme</h3><p>Nur die Inhaberin kann eine erstmalige Übernahme in den gemeinsamen Datenbestand freigeben. Lokale Daten bleiben bis dahin unverändert.</p></div></div></div>}
    {cloud.configured && cloud.session && cloud.membership && !migrationGate.loading && !migrationGate.value?.authorizedAt && mayMigrate && <div className="migration-assistant">
      <div className="migration-heading"><UploadCloud /><div><h3>Lokale Daten einmalig übernehmen</h3><p>Vor einer Übernahme werden die vorhandenen Daten nur gelesen, gezählt und auf Beziehungen geprüft.</p></div></div>
      {!preview && <>
        {migrationDeferred && <p className="notice migration-deferred">Die Übernahme wurde für später zurückgestellt.</p>}
        <div className="migration-start-actions"><button className="secondary" disabled={busy === "analysis"} onClick={() => void analyze()}>{busy === "analysis" ? "Daten werden geprüft …" : migrationDeferred ? "Entscheidung wieder öffnen" : "Lokale Daten prüfen"}</button>{!migrationDeferred && <button className="small-button" onClick={deferMigration}>Später entscheiden</button>}</div>
      </>}
      {preview && <div className="migration-preview">
        <div className="migration-preview-head"><div><strong>Analyse vom {formatDateTime(preview.analyzedAt)}</strong><small>{preview.totalRecords} Datensätze · Anhänge {formatBytes(preview.attachmentBytes)}</small></div><CheckCircle2 /></div>
        {preview.freshDevice ? <div className="notice success migration-fresh"><CheckCircle2 /> Dieses Gerät ist frisch: Es gibt keine lokalen Datensätze, die hochgeladen werden müssten. Cloud-Daten können direkt synchronisiert werden.</div> : <>
          <dl className="migration-counts">
            <div><dt>Kunden</dt><dd>{preview.counts.customers}</dd></div><div><dt>Rechnungen</dt><dd>{preview.counts.invoices}</dd></div><div><dt>Positionen</dt><dd>{preview.counts.invoiceItems}</dd></div><div><dt>Zahlungen</dt><dd>{preview.counts.payments}</dd></div><div><dt>Ausgaben</dt><dd>{preview.counts.expenses}</dd></div><div><dt>Anhänge</dt><dd>{preview.counts.attachments}</dd></div><div><dt>Vorlagen</dt><dd>{preview.counts.templates}</dd></div><div><dt>Protokolle</dt><dd>{preview.counts.auditLogs + preview.counts.importLogs}</dd></div>
          </dl>
          {preview.warnings.length > 0 && <div className="migration-messages warning"><strong>Hinweise</strong><ul>{preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}
          {preview.blockers.length > 0 && <div className="migration-messages blocked"><strong>Vor der Übernahme klären</strong><ul>{preview.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul></div>}
          {preview.canMigrate && !backupCreatedAt && <div className="migration-backup"><ShieldCheck /><div><strong>Pflichtschritt: aktuelles Sicherheitsbackup</strong><p>Ohne ein in diesem Schritt erstelltes Backup wird die Cloud-Übernahme nicht freigegeben.</p><button className="primary" disabled={busy === "backup"} onClick={() => void createMigrationBackup()}><DatabaseBackup /> {busy === "backup" ? "Backup wird erstellt …" : "Backup vor Übernahme erstellen"}</button></div></div>}
          {preview.canMigrate && backupCreatedAt && <div className="migration-confirmation">
            <p className="notice success"><CheckCircle2 /> Sicherheitsbackup erstellt: {formatDateTime(backupCreatedAt)}</p>
            <p>Die Übernahme ergänzt den Organisationsbestand. Vorhandene Cloud-Daten dürfen nicht still überschrieben werden; Konflikte müssen gemeldet werden.</p>
            <label className="check"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> Ich habe Vorschau und Backup geprüft und möchte die lokalen Daten jetzt übernehmen.</label>
            <label>Zur Bestätigung <strong>{MIGRATION_CONFIRMATION_TEXT}</strong> eingeben<input value={confirmationText} onChange={(event) => setConfirmationText(event.target.value)} autoComplete="off" /></label>
            <button className="primary full" disabled={busy === "migration" || !confirmed || confirmationText !== MIGRATION_CONFIRMATION_TEXT || !cloud.runtime.online} onClick={() => void migrate()}><UploadCloud /> {busy === "migration" ? "Übernahme läuft …" : "Bestätigt in die Cloud übernehmen"}</button>
            <hr />
            <p><strong>Alternativ:</strong> Den bereits zentral gespeicherten Datenstand laden. Das Sicherheitsbackup bewahrt die lokalen Ausgangsdaten als Rückweg.</p>
            <button className="secondary full" disabled={busy === "migration" || !cloud.runtime.online} onClick={() => void preferCloudData()}><Cloud /> Cloud-Daten verwenden</button>
          </div>}
        </>}
        <div className="migration-footer-actions"><button className="small-button" onClick={deferMigration}>Später entscheiden</button>{preview.freshDevice && <button className="primary" onClick={() => { setPreview(undefined); void syncNow(); }}>Cloud-Daten synchronisieren</button>}</div>
      </div>}
    </div>}
  </section>;
}
