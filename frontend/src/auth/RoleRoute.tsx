import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./AuthContext";
import type { UserRole } from "./types";

interface RoleRouteProps {
  allowedRoles: UserRole[];
}

/**
 * Nest inside <ProtectedRoute> — assumes authentication has already
 * been verified there. Only checks role, and (like ProtectedRoute)
 * is a UX convenience: the backend's `requireRole` middleware is the
 * authoritative check. Not used anywhere yet; provided so
 * role-specific routes can adopt it later without new plumbing.
 *
 * Usage:
 *   <Route element={<ProtectedRoute />}>
 *     <Route element={<RoleRoute allowedRoles={["DOCTOR"]} />}>
 *       <Route path="/doctor" element={<DoctorDashboard />} />
 *     </Route>
 *   </Route>
 */
export function RoleRoute({ allowedRoles }: RoleRouteProps) {
  const { user } = useAuth();

  if (!user || !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
