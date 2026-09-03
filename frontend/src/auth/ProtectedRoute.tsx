import { Navigate, Outlet, useLocation } from "react-router-dom";
import { HeartPulse } from "lucide-react";
import { useAuth } from "./AuthContext";

export function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <main className="app-loading">
        <div>
          <div className="app-loading__mark">
            <HeartPulse size={28} />
          </div>

          <p>Verifying your secure session…</p>
        </div>
      </main>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
