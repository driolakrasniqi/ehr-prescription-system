import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { HeartPulse } from "lucide-react";

/**
 * Wrap protected routes with this. Unauthenticated users are
 * redirected to /login (preserving the attempted path so LoginPage
 * can send them back). This is a UX convenience only — the backend's
 * `authenticate`/`requireRole` middleware remain the real
 * authorization boundary; this component cannot be relied on for
 * actual security.
 */
export function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <main className="app-loading">
        <div>
          <div className="app-loading__mark"><HeartPulse size={28} /></div>
          <p>Restoring your secure session…</p>
        </div>
      </main>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
