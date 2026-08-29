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
 * authoritative check. Used for administrator and patient workspaces.
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
