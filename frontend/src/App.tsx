import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
import Layout from "./components/Layout";
import RequireAuth from "./components/RequireAuth";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";

/**
 * Phase B: login + protected shell. Data / Ops / Admin placeholder into later
 * phases (currently show a simple "coming soon" inside the Layout chrome so
 * the routes exist for the sidebar).
 */
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
          <Route path="/data" element={<ComingSoon title="Data" />} />
          <Route
            path="/ops"
            element={
              <RequireAuth roles={["admin", "operator"]}>
                <ComingSoon title="Operations" />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/users"
            element={
              <RequireAuth roles={["admin"]}>
                <ComingSoon title="Users" />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/audit"
            element={
              <RequireAuth roles={["admin"]}>
                <ComingSoon title="Audit" />
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

function ComingSoon({ title }: { title: string }) {
  return (
    <div>
      <div className="caption text-ink-3">Dashboard · {title}</div>
      <h1 className="serif text-heading-lg text-ink mt-2">
        {title}
        <span className="text-mark">.</span>
      </h1>
      <p className="text-body text-ink-2 mt-6">
        Set in type for a later issue. Come back in Phase C.
      </p>
    </div>
  );
}
