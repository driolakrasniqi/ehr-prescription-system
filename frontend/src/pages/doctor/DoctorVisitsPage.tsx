import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { isAxiosError } from "axios";
import {
  AlertCircle,
  CalendarDays,
  LoaderCircle,
  RefreshCw,
  Search,
  UserRound
} from "lucide-react";
import { getDoctorVisits, type DoctorVisit } from "../../api/doctorApi";
import "./DoctorPatientsPage.css";
import "./DoctorVisitsPage.css";

function message(error: unknown): string {
  if (isAxiosError(error)) {
    const body = error.response?.data as { error?: { message?: string } } | undefined;
    return body?.error?.message ?? "Visits could not be loaded.";
  }
  return "Visits could not be loaded.";
}

function readable(value: string): string {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

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

export function DoctorVisitsPage() {
  const [visits, setVisits] = useState<DoctorVisit[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setVisits(await getDoctorVisits());
    } catch (loadError) {
      setError(message(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return visits;
    return visits.filter((visit) => {
      const haystack = [
        visit.patientName,
        visit.chiefComplaint,
        visit.encounterType,
        visit.organizationName,
        visit.encounterNumber,
        visit.status
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [search, visits]);

  if (loading) {
    return (
      <div className="doctor-state">
        <LoaderCircle className="spin" />
        Loading visits…
      </div>
    );
  }

  if (error && visits.length === 0) {
    return (
      <div className="doctor-state doctor-state--error">
        <AlertCircle />
        {error}
        <button type="button" onClick={() => void load()}>
          <RefreshCw size={16} />
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="doctor-page">
      <section className="doctor-hero">
        <div>
          <span>CLINICAL WORKSPACE</span>
          <h2>Visits</h2>
          <p>Every consultation you have recorded, newest first. Open a visit to see that patient’s record.</p>
        </div>
        <CalendarDays size={42} />
      </section>

      <section className="doctor-visits">
        <header>
          <div>
            <h3>Recorded visits</h3>
            <p>
              {visible.length} of {visits.length} shown
            </p>
          </div>
          <label className="doctor-visits__search">
            <Search size={16} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Filter by patient, complaint, or clinic"
              aria-label="Filter visits"
            />
          </label>
        </header>

        {visible.length === 0 ? (
          <p className="doctor-empty">{visits.length === 0 ? "No visits recorded yet." : "No visits match this filter."}</p>
        ) : (
          <ul className="doctor-visit-list">
            {visible.map((visit) => (
              <li key={visit.id}>
                <Link className="doctor-visit-row" to={`/doctor/patients?patient=${visit.patientId}`}>
                  <span className="doctor-visit-row__mark">
                    <UserRound size={16} />
                  </span>
                  <div>
                    <strong>{visit.patientName}</strong>
                    <small>{visit.chiefComplaint || readable(visit.encounterType)}</small>
                  </div>
                  <div className="doctor-visit-row__meta">
                    <em>{visit.organizationName}</em>
                    <small>{formatClock(visit.startedAt)}</small>
                    <span>{readable(visit.status)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
