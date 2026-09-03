import { useCallback, useEffect, useState } from "react";
import { isAxiosError } from "axios";
import { useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  HeartPulse,
  LoaderCircle,
  Pill,
  RefreshCw,
  Stethoscope
} from "lucide-react";

import { getPatientDashboard, type PatientDashboardData } from "../../api/patientPortalApi";

import "./PatientDashboardPage.css";

const dateFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium"
});

function errorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const body = error.response?.data as
      | {
          error?: {
            message?: string;
          };
        }
      | undefined;

    return body?.error?.message ?? "Your health summary could not be loaded.";
  }

  return "Your health summary could not be loaded.";
}

function readable(value: string): string {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function displayDate(value: string | null): string {
  if (!value) {
    return "Not available";
  }

  return dateFormat.format(new Date(value));
}

type HealthSection = "prescriptions" | "encounters" | "allergies" | "conditions" | "appointments";
const healthSections: HealthSection[] = [
  "prescriptions",
  "encounters",
  "allergies",
  "conditions",
  "appointments"
];

export function PatientDashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<PatientDashboardData | null>(null);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  const [expandedEncounterId, setExpandedEncounterId] = useState<number | null>(null);

  const requestedSection = searchParams.get("section");
  const activeSection: HealthSection = healthSections.includes(requestedSection as HealthSection)
    ? (requestedSection as HealthSection)
    : "prescriptions";

  function selectSection(section: HealthSection): void {
    setSearchParams({ section });
    setExpandedEncounterId(null);
  }

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      const dashboard = await getPatientDashboard();

      setData(dashboard);
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
        if (!cancelled) {
          setData(dashboard);
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(errorMessage(loadError));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="patient-state" role="status" aria-live="polite">
        <LoaderCircle className="spin" />
        Loading your health summary…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="patient-state patient-state--error" role="alert">
        <AlertCircle />

        <span>{error ?? "Patient information is unavailable."}</span>

        <button type="button" onClick={() => void load()}>
          <RefreshCw size={16} />
          Try again
        </button>
      </div>
    );
  }

  const firstName = data.patient.firstName;

  return (
    <div className="patient-dashboard">
      <section className="patient-welcome">
        <div>
          <span>PATIENT PORTAL</span>

          <h2>Hello, {firstName}!</h2>

          <p>Choose and inspect one category to view your health information in detail.</p>
        </div>

        <div>
          <small>Patient number</small>

          <strong>{data.patient.patientNumber}</strong>
        </div>
      </section>

      <section className="patient-section-nav" aria-label="Health record sections" role="tablist">
        <button
          role="tab"
          aria-selected={activeSection === "prescriptions"}
          className={`patient-section-nav--purple ${activeSection === "prescriptions" ? "active" : ""}`}
          onClick={() => selectSection("prescriptions")}
        >
          <Pill />
          <span>Prescriptions</span>
        </button>
        <button
          role="tab"
          aria-selected={activeSection === "encounters"}
          className={`patient-section-nav--violet ${activeSection === "encounters" ? "active" : ""}`}
          onClick={() => selectSection("encounters")}
        >
          <Stethoscope />
          <span>Encounters</span>
        </button>
        <button
          role="tab"
          aria-selected={activeSection === "allergies"}
          className={`patient-section-nav--red ${activeSection === "allergies" ? "active" : ""}`}
          onClick={() => selectSection("allergies")}
        >
          <AlertCircle />
          <span>Allergies</span>
        </button>
        <button
          role="tab"
          aria-selected={activeSection === "conditions"}
          className={`patient-section-nav--green ${activeSection === "conditions" ? "active" : ""}`}
          onClick={() => selectSection("conditions")}
        >
          <HeartPulse />
          <span>Conditions</span>
        </button>
        <button
          role="tab"
          aria-selected={activeSection === "appointments"}
          className={`patient-section-nav--blue ${activeSection === "appointments" ? "active" : ""}`}
          onClick={() => selectSection("appointments")}
        >
          <CalendarDays />
          <span>Appointments</span>
        </button>
      </section>

      {(activeSection === "prescriptions" || activeSection === "encounters") && (
        <section className="patient-content-grid">
          {activeSection === "prescriptions" && (
            <article
              id="patient-prescriptions"
              className="patient-panel patient-panel--prescriptions"
            >
              <header>
                <div>
                  <span>MEDICATION</span>

                  <h3>Recent prescriptions</h3>
                </div>

                <Pill size={20} />
              </header>

              {data.recentPrescriptions.length === 0 ? (
                <Empty text="No prescriptions are available yet." />
              ) : (
                <div className="prescription-list">
                  {data.recentPrescriptions.map((prescription) => (
                    <section className="prescription-card" key={prescription.id}>
                      <div className="prescription-card__head">
                        <div>
                          <strong>{prescription.prescriptionNumber}</strong>

                          <small>
                            {displayDate(prescription.issuedAt)}
                            {" · "}
                            Dr. {prescription.doctorName}
                          </small>
                        </div>

                        <span
                          className={`rx-status rx-status--${prescription.status.toLowerCase()}`}
                        >
                          {readable(prescription.status)}
                        </span>
                      </div>

                      <div className="medication-lines">
                        {prescription.items.map((item) => (
                          <div key={item.id}>
                            <span>
                              <strong>
                                {item.medicationName} {item.strength}
                              </strong>

                              <small>{item.dosageForm}</small>
                            </span>

                            <p>
                              {item.frequencyText}

                              {` · ${item.quantityPrescribed} ${item.quantityUnit}`}

                              {item.instructions ? ` · ${item.instructions}` : ""}
                            </p>
                          </div>
                        ))}
                      </div>

                      {prescription.clinicalReason && (
                        <p className="prescription-reason">
                          <strong>Reason:</strong> {prescription.clinicalReason}
                        </p>
                      )}

                      <footer>
                        <span>{prescription.organizationName}</span>

                        {prescription.validUntil && (
                          <span>Valid until {displayDate(prescription.validUntil)}</span>
                        )}
                      </footer>
                    </section>
                  ))}
                </div>
              )}
            </article>
          )}

          {activeSection === "encounters" && (
            <article id="patient-encounters" className="patient-panel patient-panel--history">
              <header>
                <div>
                  <span>CARE HISTORY</span>

                  <h3>Recent encounters</h3>
                </div>

                <Stethoscope size={20} />
              </header>

              {data.recentEncounters.length === 0 ? (
                <Empty text="No encounters have been recorded." />
              ) : (
                <div className="compact-list">
                  {data.recentEncounters.map((encounter) => (
                    <section className="encounter-item" key={encounter.id}>
                      <button
                        type="button"
                        className="encounter-summary"
                        aria-expanded={expandedEncounterId === encounter.id}
                        onClick={() =>
                          setExpandedEncounterId(
                            expandedEncounterId === encounter.id ? null : encounter.id
                          )
                        }
                      >
                        <span className="compact-list__icon">
                          <ClipboardList size={16} />
                        </span>
                        <span className="encounter-summary__text">
                          <strong>
                            {encounter.chiefComplaint || readable(encounter.encounterType)}
                          </strong>
                          <small>
                            {displayDate(encounter.startedAt)} · Dr. {encounter.doctorName}
                          </small>
                          <small>{encounter.organizationName}</small>
                        </span>
                        {expandedEncounterId === encounter.id ? (
                          <ChevronDown size={16} />
                        ) : (
                          <ChevronRight size={16} />
                        )}
                      </button>

                      {expandedEncounterId === encounter.id && (
                        <div className="encounter-details">
                          <Detail label="Type" value={readable(encounter.encounterType)} />
                          <Detail label="Symptoms" value={encounter.symptoms} />
                          <Detail
                            label="Examination findings"
                            value={encounter.examinationFindings}
                          />
                          <Detail label="Assessment" value={encounter.assessmentSummary} />
                          <Detail label="Plan" value={encounter.planSummary} />
                        </div>
                      )}
                    </section>
                  ))}
                </div>
              )}
            </article>
          )}
        </section>
      )}

      {(activeSection === "allergies" ||
        activeSection === "conditions" ||
        activeSection === "appointments") && (
        <section className="patient-details-grid">
          {activeSection === "allergies" && (
            <article id="patient-allergies" className="patient-panel patient-detail-panel">
              <header>
                <div>
                  <span>SAFETY</span>
                  <h3>Active allergies</h3>
                </div>
                <AlertCircle size={20} />
              </header>
              {data.activeAllergies.length === 0 ? (
                <Empty text="No active allergies are recorded." />
              ) : (
                <div className="health-record-list">
                  {data.activeAllergies.map((allergy) => (
                    <section key={allergy.id}>
                      <div>
                        <strong>{allergy.substance}</strong>
                        <span>{readable(allergy.severity)}</span>
                      </div>
                      <p>
                        {readable(allergy.category)}
                        {allergy.reactionDescription
                          ? ` · Reaction: ${allergy.reactionDescription}`
                          : ""}
                      </p>
                      {allergy.notes && <p>{allergy.notes}</p>}
                      <small>
                        Recorded {displayDate(allergy.recordedAt)} by Dr. {allergy.doctorName}
                      </small>
                    </section>
                  ))}
                </div>
              )}
            </article>
          )}

          {activeSection === "conditions" && (
            <article id="patient-conditions" className="patient-panel patient-detail-panel">
              <header>
                <div>
                  <span>HEALTH</span>
                  <h3>Active conditions</h3>
                </div>
                <HeartPulse size={20} />
              </header>
              {data.activeConditions.length === 0 ? (
                <Empty text="No active conditions are recorded." />
              ) : (
                <div className="health-record-list">
                  {data.activeConditions.map((condition) => (
                    <section key={condition.id}>
                      <div>
                        <strong>{condition.conditionName}</strong>
                        <span>{readable(condition.severity)}</span>
                      </div>
                      <p>
                        {readable(condition.category)}
                        {condition.onsetDate ? ` · Since ${displayDate(condition.onsetDate)}` : ""}
                      </p>
                      {condition.notes && <p>{condition.notes}</p>}
                      <small>
                        Recorded {displayDate(condition.diagnosedAt)} by Dr. {condition.doctorName}
                      </small>
                    </section>
                  ))}
                </div>
              )}
            </article>
          )}

          {activeSection === "appointments" && (
            <article id="patient-appointments" className="patient-panel patient-detail-panel">
              <header>
                <div>
                  <span>SCHEDULE</span>
                  <h3>Upcoming appointments</h3>
                </div>
                <CalendarDays size={20} />
              </header>
              {data.upcomingAppointments.length === 0 ? (
                <Empty text="No upcoming appointments are scheduled." />
              ) : (
                <div className="health-record-list">
                  {data.upcomingAppointments.map((appointment) => (
                    <section key={appointment.id}>
                      <div>
                        <strong>
                          {appointment.reason || readable(appointment.appointmentType)}
                        </strong>
                        <span>{readable(appointment.status)}</span>
                      </div>
                      <p>
                        {displayDate(appointment.scheduledStart)} · {appointment.organizationName}
                      </p>
                      <small>
                        With {appointment.practitionerName} · {appointment.appointmentNumber}
                      </small>
                    </section>
                  ))}
                </div>
              )}
            </article>
          )}
        </section>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <strong>{label}</strong>
      <p>{value || "Not recorded"}</p>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="patient-empty">{text}</div>;
}
