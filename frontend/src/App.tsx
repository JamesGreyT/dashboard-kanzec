import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";

/**
 * Phase A: only the login splash is mounted. Dashboard / Data / Ops / Admin
 * routes will light up in later phases. Anything unknown bounces to /login.
 */
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
