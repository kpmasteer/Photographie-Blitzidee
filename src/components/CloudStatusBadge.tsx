import { AlertTriangle, Cloud, CloudOff, HardDrive, RefreshCw } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useCloud } from "../cloud/context";

export function CloudStatusBadge({ compact = false }: { compact?: boolean }) {
  const cloud = useCloud();
  const Icon = !cloud.configured
    ? HardDrive
    : cloud.statusTone === "offline"
      ? CloudOff
      : cloud.statusTone === "error"
        ? AlertTriangle
        : cloud.statusTone === "syncing"
          ? RefreshCw
          : Cloud;

  return <NavLink
    to="/settings"
    className={`cloud-status-badge ${cloud.statusTone} ${compact ? "compact" : ""}`}
    aria-label={`${cloud.syncStatus}. Cloud-Einstellungen öffnen`}
  >
    <Icon className={cloud.statusTone === "syncing" ? "spin" : ""} aria-hidden="true" />
    <span><strong>{cloud.syncStatus}</strong>{!compact && <small>{cloud.organizationName || cloud.session?.user.email || "Lokaler Datenspeicher"}{cloud.roleLabel ? ` · ${cloud.roleLabel}` : ""}</small>}</span>
  </NavLink>;
}
