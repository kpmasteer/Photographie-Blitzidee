import { useEffect, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { Cloud, CloudOff, LogOut, RefreshCw, ShieldCheck } from "lucide-react";
import { cloudConfigured } from "./config";
import { supabase } from "./client";
import { CloudContext, ROLE_LABELS, describeCloudStatus, type Membership } from "./context";
import {
  getCloudRuntimeStatus,
  requestManualSync,
  setCloudConnectivity,
  subscribeCloudRuntimeStatus
} from "./operations";
import { CloudSyncRuntime } from "./sync/CloudSyncRuntime";

const MEMBERSHIP_CACHE_PREFIX = "blitzidee-membership-";

// This cache only unlocks the already-local offline UI. Cloud authorization is
// still enforced server-side by the authenticated session and RLS policies.
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

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>();
  const [loaded, setLoaded] = useState(!cloudConfigured);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [membership, setMembership] = useState<Membership>();
  const [membershipLoaded, setMembershipLoaded] = useState(false);
  const [membershipError, setMembershipError] = useState("");
  const [membershipReload, setMembershipReload] = useState(0);
  const [organizationName, setOrganizationName] = useState("Photographie Blitzidee");
  const [ownerName, setOwnerName] = useState("Lidia Lang");
  const [busy, setBusy] = useState(false);
  const runtime = useSyncExternalStore(subscribeCloudRuntimeStatus, getCloudRuntimeStatus, getCloudRuntimeStatus);

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
    if (cachedMembership) setMembership(cachedMembership);
    setMembershipLoaded(false);
    setMembershipError("");
    if (!runtime.online) {
      setMembershipLoaded(true);
      if (!cachedMembership) setMembershipError("Für dieses Gerät ist noch keine bestätigte Organisationszuordnung gespeichert. Bitte einmal mit Internet öffnen.");
      return;
    }
    void supabase
      .from("organization_members")
      .select("organization_id,role,organizations(name)")
      .eq("status", "active")
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setMembership(cachedMembership);
          if (!cachedMembership) setMembershipError("Der gemeinsame Datenbereich konnte nicht geladen werden. Bitte erneut versuchen.");
        } else {
          const nextMembership = data as Membership | undefined;
          setMembership(nextMembership);
          cacheMembership(session.user.id, nextMembership);
        }
        setMembershipLoaded(true);
      });
    return () => { active = false; };
  }, [session, membershipReload, runtime.online]);

  const cloudStatus = describeCloudStatus(cloudConfigured, session, runtime);
  const signOut = async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) throw new Error("Die Abmeldung auf diesem Gerät ist fehlgeschlagen.");
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
    syncNow: requestManualSync
  };

  if (!cloudConfigured) return <CloudContext.Provider value={contextValue}>{children}</CloudContext.Provider>;
  if (!loaded) return <main className="splash"><p>Sichere Sitzung wird geladen …</p></main>;

  if (!session) {
    const login = async (event: FormEvent) => {
      event.preventDefault();
      if (!supabase || !email.trim() || !runtime.online) return;
      setBusy(true);
      setMessage("");
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: window.location.origin }
      });
      setBusy(false);
      setMessage(error
        ? "Der Anmeldelink konnte nicht gesendet werden. Bitte Adresse und Internetverbindung prüfen."
        : "Anmeldelink wurde versendet. Bitte die E-Mail auf diesem Gerät öffnen.");
    };
    return <main className="setup cloud-auth"><section className="setup-card">
      <img src="/logo-rechnung.jpg" alt="Photographie Blitzidee" />
      <div className={`cloud-login-state ${runtime.online ? "online" : "offline"}`}>{runtime.online ? <Cloud /> : <CloudOff />} {runtime.online ? "Cloud erreichbar" : "Keine Internetverbindung"}</div>
      <h1>Sicher anmelden</h1>
      <p>Ein Anmeldelink per E-Mail verbindet dieses Gerät mit dem geschützten Datenbereich. Es ist kein Passwort nötig.</p>
      <form onSubmit={(event) => void login(event)}>
        <label>E-Mail-Adresse<input autoComplete="email" inputMode="email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <button className="primary full" disabled={busy || !runtime.online || !email.trim()}>{busy ? "Wird gesendet …" : "Anmeldelink senden"}</button>
      </form>
      {message && <p className="notice">{message}</p>}
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
    const createOrganization = async () => {
      if (!supabase || !organizationName.trim() || !ownerName.trim() || !runtime.online) return;
      setBusy(true);
      setMessage("");
      const { error } = await supabase.rpc("create_organization", {
        p_name: organizationName.trim(),
        p_owner_name: ownerName.trim()
      });
      setBusy(false);
      if (error) return setMessage("Der Datenbereich konnte nicht angelegt werden. Bitte erneut versuchen.");
      setMembershipReload((value) => value + 1);
    };
    return <main className="setup"><section className="setup-card">
      <h1>Organisation einrichten</h1>
      <p>Für dieses Konto wurde noch kein gemeinsamer Datenbereich gefunden. Mit dem folgenden Klick wird ein geschützter Bereich neu angelegt.</p>
      <label>Unternehmen<input value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} /></label>
      <label>Inhaberin<input value={ownerName} onChange={(event) => setOwnerName(event.target.value)} /></label>
      <button className="primary full" disabled={busy || !runtime.online || !organizationName.trim() || !ownerName.trim()} onClick={() => void createOrganization()}>{busy ? "Wird angelegt …" : "Geschützten Datenbereich anlegen"}</button>
      <button className="secondary full" onClick={() => void signOut()}><LogOut /> Auf diesem Gerät abmelden</button>
      {message && <p className="notice error">{message}</p>}
    </section></main>;
  }

  return <CloudContext.Provider value={contextValue}><CloudSyncRuntime />{children}</CloudContext.Provider>;
}
