import {
  AlertCircle,
  ArrowUpRight,
  Building2,
  CalendarDays,
  HeartPulse,
  LoaderCircle,
  Pill,
  ShieldCheck,
  Stethoscope,
  Store,
  UserRound,
  Users
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { getAdminOverview, type AdminOverview } from "../api/adminApi";
import { getDoctorOverview, type DoctorOverview } from "../api/doctorApi";
import { getPharmacistOverview, type PharmacistOverview } from "../api/pharmacistApi";
import { getPatientDashboard, type PatientDashboardData } from "../api/patientPortalApi";
import { useAuth } from "../auth/AuthContext";
import "./DashboardPage.css";

function formatClock(value: string | null | undefined): string {
  if (!value) return "—";
  const naive = value.replace(" ", "T").replace(/Z$/, "").slice(0, 19);
  const date = new Date(naive);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: false
  });
}

function formatDateOnly(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { dateStyle: "medium" });
}

function readable(value: string): string {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function DashboardPage() {
  const { user } = useAuth();
  if (!user) return null;
  if (user.role === "DOCTOR") return <DoctorOverviewPage />;
  if (user.role === "PATIENT") return <PatientOverviewPage />;
  if (user.role === "PHARMACIST") return <PharmacistOverviewPage />;
  return <AdminOverviewPage />;
}

function DoctorOverviewPage() {
  const [data, setData] = useState<DoctorOverview | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void getDoctorOverview()
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

  const name = data ? `${data.profile.firstName} ${data.profile.lastName}` : "Doctor";

  return (
    <div className="dashboard">
      <WelcomeCard
        tone="doctor"
        eyebrow="Clinical workspace"
        title={`Welcome back, ${data?.profile.firstName ?? "Doctor"}.`}
        note="Your latest visits in the clinic."
        icon={<Stethoscope size={26} />}
      />
      {failed ? (
        <LoadError text="Your clinical overview could not be loaded." />
      ) : !data ? (
        <LoadingState text="Loading your workspace…" />
      ) : (
        <>
          <section className="stat-grid">
            <StatCard
              icon={<Users />}
              tone="teal"
              label="Patients seen"
              value={data.patientCount}
              to="/doctor/patients"
            />
            <StatCard
              icon={<CalendarDays />}
              tone="blue"
              label="Visits recorded"
              value={data.visitCount}
              to="/doctor/visits"
            />
            <StatCard
              icon={<Pill />}
              tone="amber"
              label="Prescriptions"
              value={data.prescriptionCount}
              to="/doctor/patients"
            />
          </section>
          <article className="profile-card">
            <div className="profile-card__identity">
              <span>{initials(name)}</span>
              <div>
                <small>Doctor profile</small>
                <h3>Dr. {name}</h3>
                <p>{data.profile.specialty || "General practice"}</p>
              </div>
            </div>
            <dl className="profile-facts">
              <div>
                <dt>Licence</dt>
                <dd>{data.profile.licenseNumber}</dd>
              </div>
              <div>
                <dt>Practitioner no.</dt>
                <dd>{data.profile.practitionerNumber}</dd>
              </div>
              <div>
                <dt>Phone</dt>
                <dd>{data.profile.phone || "—"}</dd>
              </div>
              <div>
                <dt>Clinic</dt>
                <dd>{data.profile.clinics.join(", ") || "—"}</dd>
              </div>
            </dl>
          </article>
          <VisitPanel
            title="Latest visits"
            empty="No visits recorded yet."
            action={{ to: "/doctor/visits", label: "Open visits" }}
            rows={data.recentVisits.map((visit) => ({
              id: visit.id,
              title: visit.patientName,
              detail: visit.chiefComplaint || readable(visit.encounterType),
              meta: `${visit.organizationName} · ${formatClock(visit.startedAt)}`,
              to: `/doctor/patients?patient=${visit.patientId}`
            }))}
          />
        </>
      )}
    </div>
  );
}

function PatientOverviewPage() {
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

  const patient = data?.patient;
  const name = patient ? `${patient.firstName} ${patient.lastName}` : "Patient";

  return (
    <div className="dashboard">
      <WelcomeCard
        tone="patient"
        eyebrow="My health"
        title={`Welcome back, ${patient?.firstName ?? "there"}.`}
        note="Your personal details and the latest visits recorded by your care team."
        icon={<HeartPulse size={26} />}
      />
      {failed ? (
        <LoadError text="Your health summary could not be loaded." />
      ) : !data || !patient ? (
        <LoadingState text="Loading your health summary…" />
      ) : (
        <>
          <section className="stat-grid">
            <StatCard icon={<Pill />} tone="teal" label="Prescriptions" value={data.summary.activePrescriptions} />
            <StatCard icon={<AlertCircle />} tone="amber" label="Allergies" value={data.summary.activeAllergies} />
            <StatCard icon={<HeartPulse />} tone="blue" label="Conditions" value={data.summary.activeConditions} />
          </section>
          <article className="profile-card">
            <div className="profile-card__identity">
              <span>{initials(name)}</span>
              <div>
                <small>Patient profile</small>
                <h3>{name}</h3>
                <p>{patient.patientNumber}</p>
              </div>
            </div>
            <dl className="profile-facts">
              <div>
                <dt>Date of birth</dt>
                <dd>{formatDateOnly(patient.dateOfBirth)}</dd>
              </div>
              <div>
                <dt>Sex</dt>
                <dd>{readable(patient.sex)}</dd>
              </div>
              <div>
                <dt>Blood type</dt>
                <dd>{patient.bloodType === "UNKNOWN" ? "—" : patient.bloodType}</dd>
              </div>
              <div>
                <dt>Record</dt>
                <dd>{patient.patientNumber}</dd>
              </div>
            </dl>
          </article>
          <VisitPanel
            title="Latest visits"
            empty="No visits have been recorded yet."
            action={{ to: "/patient", label: "My health" }}
            rows={data.recentEncounters.map((visit) => ({
              id: visit.id,
              title: visit.chiefComplaint || readable(visit.encounterType),
              detail: `Dr. ${visit.doctorName}`,
              meta: `${visit.organizationName} · ${formatClock(visit.startedAt)}`
            }))}
          />
        </>
      )}
    </div>
  );
}

function PharmacistOverviewPage() {
  const [data, setData] = useState<PharmacistOverview | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void getPharmacistOverview()
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

  const name = data ? `${data.profile.firstName} ${data.profile.lastName}` : "Pharmacist";

  return (
    <div className="dashboard">
      <WelcomeCard
        tone="pharmacist"
        eyebrow="Pharmacy workspace"
        title={`Welcome back, ${data?.profile.firstName ?? "Pharmacist"}.`}
        note="Look up a patient by name or number to see the medicines prescribed by the doctor."
        icon={<Pill size={26} />}
      />
      {failed ? (
        <LoadError text="Your pharmacy overview could not be loaded." />
      ) : !data ? (
        <LoadingState text="Loading your pharmacy workspace…" />
      ) : (
        <>
          <section className="stat-grid">
            <StatCard icon={<UserRound />} tone="teal" label="Patients with prescriptions" value={data.patientCount} />
            <StatCard icon={<Pill />} tone="blue" label="Prescriptions" value={data.prescriptionCount} />
            <StatCard icon={<Building2 />} tone="amber" label="Pharmacies" value={data.profile.pharmacies.length} />
          </section>
          <article className="profile-card">
            <div className="profile-card__identity">
              <span>{initials(name)}</span>
              <div>
                <small>Pharmacist profile</small>
                <h3>{name}</h3>
                <p>{data.profile.pharmacies.join(", ") || "Pharmacy"}</p>
              </div>
            </div>
            <dl className="profile-facts">
              <div>
                <dt>Licence</dt>
                <dd>{data.profile.licenseNumber}</dd>
              </div>
              <div>
                <dt>Practitioner no.</dt>
                <dd>{data.profile.practitionerNumber}</dd>
              </div>
              <div>
                <dt>Phone</dt>
                <dd>{data.profile.phone || "—"}</dd>
              </div>
              <div>
                <dt>Pharmacy</dt>
                <dd>{data.profile.pharmacies.join(", ") || "—"}</dd>
              </div>
            </dl>
          </article>
          <VisitPanel
            title="Latest prescriptions"
            empty="No prescriptions have been recorded yet."
            action={{ to: "/pharmacist/patients", label: "Find patient" }}
            rows={data.recentPrescriptions.map((item) => ({
              id: item.id,
              title: item.patientName,
              detail: item.medicationName
                ? `${item.medicationName}${item.quantity ? ` · ${item.quantity}` : ""}`
                : item.prescriptionNumber,
              meta: formatClock(item.issuedAt),
              to: `/pharmacist/patients?patient=${item.patientId}`
            }))}
          />
        </>
      )}
    </div>
  );
}

function AdminOverviewPage() {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void getAdminOverview()
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

  return (
    <div className="dashboard">
      <WelcomeCard
        tone="admin"
        eyebrow="System overview"
        title="A clear view of the care network."
        note="People, clinics, pharmacies, and the latest account or clinical changes."
        icon={<ShieldCheck size={26} />}
      />
      {failed ? (
        <LoadError text="The system overview could not be loaded." />
      ) : !data ? (
        <LoadingState text="Loading system overview…" />
      ) : (
        <>
          <section className="stat-grid">
            <StatCard icon={<Stethoscope />} tone="teal" label="Doctors" value={data.stats.doctors} />
            <StatCard icon={<Pill />} tone="blue" label="Pharmacists" value={data.stats.pharmacists} />
            <StatCard icon={<Users />} tone="amber" label="Patients" value={data.stats.patients} />
            <StatCard icon={<Building2 />} tone="teal" label="Clinics" value={data.stats.clinics} />
            <StatCard icon={<Store />} tone="blue" label="Pharmacies" value={data.stats.pharmacies} />
            <StatCard icon={<ShieldCheck />} tone="amber" label="Administrators" value={data.stats.admins} />
          </section>
          <VisitPanel
            title="Recent tracking"
            empty="No tracked changes yet."
            action={{ to: "/admin/activity", label: "Open tracking" }}
            rows={data.recentActivity.map((item) => ({
              id: item.id,
              title: item.actorName,
              detail: item.summary,
              meta: `${item.targetName} · ${formatClock(item.eventAt)}`
            }))}
          />
        </>
      )}
    </div>
  );
}

function WelcomeCard({
  eyebrow,
  title,
  note,
  icon,
  tone = "doctor",
  profile
}: {
  eyebrow: string;
  title: string;
  note: string;
  icon: ReactNode;
  tone?: "doctor" | "pharmacist" | "admin" | "patient";
  profile?: ReactNode;
}) {
  return (
    <section className={`welcome-card welcome-card--${tone}`}>
      <div className="welcome-card__intro">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h2>{title}</h2>
          <p>{note}</p>
        </div>
        <div className="welcome-card__art" aria-hidden="true">
          <span>{icon}</span>
        </div>
      </div>
      {profile ? <div className="welcome-card__profile">{profile}</div> : null}
    </section>
  );
}

function StatCard({
  icon,
  tone,
  label,
  value,
  to
}: {
  icon: ReactNode;
  tone: "teal" | "blue" | "amber";
  label: string;
  value: number;
  to?: string;
}) {
  const body = (
    <>
      <span className={`stat-icon stat-icon--${tone}`}>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
    </>
  );
  if (to?.startsWith("#")) {
    return (
      <a className="stat-card-link" href={to}>
        {body}
      </a>
    );
  }
  return to ? (
    <Link className="stat-card-link" to={to}>
      {body}
    </Link>
  ) : (
    <article>{body}</article>
  );
}

function VisitPanel({
  title,
  empty,
  action,
  rows
}: {
  title: string;
  empty: string;
  action: { to: string; label: string };
  rows: Array<{ id: number; title: string; detail: string; meta: string; to?: string }>;
}) {
  return (
    <section className="panel visit-panel">
      <div className="panel__title">
        <div>
          <h3>
            <Link to={action.to}>{title}</Link>
          </h3>
        </div>
        <Link className="soft-action" to={action.to}>
          {action.label} <ArrowUpRight size={16} />
        </Link>
      </div>
      {rows.length === 0 ? (
        <p>{empty}</p>
      ) : (
        <ul className="visit-list">
          {rows.map((row) => {
            const body = (
              <>
                <span className="visit-list__mark">
                  <UserRound size={16} />
                </span>
                <div>
                  <strong>{row.title}</strong>
                  <small>{row.detail}</small>
                </div>
                <em>{row.meta}</em>
              </>
            );
            return (
              <li key={row.id}>
                {row.to ? (
                  <Link className="visit-list__row" to={row.to}>
                    {body}
                  </Link>
                ) : (
                  <div className="visit-list__row">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function LoadingState({ text }: { text: string }) {
  return (
    <div className="overview-loading">
      <LoaderCircle className="spin" size={18} />
      {text}
    </div>
  );
}

function LoadError({ text }: { text: string }) {
  return (
    <div className="overview-error">
      <AlertCircle size={18} />
      {text}
    </div>
  );
}
