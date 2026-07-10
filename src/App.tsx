import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
import { seedDatabase } from "./lib/seed";
import { Layout } from "./components/Layout";
import { SetupWizard } from "./components/SetupWizard";
import { Dashboard } from "./pages/Dashboard";
import { Invoices } from "./pages/Invoices";
import { InvoiceEditor } from "./pages/InvoiceEditor";
import { Customers } from "./pages/Customers";
import { Expenses } from "./pages/Expenses";
import { Reports } from "./pages/Reports";
import { Settings } from "./pages/Settings";
import { ensureCustomerNumbers } from "./lib/customerNumbers";
import { catchUpRecurringExpenses } from "./lib/recurringExpenses";

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    seedDatabase().then(async () => {
      await ensureCustomerNumbers();
      await catchUpRecurringExpenses();
      const today = new Date().toISOString().slice(0, 10);
      const candidates = await db.invoices.where("status").anyOf("finalized", "sent").toArray();
      await Promise.all(candidates.filter((invoice) => invoice.dueDate < today).map((invoice) => db.invoices.update(invoice.id, { status: "overdue", updatedAt: new Date().toISOString() })));
      setReady(true);
    }).catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, []);
  const company = useLiveQuery(() => db.company.get("company"), [], undefined);
  if (error) return <main className="fatal"><h1>Die App konnte nicht gestartet werden</h1><p>{error}</p></main>;
  if (!ready || company === undefined) return <main className="splash"><img src="/logo-schrift.png" alt="Photographie Blitzidee" /><p>Datenbank wird sicher geöffnet …</p></main>;
  if (!company?.confirmedAt) return <SetupWizard company={company!} />;
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/invoices" element={<Invoices />} />
        <Route path="/invoices/new" element={<InvoiceEditor />} />
        <Route path="/invoices/:invoiceId" element={<InvoiceEditor />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/expenses" element={<Expenses />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
