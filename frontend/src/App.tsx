import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
import Layout from "./components/Layout";
import RequireAuth from "./components/RequireAuth";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import DataViewer from "./pages/DataViewer";
import Debt from "./pages/Debt";
import DebtClient from "./pages/DebtClient";
import DebtLedger from "./pages/DebtLedger";
import DebtWorklist from "./pages/DebtWorklist";
import Ops from "./pages/Ops";
import Payments from "./pages/Payments";
import Sales from "./pages/Sales";
import YearlySnapshots from "./pages/YearlySnapshots";
import AdminUsers from "./pages/AdminUsers";
import AdminAudit from "./pages/AdminAudit";

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/data" element={<Navigate to="/data/orders" replace />} />
          <Route path="/data/orders" element={<DataViewer lockedTable="deal_order" />} />
          <Route path="/data/payments" element={<DataViewer lockedTable="payment" />} />
          <Route path="/data/legal-persons" element={<DataViewer lockedTable="legal_person" />} />
          <Route path="/collection" element={<Navigate to="/collection/debt" replace />} />
          <Route path="/collection/debt" element={<Debt />} />
          <Route path="/collection/worklist" element={<DebtWorklist />} />
          <Route path="/collection/debt/client/:personId" element={<DebtClient />} />
          <Route path="/collection/ledger" element={<DebtLedger />} />
          <Route path="/analytics" element={<Navigate to="/analytics/sales" replace />} />
          <Route path="/analytics/sales" element={<Sales />} />
          <Route path="/analytics/payments" element={<Payments />} />
          <Route path="/analytics/yearly" element={<YearlySnapshots />} />
          <Route
            path="/ops"
            element={
              <RequireAuth roles={["admin", "operator"]}>
                <Ops />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/users"
            element={
              <RequireAuth roles={["admin"]}>
                <AdminUsers />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/audit"
            element={
              <RequireAuth roles={["admin"]}>
                <AdminAudit />
              </RequireAuth>
            }
          />
        </Route>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
  );
}
