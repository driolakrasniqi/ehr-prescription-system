import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { RoleRoute } from "./auth/RoleRoute";
import { AppShell } from "./components/layout/AppShell";
import { AdminAccessPage } from "./pages/admin/AdminAccessPage";
import { AdminOrganizationsPage } from "./pages/admin/AdminOrganizationsPage";
import { AdminPeoplePage } from "./pages/admin/AdminPeoplePage";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { PatientDashboardPage } from "./pages/patient/PatientDashboardPage";
import { PatientProfilePage } from "./pages/patient/PatientProfilePage";
import { DoctorPatientsPage } from "./pages/doctor/DoctorPatientsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SignUpPage } from "./pages/SignUpPage";
import "./App.css";

function HomePage() {
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  return <DashboardPage />;
}

export default function App() {
  return (
    <Routes>
      {/* Public pages */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignUpPage />} />

      {/* Every route below requires authentication */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />

          {/* Shared authenticated page */}
          <Route path="settings" element={<SettingsPage />} />

          {/* Patient-only pages */}
          <Route element={<RoleRoute allowedRoles={["PATIENT"]} />}>
            <Route path="patient" element={<PatientDashboardPage />} />

            <Route path="patient/profile" element={<PatientProfilePage />} />

            <Route path="patient/dashboard" element={<Navigate to="/patient" replace />} />
          </Route>

          {/* Administrator-only pages */}
          <Route element={<RoleRoute allowedRoles={["ADMIN"]} />}>
            <Route path="admin/people" element={<AdminPeoplePage />} />

            <Route path="admin/access" element={<AdminAccessPage />} />

            <Route path="admin/organizations" element={<AdminOrganizationsPage />} />

            <Route path="admin/users" element={<Navigate to="/admin/access" replace />} />

            <Route path="admin/roles" element={<Navigate to="/admin/access" replace />} />

            <Route path="admin/staff" element={<Navigate to="/admin/people" replace />} />
          </Route>

          {/* Doctor-only workspace */}
          <Route element={<RoleRoute allowedRoles={["DOCTOR"]} />}>
            <Route path="doctor/patients" element={<DoctorPatientsPage />} />
          </Route>

          {/* Unknown authenticated URLs */}
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
