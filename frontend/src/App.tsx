import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
import Layout from "./components/Layout";
import RequireAuth from "./components/RequireAuth";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import DataViewer from "./pages/DataViewer";
import DaySlice from "./pages/DaySlice";
import Ops from "./pages/Ops";
import Payments from "./pages/Payments";
import Returns from "./pages/Returns";
import Sales from "./pages/Sales";
import AdminAlerts from "./pages/AdminAlerts";
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
          <Route
            path="/dayslice"
            element={
              <RequireAuth roles={["admin"]}>
                <DaySlice />
              </RequireAuth>
            }
          />
          <Route path="/data" element={<Navigate to="/data/orders" replace />} />
          <Route path="/data/orders" element={<DataViewer lockedTable="deal_order" />} />
          <Route path="/data/payments" element={<DataViewer lockedTable="payment" />} />
          <Route path="/data/legal-persons" element={<DataViewer lockedTable="legal_person" />} />
          <Route path="/analytics" element={<Navigate to="/analytics/sales" replace />} />
          <Route path="/analytics/sales" element={<RequireAuth roles={["admin", "viewer"]}><Sales /></RequireAuth>} />
          <Route path="/analytics/payments" element={<RequireAuth roles={["admin", "viewer"]}><Payments /></RequireAuth>} />
          <Route path="/analytics/returns" element={<RequireAuth roles={["admin", "viewer"]}><Returns /></RequireAuth>} />
          <Route
            path="/ops"
            element={
              <RequireAuth roles={["admin"]}>
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
            path="/admin/alerts"
            element={
              <RequireAuth roles={["admin", "viewer"]}>
                <AdminAlerts />
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
