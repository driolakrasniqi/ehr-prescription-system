import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Activity,
  Building2,
  HeartPulse,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  Stethoscope,
  UserRound,
  Users,
  X
} from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import type { UserRole } from "../../auth/types";
import "./AppShell.css";

const roleLabels: Record<UserRole, string> = {
  ADMIN: "System administrator",
  DOCTOR: "Clinical workspace",
  PHARMACIST: "Pharmacy workspace",
  PATIENT: "Patient portal"
};

function getPageTitle(pathname: string, role: UserRole): string {
  if (pathname === "/admin/people") {
    return "People Directory";
  }

  if (pathname === "/admin/organizations") {
    return "Clinics & Pharmacies";
  }

  if (pathname === "/admin/access") {
    return "People & Access";
  }

  if (pathname === "/patient/profile") {
    return "My profile";
  }

  if (pathname === "/doctor/patients") {
    return "Patient care";
  }

  if (pathname === "/patient" || pathname === "/patient/dashboard") {
    return "My health summary";
  }

  if (pathname === "/settings") {
    return "Security settings";
  }

  if (role === "PATIENT") {
    return "My health summary";
  }

  return "Today at a glance";
}

export function AppShell() {
  const { user, logout } = useAuth();
  const location = useLocation();

  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  if (!user) {
    return null;
  }

  const initials = (user.displayName ?? user.email)
    .split(/\s|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  const pageTitle = getPageTitle(location.pathname, user.role);

  async function handleLogout() {
    setLoggingOut(true);

    try {
      await logout();
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div className="shell">
      <aside className={`sidebar ${menuOpen ? "sidebar--open" : ""}`}>
        <div className="sidebar__brand">
          <span>
            <HeartPulse size={24} />
          </span>

          <div>
            <strong>Cliniq</strong>
            <small>Care, clearly connected</small>
          </div>
        </div>

        <button
          type="button"
          className="sidebar__close"
          onClick={() => setMenuOpen(false)}
          aria-label="Close navigation"
        >
          <X size={20} />
        </button>

        <nav className="sidebar__nav" onClick={() => setMenuOpen(false)}>
          <p>Workspace</p>

          <NavLink to="/" end>
            <LayoutDashboard size={19} />
            Overview
          </NavLink>

          {user.role === "ADMIN" && (
            <>
              <NavLink to="/admin/people">
                <Users size={19} />
                People Directory
              </NavLink>

              <NavLink to="/admin/access">
                <ShieldCheck size={19} />
                People & Access
              </NavLink>

              <NavLink to="/admin/organizations">
                <Building2 size={19} />
                Clinics &amp; Pharmacies
              </NavLink>
            </>
          )}

          {user.role === "DOCTOR" && (
            <NavLink to="/doctor/patients">
              <Stethoscope size={19} />
              Patients
            </NavLink>
          )}

          {user.role === "PHARMACIST" && (
            <span className="sidebar__soon">
              <Activity size={19} />
              Prescriptions
              <small>Next module</small>
            </span>
          )}

          {user.role === "PATIENT" && (
            <>
              <NavLink to="/patient" end>
                <Activity size={19} />
                My health
              </NavLink>

              <NavLink to="/patient/profile">
                <UserRound size={19} />
                My profile
              </NavLink>
            </>
          )}

          <p>Account</p>

          <NavLink to="/settings">
            <Settings size={19} />
            Settings
          </NavLink>
        </nav>

        <div className="sidebar__profile">
          <div className="avatar">{initials}</div>

          <div>
            <strong>{user.displayName ?? "Account"}</strong>
            <small>{roleLabels[user.role]}</small>
          </div>

          <button
            type="button"
            onClick={() => void handleLogout()}
            disabled={loggingOut}
            aria-label="Log out"
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      {menuOpen && (
        <button
          type="button"
          className="shell__scrim"
          aria-label="Close navigation"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <section className="shell__main">
        <header className="topbar">
          <div className="topbar__heading">
            <button
              type="button"
              className="menu-button"
              onClick={() => setMenuOpen(true)}
              aria-label="Open navigation"
            >
              <Menu size={21} />
            </button>

            <div>
              <span>{roleLabels[user.role]}</span>
              <h1>{pageTitle}</h1>
            </div>
          </div>

          <div className="topbar__actions">
            <div className="topbar__trust">
              <ShieldCheck size={17} />
              <span>Secure session</span>
            </div>

            <div className="avatar avatar--small">{initials}</div>
          </div>
        </header>

        <main className="shell__content">
          <Outlet />
        </main>
      </section>
    </div>
  );
}
