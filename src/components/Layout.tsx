import type { ReactNode } from "react";
import { BarChart3, FileText, LayoutDashboard, Receipt, Settings, Users } from "lucide-react";
import { NavLink } from "react-router-dom";
import { PaymentReminder } from "./PaymentReminder";

const links = [
  ["/", "Übersicht", LayoutDashboard], ["/invoices", "Rechnungen", FileText], ["/customers", "Kunden", Users],
  ["/expenses", "Ausgaben", Receipt], ["/reports", "Auswertung", BarChart3], ["/settings", "Einstellungen", Settings]
] as const;

export function Layout({ children }: { children: ReactNode }) {
  return <div className="app-shell">
    <header className="topbar"><NavLink to="/" aria-label="Zur Übersicht"><img src="/logo-schrift.png" alt="Photographie Blitzidee" /></NavLink><span className="local-badge">Lokal & offline</span></header>
    <aside className="sidebar" aria-label="Hauptnavigation"><img className="brand" src="/logo-schrift.png" alt="Photographie Blitzidee" />{links.map(([to, label, Icon]) => <NavLink key={to} to={to} end={to === "/"}><Icon aria-hidden="true" /><span>{label}</span></NavLink>)}</aside>
    <main className="content">{children}</main>
    <PaymentReminder />
    <nav className="bottom-nav" aria-label="Hauptnavigation">{links.slice(0, 5).map(([to, label, Icon]) => <NavLink key={to} to={to} end={to === "/"}><Icon aria-hidden="true" /><span>{label}</span></NavLink>)}</nav>
  </div>;
}
