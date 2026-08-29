import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { RoleRoute } from "./auth/RoleRoute";
import { AppShell } from "./components/layout/AppShell";
import { AdminPeoplePage } from "./pages/admin/AdminPeoplePage";
import { AdminAccessPage } from "./pages/admin/AdminAccessPage";
import { AdminOrganizationsPage } from "./pages/admin/AdminOrganizationsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SignUpPage } from "./pages/SignUpPage";
import { PatientDashboardPage } from "./pages/patient/PatientDashboardPage";
import "./App.css";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignUpPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route element={<RoleRoute allowedRoles={["PATIENT"]} />}>
            <Route path="patient/dashboard" element={<PatientDashboardPage />} />
          </Route>
          <Route element={<RoleRoute allowedRoles={["ADMIN"]} />}>
            <Route path="admin/people" element={<AdminPeoplePage />} />
            <Route path="admin/access" element={<AdminAccessPage />} />
            <Route path="admin/organizations" element={<AdminOrganizationsPage />} />
            <Route path="admin/users" element={<Navigate to="/admin/access" replace />} />
            <Route path="admin/roles" element={<Navigate to="/admin/access" replace />} />
            <Route path="admin/staff" element={<Navigate to="/admin/people" replace />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
