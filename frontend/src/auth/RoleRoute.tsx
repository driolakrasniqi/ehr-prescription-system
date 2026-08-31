import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import type { UserRole } from "./types";

interface RoleRouteProps {
  allowedRoles: UserRole[];
}

function getRoleHome(role: UserRole): string {
  switch (role) {
    case "PATIENT":
      return "/patient";

    case "ADMIN":
    case "DOCTOR":
    case "PHARMACIST":
    default:
      return "/";
  }
}

export function RoleRoute({ allowedRoles }: RoleRouteProps) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return null;
  }

  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname }}
      />
    );
  }

  if (!allowedRoles.includes(user.role)) {
    return (
      <Navigate
        to={getRoleHome(user.role)}
        replace
      />
    );
  }

  return <Outlet />;
}