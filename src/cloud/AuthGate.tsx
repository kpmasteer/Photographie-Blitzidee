import { useCallback, useEffect, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { Cloud, CloudOff, LogOut, RefreshCw, ShieldCheck } from "lucide-react";
import { cloudConfigured } from "./config";
import { supabase } from "./client";
import { CloudContext, ROLE_LABELS, describeCloudStatus, type Membership } from "./context";
import {
  getCloudRuntimeStatus,
  requestManualSync,
  resetCloudRuntimeStatus,
  setCloudConnectivity,
  subscribeCloudRuntimeStatus
} from "./operations";
import { CloudSyncRuntime } from "./sync/CloudSyncRuntime";
import { stopCloudSync } from "./sync/service";
import { clearLocalAccountCache, getLocalCacheSafety, prepareLocalCacheIdentity } from "./cacheIsolation";

const MEMBERSHIP_CACHE_PREFIX = "blitzidee-membership-";

function readCachedMembership(userId: string): Membership | undefined {
  try {
    const value = JSON.parse(localStorage.getItem(`${MEMBERSHIP_CACHE_PREFIX}${userId}`) || "null") as Membership | null;
    const validRoles = ["owner", "admin", "member", "read_only"];
    return value?.organization_id && validRoles.includes(value.role) ? value : undefined;
  } catch {
    return undefined;
  }
}

function cacheMembership(userId: string, membership?: Membership) {
  try {
    const key = `${MEMBERSHIP_CACHE_PREFIX}${userId}`;
    if (membership) localStorage.setItem(key, JSON.stringify(membership));
    else localStorage.removeItem(key);
  } catch {
    // Offline access remains available even if private mode rejects localStorage.
  }
}

function clearMembershipCaches() {
  try {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(MEMBERSHIP_CACHE_PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    // Optional privacy cleanup; the protected application is already locked.
  }
}

function loginErrorMessage(message: string): string {
  const normalized = message.toLocaleLowerCase("de-DE");
  if (normalized.includes("invalid login") || normalized.includes("invalid credentials")) return "E-Mail-Adresse oder Passwort ist nicht korrekt.";
  if (normalized.includes("email not confirmed")) return "Die E-Mail-Adresse wurde noch nicht bestätigt.";
  if (normalized.includes("fetch") || normalized.includes("network")) return "Die Cloud ist momentan nicht erreichbar. Bitte Internetverbindung prüfen und erneut versuchen.";
  return "Die Anmeldung ist fehlgeschlagen. Bitte Zugangsdaten prüfen und erneut versuchen.";
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>();
  const [loaded, setLoaded] = useState(!cloudConfigured);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [membership, setMembership] = useState<Membership>();
  const [membershipLoaded, setMembershipLoaded] = useState(false);
  const [membershipError, setMembershipError] = useState("");
  const [membershipReload, setMembershipReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const runtime = useSyncExternalStore(subscribeCloudRuntimeStatus, getCloudRuntimeStatus, getCloudRuntimeStatus);
  const syncIdentity = session && membership ? `${session.user.id}:${membership.organization_id}` : "";
  const [cloudStartState, setCloudStartState] = useState<{ identity: string; status: "ready" | "error"; message?: string }>();
  const markCloudReady = useCallback(() => {
    setCloudStartState({ identity: syncIdentity, status: "ready" });
  }, [syncIdentity]);
  const markCloudError = useCallback((cloudMessage: string) => {
    setCloudStartState({ identity: syncIdentity, status: "error", message: cloudMessage });
  }, [syncIdentity]);
  const cloudReady = cloudStartState?.identity === syncIdentity && cloudStartState.status === "ready";
  const cloudStartError = cloudStartState?.identity === syncIdentity && cloudStartState.status === "error"
    ? cloudStartState.message
    : undefined;

  useEffect(() => {
    const updateConnectivity = () => setCloudConnectivity(navigator.onLine);
    updateConnectivity();
    window.addEventListener("online", updateConnectivity);
    window.addEventListener("offline", updateConnectivity);
    return () => {
      window.removeEventListener("online", updateConnectivity);
      window.removeEventListener("offline", updateConnectivity);
    };
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setMessage("Die gespeicherte Anmeldung konnte nicht geladen werden. Bitte erneut anmelden.");
      setSession(data.session || undefined);
      setLoaded(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!active) return;
      setSession(next || undefined);
      setLoaded(true);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!supabase || !session) {
      setMembership(undefined);
      setMembershipLoaded(false);
      setMembershipError("");
      return;
    }
    let active = true;
    const cachedMembership = readCachedMembership(session.user.id);
    setMembership(undefined);
    setMembershipLoaded(false);
    setMembershipError("");

    const acceptMembership = async (nextMembership: Membership | undefined) => {
      if (nextMembership) {
        await prepareLocalCacheIdentity({
          userId: session.user.id,
          organizationId: nextMembership.organization_id
        });
      }
      if (!active) return;
      setMembership(nextMembership);
      cacheMembership(session.user.id, nextMembership);
      setMembershipLoaded(true);
    };

    if (!runtime.online) {
      if (!cachedMembership) {
        setMembershipLoaded(true);
        setMembershipError("Für dieses Gerät ist noch keine bestätigte Organisationszuordnung gespeichert. Bitte einmal mit Internet öffnen.");
      } else {
        void acceptMembership(cachedMembership).catch((cause) => {
          if (!active) return;
          setMembershipError(cause instanceof Error ? cause.message : "Der lokale Datenbereich konnte nicht sicher geöffnet werden.");
          setMembershipLoaded(true);
        });
      }
      return () => { active = false; };
    }

    void (async () => {
      const { data, error } = await supabase
        .from("organization_members")
        .select("organization_id,role,organizations(name)")
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      if (!active) return;
      if (error) {
        if (cachedMembership) await acceptMembership(cachedMembership);
        else {
          setMembershipError("Der gemeinsame Datenbereich konnte nicht geladen werden. Bitte erneut versuchen.");
          setMembershipLoaded(true);
        }
        return;
      }
      await acceptMembership(data as Membership | undefined);
    })().catch((cause: unknown) => {
      if (!active) return;
      setMembershipError(cause instanceof Error ? cause.message : "Der gemeinsame Datenbereich konnte nicht sicher geöffnet werden.");
      setMembershipLoaded(true);
    });
    return () => { active = false; };
  }, [session, membershipReload, runtime.online]);

  const cloudStatus = describeCloudStatus(cloudConfigured, session, runtime);
  const signOut = async () => {
    if (!supabase || !session) return;
    let preserveUnmigratedLocalData = !membership;
    if (membership) {
      let safety = await getLocalCacheSafety(membership.organization_id);
      preserveUnmigratedLocalData = !safety.migrationAuthorized && safety.businessRecords > 0;
      if (safety.pending > 0) {
        if (!runtime.online) throw new Error("Auf diesem Gerät warten noch Änderungen. Bitte vor dem Abmelden eine Internetverbindung herstellen und synchronisieren.");
        await requestManualSync();
        safety = await getLocalCacheSafety(membership.organization_id);
      }
      if (safety.pending > 0) throw new Error("Einige Änderungen konnten noch nicht sicher übertragen werden. Bitte den Cloud-Status prüfen und erneut synchronisieren.");
      if (safety.conflicts > 0) throw new Error("Vor dem Abmelden müssen offene Datenkonflikte in den Einstellungen geklärt werden.");
    }
    stopCloudSync();
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) throw new Error("Die Abmeldung auf diesem Gerät ist fehlgeschlagen.");
    cacheMembership(session.user.id, undefined);
    if (!preserveUnmigratedLocalData) {
      await clearLocalAccountCache();
      clearMembershipCaches();
      resetCloudRuntimeStatus();
    }
  };
  const changePassword = async (nextPassword: string) => {
    if (!supabase || !session) throw new Error("Bitte zuerst anmelden.");
    if (nextPassword.length < 8) throw new Error("Das neue Passwort muss mindestens acht Zeichen lang sein.");
    const { error } = await supabase.auth.updateUser({ password: nextPassword });
    if (error) throw new Error("Das Passwort konnte nicht geändert werden. Bitte erneut anmelden und noch einmal versuchen.");
  };
  const contextValue = {
    configured: cloudConfigured,
    session,
    membership,
    runtime,
    syncStatus: cloudStatus.label,
    statusTone: cloudStatus.tone,
    roleLabel: membership ? ROLE_LABELS[membership.role] : undefined,
    organizationName: membership?.organizations?.name,
    signOut,
    changePassword,
    syncNow: requestManualSync
  };

  if (!cloudConfigured) return <main className="setup"><section className="setup-card compact-auth-card">
    <CloudOff className="setup-symbol" />
    <h1>Cloud-Verbindung noch nicht eingerichtet</h1>
    <p>Für diese Version werden die gemeinsamen Rechnungsdaten über die geschützte Cloud geladen. Bitte die öffentlichen Supabase-Variablen in der Bereitstellung hinterlegen.</p>
  </section></main>;
  if (!loaded) return <main className="splash"><p>Sichere Sitzung wird geladen …</p></main>;

  if (!session) {
    const login = async (event: FormEvent) => {
      event.preventDefault();
      if (!supabase || !email.trim() || !password || !runtime.online) return;
      setBusy(true);
      setMessage("");
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      });
      setBusy(false);
      if (error) setMessage(loginErrorMessage(error.message));
    };
    return <main className="setup cloud-auth"><section className="setup-card">
      <img src="/logo-rechnung.jpg" alt="Photographie Blitzidee" />
      <div className={`cloud-login-state ${runtime.online ? "online" : "offline"}`}>{runtime.online ? <Cloud /> : <CloudOff />} {runtime.online ? "Internet verfügbar" : "Keine Internetverbindung"}</div>
      <h1>Sicher anmelden</h1>
      <p>Mit deinem freigeschalteten Konto öffnest du auf jedem Gerät denselben geschützten Datenbestand.</p>
      <form onSubmit={(event) => void login(event)}>
        <label>E-Mail-Adresse<input autoComplete="email" inputMode="email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>Passwort<input autoComplete="current-password" type="password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <button className="primary full" disabled={busy || !runtime.online || !email.trim() || !password}>{busy ? "Anmeldung wird geprüft …" : "Anmelden"}</button>
      </form>
      {message && <p className="notice error">{message}</p>}
      {!runtime.online && <p className="notice error">Für die erste Anmeldung wird kurz eine Internetverbindung benötigt. Bereits angemeldete Geräte können später offline weiterarbeiten.</p>}
      <p className="fineprint"><ShieldCheck /> Kundendaten werden nur innerhalb der zugeordneten Organisation freigegeben.</p>
    </section></main>;
  }

  if (!membershipLoaded) return <main className="splash"><p>Gemeinsamer Datenbereich wird geladen …</p></main>;

  if (membershipError) return <main className="setup"><section className="setup-card compact-auth-card">
    <CloudOff className="setup-symbol" />
    <h1>Datenbereich nicht erreichbar</h1>
    <p>{membershipError} Deine lokalen Daten wurden nicht verändert.</p>
    <button className="primary full" disabled={!runtime.online} onClick={() => setMembershipReload((value) => value + 1)}><RefreshCw /> Erneut versuchen</button>
    <button className="secondary full" onClick={() => void signOut()}><LogOut /> Auf diesem Gerät abmelden</button>
  </section></main>;

  if (!membership) {
    return <main className="setup"><section className="setup-card">
      <ShieldCheck className="setup-symbol" />
      <h1>Zugang wartet auf Freigabe</h1>
      <p>Die Anmeldung war erfolgreich, aber dieses Konto ist noch nicht der Organisation „Photographie Blitzidee“ zugeordnet. Aus Sicherheitsgründen erfolgt die erste Zuordnung und jede weitere Freigabe durch die Administration.</p>
      <label>Organisation<input value="Photographie Blitzidee" readOnly /></label>
      <button className="primary full" disabled={!runtime.online} onClick={() => setMembershipReload((value) => value + 1)}><RefreshCw /> Freigabe erneut prüfen</button>
      <button className="secondary full" onClick={() => void signOut()}><LogOut /> Auf diesem Gerät abmelden</button>
      <p className="fineprint">Es wurden keine Organisations- oder Rechnungsdaten geladen.</p>
    </section></main>;
  }

  const appContent = cloudReady
    ? children
    : cloudStartError
      ? <main className="setup"><section className="setup-card compact-auth-card">
        <CloudOff className="setup-symbol" />
        <h1>Cloud-Datenstand nicht geladen</h1>
        <p>{cloudStartError} Der möglicherweise ältere Gerätecache wird deshalb nicht angezeigt.</p>
        <button className="primary full" onClick={() => window.location.reload()}><RefreshCw /> Erneut versuchen</button>
      </section></main>
      : <main className="splash"><p>Aktueller Cloud-Datenstand wird geladen …</p></main>;

  return <CloudContext.Provider value={contextValue}><CloudSyncRuntime onReady={markCloudReady} onError={markCloudError} />{appContent}</CloudContext.Provider>;
}
