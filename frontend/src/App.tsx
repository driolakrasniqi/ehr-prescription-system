import { useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { LoginPage } from "./pages/LoginPage";

/**
 * Placeholder landing page for authenticated users. This intentionally
 * stops at "auth works" — role-specific dashboards (admin/doctor/
 * pharmacist/patient) are a later milestone, not part of this one.
 */
function AuthenticatedHome() {
  const { user, logout } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function handleLogout(): Promise<void> {
    setIsLoggingOut(true);
    try {
      await logout();
    } finally {
      setIsLoggingOut(false);
    }
  }

  return (
    <main style={{ padding: "2rem", fontFamily: "Arial, sans-serif" }}>
      <h1>EHR and E-Prescription System</h1>
      <p>
        Signed in as {user?.displayName ?? user?.email} — role: <strong>{user?.role}</strong>
      </p>
      <button
        type="button"
        onClick={() => void handleLogout()}
        disabled={isLoggingOut}
        style={{ padding: "0.5rem 1rem" }}
      >
        {isLoggingOut ? "Logging out…" : "Log out"}
      </button>
    </main>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<AuthenticatedHome />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
