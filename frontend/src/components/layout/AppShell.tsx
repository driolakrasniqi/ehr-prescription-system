import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Activity, Bell, Building2, HeartPulse, LayoutDashboard, LogOut, Menu, Settings, ShieldCheck, Stethoscope, Users, X } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import type { UserRole } from "../../auth/types";
import "./AppShell.css";

const roleLabels: Record<UserRole, string> = {
  ADMIN: "System administrator",
  DOCTOR: "Clinical workspace",
  PHARMACIST: "Pharmacy workspace",
  PATIENT: "Patient portal"
};

export function AppShell() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  if (!user) return null;

  const initials = (user.displayName ?? user.email).split(/\s|@/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
  const pageTitle = location.pathname === "/admin/people" ? "People Directory" : location.pathname === "/admin/organizations" ? "Clinics & Pharmacies" : location.pathname.startsWith("/admin") ? "People & Access" : location.pathname === "/settings" ? "Security settings" : user.role === "PATIENT" ? "My health summary" : "Today at a glance";

  async function handleLogout() {
    setLoggingOut(true);
    try { await logout(); } finally { setLoggingOut(false); }
  }

  return (
    <div className="shell">
      <aside className={`sidebar ${menuOpen ? "sidebar--open" : ""}`}>
        <div className="sidebar__brand"><span><HeartPulse size={24} /></span><div><strong>Cliniq</strong><small>Care, clearly connected</small></div></div>
        <button className="sidebar__close" onClick={() => setMenuOpen(false)} aria-label="Close navigation"><X size={20} /></button>
        <nav className="sidebar__nav" onClick={() => setMenuOpen(false)}>
          <p>Workspace</p>
          <NavLink to="/" end><LayoutDashboard size={19} /> Overview</NavLink>
          {user.role === "ADMIN" && <><NavLink to="/admin/people"><Users size={19} /> People Directory</NavLink><NavLink to="/admin/access"><ShieldCheck size={19} /> People & Access</NavLink><NavLink to="/admin/organizations"><Building2 size={19} /> Clinics &amp; Pharmacies</NavLink></>}
          {user.role === "DOCTOR" && <span className="sidebar__soon"><Stethoscope size={19} /> Patients <small>Next module</small></span>}
          {user.role === "PHARMACIST" && <span className="sidebar__soon"><Activity size={19} /> Prescriptions <small>Next module</small></span>}
          {user.role === "PATIENT" && <NavLink to="/patient/dashboard"><Activity size={19} /> My health</NavLink>}
          <p>Account</p>
          <NavLink to="/settings"><Settings size={19} /> Settings</NavLink>
        </nav>
        <div className="sidebar__profile">
          <div className="avatar">{initials}</div>
          <div><strong>{user.displayName ?? "Account"}</strong><small>{roleLabels[user.role]}</small></div>
          <button onClick={() => void handleLogout()} disabled={loggingOut} aria-label="Log out"><LogOut size={18} /></button>
        </div>
      </aside>
      {menuOpen && <button className="shell__scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
      <section className="shell__main">
        <header className="topbar">
          <div className="topbar__heading"><button className="menu-button" onClick={() => setMenuOpen(true)}><Menu size={21} /></button><div><span>{roleLabels[user.role]}</span><h1>{pageTitle}</h1></div></div>
          <div className="topbar__actions"><button aria-label="Notifications"><Bell size={19} /></button><div className="topbar__trust"><ShieldCheck size={17} /><span>Secure session</span></div><div className="avatar avatar--small">{initials}</div></div>
        </header>
        <main className="shell__content"><Outlet /></main>
      </section>
    </div>
  );
}
