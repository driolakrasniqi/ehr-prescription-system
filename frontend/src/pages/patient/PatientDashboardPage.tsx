import { useCallback, useEffect, useState } from "react";
import { isAxiosError } from "axios";
import { useSearchParams } from "react-router-dom";
import {
  AlertCircle,
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
import { PrescriptionSheet } from "../../components/PrescriptionSheet";

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

type HealthSection = "encounters" | "allergies" | "conditions" | "prescriptions";
const healthSections: HealthSection[] = [
  "encounters",
  "allergies",
  "conditions",
  "prescriptions"
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
    : "encounters";

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
          aria-selected={activeSection === "prescriptions"}
          className={`patient-section-nav--purple ${activeSection === "prescriptions" ? "active" : ""}`}
          onClick={() => selectSection("prescriptions")}
        >
          <Pill />
          <span>Prescriptions</span>
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
                <div className="patient-rx-sheets">
                  {data.recentPrescriptions.map((prescription) => (
                    <PrescriptionSheet
                      key={prescription.id}
                      patient={data.patient}
                      allergies={data.activeAllergies}
                      diagnoses={data.activeConditions}
                      prescription={{
                        prescriptionNumber: prescription.prescriptionNumber,
                        issuedAt: prescription.issuedAt,
                        validUntil: prescription.validUntil,
                        clinicalReason: prescription.clinicalReason,
                        notesToPharmacist: prescription.notesToPharmacist,
                        doctorName: prescription.doctorName,
                        clinicName: prescription.organizationName,
                        items: prescription.items
                      }}
                    />
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

      {(activeSection === "allergies" || activeSection === "conditions") && (
        <section className="patient-details-grid">
          {activeSection === "allergies" && (
            <article id="patient-allergies" className="patient-panel patient-detail-panel">
              <header>
                <div>
                  <span>SAFETY</span>
                  <h3>Allergies</h3>
                </div>
                <AlertCircle size={20} />
              </header>
              {data.activeAllergies.length === 0 ? (
                <Empty text="No allergies are recorded." />
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
                  <h3>Conditions</h3>
                </div>
                <HeartPulse size={20} />
              </header>
              {data.activeConditions.length === 0 ? (
                <Empty text="No conditions are recorded." />
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
