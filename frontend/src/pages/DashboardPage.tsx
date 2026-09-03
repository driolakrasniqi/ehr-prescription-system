import {
  AlertCircle,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileHeart,
  HeartPulse,
  Pill,
  ShieldCheck,
  UserRoundCheck,
  Users
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import type { UserRole } from "../auth/types";
import { getPatientDashboard, type PatientDashboardData } from "../api/patientPortalApi";
import "./DashboardPage.css";

const copy: Record<UserRole, { eyebrow: string; title: string; note: string }> = {
  ADMIN: {
    eyebrow: "SYSTEM CONTROL",
    title: "Good governance starts with a clear view.",
    note: "Manage account access, professional identities, and role assignments from one secure workspace."
  },
  DOCTOR: {
    eyebrow: "CLINICAL WORKSPACE",
    title: "Care decisions, without the digital clutter.",
    note: "Review patient records and record essential clinical information from your secure workspace."
  },
  PHARMACIST: {
    eyebrow: "PHARMACY WORKSPACE",
    title: "Safer dispensing begins with trusted access.",
    note: "Your secure workspace is ready. Prescription lookup and dispensing arrive in the next pharmacy module."
  },
  PATIENT: {
    eyebrow: "MY HEALTH",
    title: "Your care story, gathered in one place.",
    note: "Your secure patient account is active. Review your personal profile and available health records from the patient portal."
  }
};

const workspaceActions: Partial<Record<UserRole, { label: string; to: string }>> = {
  ADMIN: { label: "People Directory", to: "/admin/people" },
  DOCTOR: { label: "Patients", to: "/doctor/patients" },
  PATIENT: { label: "My health", to: "/patient" }
};

export function DashboardPage() {
  const { user } = useAuth();
  if (!user) return null;
  if (user.role === "PATIENT")
    return <PatientOverview firstName={(user.displayName ?? user.email).split(/[\s@]/)[0]} />;
  const content = copy[user.role];
  const workspaceAction = workspaceActions[user.role];
  const firstName = (user.displayName ?? user.email).split(/[\s@]/)[0];

  return (
    <div className="dashboard">
      <section className="welcome-card">
        <div>
          <span className="eyebrow">{content.eyebrow}</span>
          <h2 className="display-font">Welcome back, {firstName}.</h2>
          <p>{content.note}</p>
        </div>
        <div className="welcome-card__art" aria-hidden="true">
          <span>
            <FileHeart size={34} />
          </span>
          <i />
          <i />
        </div>
      </section>

      <section className="stat-grid" aria-label="Workspace summary">
        <article>
          <span className="stat-icon stat-icon--teal">
            <ShieldCheck />
          </span>
          <div>
            <small>Account status</small>
            <strong>{user.status}</strong>
            <p>Verified against the server</p>
          </div>
        </article>
        <article>
          <span className="stat-icon stat-icon--blue">
            <UserRoundCheck />
          </span>
          <div>
            <small>Access role</small>
            <strong>{user.role}</strong>
            <p>Current permission profile</p>
          </div>
        </article>
        <article>
          <span className="stat-icon stat-icon--amber">
            <Clock3 />
          </span>
          <div>
            <small>Session</small>
            <strong>Protected</strong>
            <p>Short-lived access token</p>
          </div>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="panel panel--feature">
          <span className="eyebrow">YOUR WORKSPACE</span>
          <h3 className="display-font">{content.title}</h3>
          <p>Open the workspace available for your role and continue with your assigned tasks.</p>
          {workspaceAction ? (
            <Link className="primary-action" to={workspaceAction.to}>
              {workspaceAction.label} <ArrowUpRight size={17} />
            </Link>
          ) : (
            <span className="soft-action">
              <Pill size={16} /> Pharmacy module coming next
            </span>
          )}
        </article>
        <article className="panel">
          <div className="panel__title">
            <div>
              <span className="eyebrow">SECURITY CHECK</span>
              <h3>Account safeguards</h3>
            </div>
            <CheckCircle2 className="success-icon" />
          </div>
          <ul className="check-list">
            <li>
              <ShieldCheck size={17} /> Role verified on every protected request
            </li>
            <li>
              <Clock3 size={17} /> Sessions can be revoked across devices
            </li>
            <li>
              <FileHeart size={17} /> Sensitive tokens stay outside browser storage
            </li>
          </ul>
        </article>
      </section>

      <section className="module-strip">
        <div>
          <span className="eyebrow">ROADMAP</span>
          <h3 className="display-font">The care journey continues here</h3>
        </div>
        <div className="module-strip__items">
          <span>
            <Users /> Patient records
          </span>
          <span>
            <CalendarDays /> Encounters
          </span>
          <span>
            <Pill /> E-prescriptions
          </span>
        </div>
      </section>
    </div>
  );
}

function PatientOverview({ firstName }: { firstName: string }) {
  const [data, setData] = useState<PatientDashboardData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void getPatientDashboard()
      .then((result) => {
        if (active) setData(result);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const latestPrescription = data?.recentPrescriptions[0];
  const latestEncounter = data?.recentEncounters[0];

  return (
    <div className="dashboard patient-overview">
      <section className="welcome-card">
        <div>
          <span className="eyebrow">MY HEALTH</span>
          <h2 className="display-font">Welcome back, {firstName}.</h2>
          <p>See the latest information recorded by your healthcare team.</p>
        </div>
        <div className="welcome-card__art" aria-hidden="true">
          <span>
            <FileHeart size={34} />
          </span>
          <i />
          <i />
        </div>
      </section>

      {failed ? (
        <div className="overview-error">
          <AlertCircle size={18} />
          Your health summary could not be loaded. Open My Health to try again.
        </div>
      ) : (
        <section className="patient-overview-stats" aria-label="Health summary">
          <OverviewStat
            section="prescriptions"
            tone="purple"
            icon={<Pill />}
            label="Active prescriptions"
            value={data?.summary.activePrescriptions}
          />
          <OverviewStat
            section="appointments"
            tone="blue"
            icon={<CalendarDays />}
            label="Upcoming appointments"
            value={data?.summary.upcomingAppointments}
          />
          <OverviewStat
            section="allergies"
            tone="red"
            icon={<AlertCircle />}
            label="Active allergies"
            value={data?.summary.activeAllergies}
          />
          <OverviewStat
            section="conditions"
            tone="green"
            icon={<HeartPulse />}
            label="Active conditions"
            value={data?.summary.activeConditions}
          />
        </section>
      )}

      <section className="dashboard-grid patient-overview-grid">
        <article className="panel panel--feature">
          <span className="eyebrow">YOUR HEALTH RECORD</span>
          <h3 className="display-font">Your care details, in one place.</h3>
          <p>Review prescriptions, encounters, allergies, conditions, and upcoming appointments.</p>
          <div className="overview-actions">
            <Link className="primary-action" to="/patient">
              My health <ArrowUpRight size={17} />
            </Link>
            <Link className="secondary-action" to="/patient/profile">
              My profile <ArrowUpRight size={17} />
            </Link>
          </div>
        </article>

        <article className="panel patient-activity">
          <div className="panel__title">
            <div>
              <span className="eyebrow">RECENT ACTIVITY</span>
              <h3>Latest records</h3>
            </div>
            <FileHeart className="success-icon" />
          </div>
          {!data ? (
            <p>Loading your latest records…</p>
          ) : !latestPrescription && !latestEncounter ? (
            <p>No clinical activity is available yet.</p>
          ) : (
            <div className="activity-list">
              {latestPrescription && (
                <div>
                  <span className="activity-icon activity-icon--purple">
                    <Pill />
                  </span>
                  <div>
                    <strong>
                      {latestPrescription.items[0]?.medicationName ||
                        latestPrescription.prescriptionNumber}
                    </strong>
                    <small>Prescription · Dr. {latestPrescription.doctorName}</small>
                  </div>
                </div>
              )}
              {latestEncounter && (
                <div>
                  <span className="activity-icon activity-icon--green">
                    <HeartPulse />
                  </span>
                  <div>
                    <strong>{latestEncounter.chiefComplaint || "Clinical encounter"}</strong>
                    <small>Encounter · Dr. {latestEncounter.doctorName}</small>
                  </div>
                </div>
              )}
            </div>
          )}
        </article>
      </section>
    </div>
  );
}

function OverviewStat({
  section,
  tone,
  icon,
  label,
  value
}: {
  section: string;
  tone: "purple" | "blue" | "red" | "green";
  icon: ReactNode;
  label: string;
  value: number | undefined;
}) {
  return (
    <Link to={`/patient?section=${section}`} className={`overview-stat overview-stat--${tone}`}>
      <span>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value ?? "—"}</strong>
        <p>View details</p>
      </div>
    </Link>
  );
}
