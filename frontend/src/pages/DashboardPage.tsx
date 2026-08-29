import {
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileHeart,
  Pill,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
  Users
} from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import type { UserRole } from "../auth/types";
import "./DashboardPage.css";

const copy: Record<UserRole, { eyebrow: string; title: string; note: string }> = {
  ADMIN: { eyebrow: "SYSTEM CONTROL", title: "Good governance starts with a clear view.", note: "Manage account access, professional identities, and role assignments from one secure workspace." },
  DOCTOR: { eyebrow: "CLINICAL WORKSPACE", title: "Care decisions, without the digital clutter.", note: "Your authentication workspace is ready. Patient records and encounters arrive in the next clinical module." },
  PHARMACIST: { eyebrow: "PHARMACY WORKSPACE", title: "Safer dispensing begins with trusted access.", note: "Your secure workspace is ready. Prescription lookup and dispensing arrive in the next pharmacy module." },
  PATIENT: { eyebrow: "MY HEALTH", title: "Your care story, gathered in one place.", note: "Your secure patient account is active. Health records and prescriptions arrive in the next portal module." }
};

export function DashboardPage() {
  const { user } = useAuth();
  if (!user) return null;
  if (user.role === "PATIENT") return <Navigate to="/patient/dashboard" replace />;
  const content = copy[user.role];
  const firstName = (user.displayName ?? user.email).split(/[\s@]/)[0];

  return (
    <div className="dashboard">
      <section className="welcome-card">
        <div><span className="eyebrow">{content.eyebrow}</span><h2 className="display-font">Welcome back, {firstName}.</h2><p>{content.note}</p></div>
        <div className="welcome-card__art" aria-hidden="true"><span><FileHeart size={34} /></span><i /><i /></div>
      </section>

      <section className="stat-grid" aria-label="Workspace summary">
        <article><span className="stat-icon stat-icon--teal"><ShieldCheck /></span><div><small>Account status</small><strong>{user.status}</strong><p>Verified against the server</p></div></article>
        <article><span className="stat-icon stat-icon--blue"><UserRoundCheck /></span><div><small>Access role</small><strong>{user.role}</strong><p>Current permission profile</p></div></article>
        <article><span className="stat-icon stat-icon--amber"><Clock3 /></span><div><small>Session</small><strong>Protected</strong><p>Short-lived access token</p></div></article>
      </section>

      <section className="dashboard-grid">
        <article className="panel panel--feature"><span className="eyebrow">YOUR WORKSPACE</span><h3 className="display-font">{content.title}</h3><p>We built this foundation around your backend’s live authentication and role rules. Features only appear when the API exists to support them safely.</p>{user.role === "ADMIN" ? <Link className="primary-action" to="/admin/people">Open People Directory <ArrowUpRight size={17} /></Link> : <span className="soft-action"><Sparkles size={16} /> Clinical module coming next</span>}</article>
        <article className="panel"><div className="panel__title"><div><span className="eyebrow">SECURITY CHECK</span><h3>Account safeguards</h3></div><CheckCircle2 className="success-icon" /></div><ul className="check-list"><li><ShieldCheck size={17} /> Role verified on every protected request</li><li><Clock3 size={17} /> Sessions can be revoked across devices</li><li><FileHeart size={17} /> Sensitive tokens stay outside browser storage</li></ul></article>
      </section>

      <section className="module-strip">
        <div><span className="eyebrow">ROADMAP</span><h3 className="display-font">The care journey continues here</h3></div>
        <div className="module-strip__items"><span><Users /> Patient records</span><span><CalendarDays /> Encounters</span><span><Pill /> E-prescriptions</span></div>
      </section>
    </div>
  );
}
