import { useCallback, useEffect, useState, type ReactNode } from "react";
import { isAxiosError } from "axios";
import {
  AlertCircle,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  HeartPulse,
  LoaderCircle,
  Pill,
  RefreshCw,
  Stethoscope
} from "lucide-react";
import {
  getPatientDashboard,
  type PatientDashboardData
} from "../../api/patientPortalApi.ts";
import "./PatientDashboardPage.css";

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium", timeStyle: "short"
});

function errorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const body = error.response?.data as { error?: { message?: string } } | undefined;
    return body?.error?.message ?? "Your health summary could not be loaded.";
  }
  return "Your health summary could not be loaded.";
}

function readable(value: string): string {
  return value.toLowerCase().replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function displayDate(value: string | null): string {
  return value ? dateFormat.format(new Date(value)) : "Not available";
}

export function PatientDashboardPage() {
  const [data, setData] = useState<PatientDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getPatientDashboard());
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    void getPatientDashboard()
      .then((dashboard) => {
        if (!cancelled) setData(dashboard);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(errorMessage(loadError));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <div className="patient-state"><LoaderCircle className="spin" />Loading your health summary…</div>;
  }

  if (error || !data) {
    return <div className="patient-state patient-state--error">
      <AlertCircle /> <span>{error ?? "Patient information is unavailable."}</span>
      <button type="button" onClick={() => void load()}><RefreshCw size={16} />Try again</button>
    </div>;
  }

  const firstName = data.patient.firstName;

  return <div className="patient-dashboard">
    <section className="patient-welcome">
      <div><span>PATIENT PORTAL</span><h2>Hello, {firstName}!</h2><p>Here is a current summary of your health information.</p></div>
      <div><small>Patient number</small><strong>{data.patient.patientNumber}</strong></div>
    </section>

    <section className="patient-summary" aria-label="Health summary">
      <SummaryCard icon={<Pill />} tone="purple" label="Active prescriptions" value={data.summary.activePrescriptions} />
      <SummaryCard icon={<CalendarDays />} tone="blue" label="Upcoming appointments" value={data.summary.upcomingAppointments} />
      <SummaryCard icon={<AlertCircle />} tone="red" label="Active allergies" value={data.summary.activeAllergies} />
      <SummaryCard icon={<HeartPulse />} tone="green" label="Active conditions" value={data.summary.activeConditions} />
    </section>

    <section className="patient-content-grid">
      <article className="patient-panel">
        <header><div><span>MEDICATION</span><h3>Recent prescriptions</h3></div><Pill size={20} /></header>
        {data.recentPrescriptions.length === 0 ? <Empty text="No prescriptions are available yet." /> :
          <div className="prescription-list">{data.recentPrescriptions.map((rx) =>
            <section className="prescription-card" key={rx.id}>
              <div className="prescription-card__head">
                <div><strong>{rx.prescriptionNumber}</strong><small>{displayDate(rx.issuedAt)} · Dr. {rx.doctorName}</small></div>
                <span className={`rx-status rx-status--${rx.status.toLowerCase()}`}>{readable(rx.status)}</span>
              </div>
              <div className="medication-lines">{rx.items.map((item) =>
                <div key={item.id}><span><strong>{item.medicationName} {item.strength}</strong><small>{item.dosageForm}</small></span><p>{item.frequencyText}{item.instructions ? ` · ${item.instructions}` : ""}</p></div>
              )}</div>
              <footer><span>{rx.organizationName}</span>{rx.validUntil && <span>Valid until {displayDate(rx.validUntil)}</span>}</footer>
            </section>
          )}</div>}
      </article>

      <div className="patient-side-stack">
        <article className="patient-panel">
          <header><div><span>CARE HISTORY</span><h3>Recent encounters</h3></div><Stethoscope size={20} /></header>
          {data.recentEncounters.length === 0 ? <Empty text="No encounters have been recorded." /> :
            <div className="compact-list">{data.recentEncounters.map((encounter) =>
              <div key={encounter.id}><span className="compact-list__icon"><ClipboardList size={16} /></span><div><strong>{encounter.chiefComplaint || readable(encounter.encounterType)}</strong><small>{displayDate(encounter.startedAt)} · Dr. {encounter.doctorName}</small></div><ChevronRight size={16} /></div>
            )}</div>}
        </article>

        <article className="patient-panel">
          <header><div><span>SCHEDULE</span><h3>Upcoming appointments</h3></div><CalendarDays size={20} /></header>
          {data.upcomingAppointments.length === 0 ? <Empty text="You have no upcoming appointments." /> :
            <div className="compact-list">{data.upcomingAppointments.map((appointment) =>
              <div key={appointment.id}><span className="compact-list__date"><strong>{new Date(appointment.scheduledStart).getDate()}</strong><small>{new Intl.DateTimeFormat(undefined, { month: "short" }).format(new Date(appointment.scheduledStart))}</small></span><div><strong>{appointment.reason || readable(appointment.appointmentType)}</strong><small>{dateTimeFormat.format(new Date(appointment.scheduledStart))} · {appointment.practitionerName}</small></div><ChevronRight size={16} /></div>
            )}</div>}
        </article>
      </div>
    </section>
  </div>;
}

function SummaryCard({ icon, tone, label, value }: { icon: ReactNode; tone: string; label: string; value: number }) {
  return <article className={`patient-summary-card patient-summary-card--${tone}`}><div><small>{label}</small><strong>{value}</strong><span>Current records</span></div><i>{icon}</i></article>;
}

function Empty({ text }: { text: string }) {
  return <div className="patient-empty">{text}</div>;
}
