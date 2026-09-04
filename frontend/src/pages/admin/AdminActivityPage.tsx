import { useCallback, useEffect, useMemo, useState } from "react";
import { isAxiosError } from "axios";
import {
  AlertCircle,
  History,
  LoaderCircle,
  RefreshCw,
  Search,
  Stethoscope,
  Users
} from "lucide-react";

import {
  getActivity,
  type ActivityEvent,
  type LatestDoctorUpdate,
  type LatestPersonUpdate
} from "../../api/adminApi";

import "./AdminActivityPage.css";

type ActivityTab = "ACCOUNTS" | "DOCTORS";

function message(error: unknown): string {
  if (isAxiosError(error)) {
    const data = error.response?.data as { error?: { message?: string } };
    return data?.error?.message ?? "The request failed.";
  }
  return "The request failed.";
}

function formatWhen(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function matchesQuery(values: Array<string | null | undefined>, needle: string): boolean {
  if (!needle) {
    return true;
  }
  return values
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(needle);
}

export function AdminActivityPage() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [latestByPerson, setLatestByPerson] = useState<LatestPersonUpdate[]>([]);
  const [latestByDoctor, setLatestByDoctor] = useState<LatestDoctorUpdate[]>([]);
  const [tab, setTab] = useState<ActivityTab>("ACCOUNTS");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getActivity();
      setEvents(data.events);
      setLatestByPerson(data.latestByPerson);
      setLatestByDoctor(data.latestByDoctor ?? []);
    } catch (loadError) {
      setError(message(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const needle = query.trim().toLowerCase();

  const filteredPeople = useMemo(
    () =>
      latestByPerson.filter((row) =>
        matchesQuery([row.personName, row.updatedBy, row.updatedByEmail, row.change], needle)
      ),
    [latestByPerson, needle]
  );

  const filteredDoctors = useMemo(
    () =>
      latestByDoctor.filter((row) =>
        matchesQuery([row.doctorName, row.doctorEmail, row.patientName, row.change], needle)
      ),
    [latestByDoctor, needle]
  );

  const filteredEvents = useMemo(() => {
    const category = tab === "DOCTORS" ? "CLINICAL" : "ACCOUNT";
    return events.filter(
      (row) =>
        row.category === category &&
        matchesQuery([row.actorName, row.actorEmail, row.targetName, row.summary, row.action], needle)
    );
  }, [events, needle, tab]);

  const clinicalCount = events.filter((row) => row.category === "CLINICAL").length;
  const accountCount = events.filter((row) => row.category === "ACCOUNT").length;

  return (
    <div className="activity-page">
      <section className="activity-hero">
        <div>
          <span>TRACKING</span>
          <h2>Who changed what, and when.</h2>
          <p>
            Follow account changes and clinical work by doctors: visits, conditions, allergies,
            and prescriptions.
          </p>
        </div>
        <History />
      </section>

      {error && (
        <div className="activity-notice activity-notice--error">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      <div className="activity-toolbar">
        <div className="activity-tabs">
          <button
            type="button"
            className={tab === "ACCOUNTS" ? "active" : undefined}
            onClick={() => setTab("ACCOUNTS")}
          >
            <Users size={15} />
            Accounts
            <span>{accountCount}</span>
          </button>
          <button
            type="button"
            className={tab === "DOCTORS" ? "active" : undefined}
            onClick={() => setTab("DOCTORS")}
          >
            <Stethoscope size={15} />
            Doctors
            <span>{clinicalCount}</span>
          </button>
        </div>
        <div className="activity-tools">
          <label>
            <Search size={15} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={tab === "DOCTORS" ? "Search doctors or patients" : "Search people or changes"}
            />
          </label>
          <button type="button" onClick={() => void load()} aria-label="Refresh">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      <section className="activity-panel">
        <header>
          <div>
            <h3>{tab === "DOCTORS" ? "Clinical timeline" : "Activity timeline"}</h3>
            <p>
              {tab === "DOCTORS"
                ? "Visits, conditions, allergies, and prescriptions, newest first."
                : "Recent account and organization changes, newest first."}
            </p>
          </div>
        </header>

        {loading ? (
          <div className="activity-state">
            <LoaderCircle size={18} className="spin" />
            Loading activity…
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="activity-state">No activity matches this search.</div>
        ) : (
          <div className="activity-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{tab === "DOCTORS" ? "Doctor" : "Updated by"}</th>
                  <th>{tab === "DOCTORS" ? "Patient" : "Record"}</th>
                  <th>What changed</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {filteredEvents.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.actorName}</strong>
                      {row.actorEmail && <small>{row.actorEmail}</small>}
                    </td>
                    <td>
                      <strong>{row.targetName}</strong>
                      <small>{row.recordKind}</small>
                    </td>
                    <td>{row.summary}</td>
                    <td>{formatWhen(row.eventAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {tab === "ACCOUNTS" ? (
        <section className="activity-panel">
          <header>
            <div>
              <h3>Last update by person</h3>
              <p>The most recent change recorded for each account.</p>
            </div>
          </header>
          {loading ? (
            <div className="activity-state">
              <LoaderCircle size={18} className="spin" />
              Loading activity…
            </div>
          ) : filteredPeople.length === 0 ? (
            <div className="activity-state">No person updates match this search.</div>
          ) : (
            <div className="activity-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Person</th>
                    <th>Last updated by</th>
                    <th>What changed</th>
                    <th>When</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPeople.map((row) => (
                    <tr key={row.entityId}>
                      <td>
                        <strong>{row.personName}</strong>
                      </td>
                      <td>
                        <strong>{row.updatedBy}</strong>
                        {row.updatedByEmail && <small>{row.updatedByEmail}</small>}
                      </td>
                      <td>{row.change}</td>
                      <td>{formatWhen(row.lastUpdatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <section className="activity-panel">
          <header>
            <div>
              <h3>Last activity by doctor</h3>
              <p>The most recent clinical update recorded for each doctor.</p>
            </div>
          </header>
          {loading ? (
            <div className="activity-state">
              <LoaderCircle size={18} className="spin" />
              Loading activity…
            </div>
          ) : filteredDoctors.length === 0 ? (
            <div className="activity-state">No doctor activity matches this search.</div>
          ) : (
            <div className="activity-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Doctor</th>
                    <th>Patient</th>
                    <th>What changed</th>
                    <th>When</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDoctors.map((row) => (
                    <tr key={row.actorUserId}>
                      <td>
                        <strong>{row.doctorName}</strong>
                        {row.doctorEmail && <small>{row.doctorEmail}</small>}
                      </td>
                      <td>
                        <strong>{row.patientName}</strong>
                      </td>
                      <td>{row.change}</td>
                      <td>{formatWhen(row.lastUpdatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
