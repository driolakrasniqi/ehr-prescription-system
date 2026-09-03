import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { isAxiosError } from "axios";
import {
  AlertCircle,
  ClipboardPlus,
  FileHeart,
  LoaderCircle,
  Pill,
  RefreshCw,
  Search,
  ShieldAlert,
  Stethoscope,
  X
} from "lucide-react";
import {
  createAllergy,
  createCondition,
  createEncounter,
  createPrescription,
  getDoctorPatient,
  getDoctorPatients,
  getDoctorWorkspace,
  type DoctorPatient,
  type DoctorPatientDetails,
  type DoctorWorkspace
} from "../../api/doctorApi";
import "./DoctorPatientsPage.css";

type Action = "encounter" | "condition" | "allergy" | "prescription";
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const todayInputDate = new Date().toISOString().slice(0, 10);
const tomorrowInputDate = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

function message(error: unknown): string {
  if (isAxiosError(error)) {
    const body = error.response?.data as
      | {
          error?: { message?: string; details?: Record<string, string[]> };
        }
      | undefined;
    const detail = body?.error?.details
      ? Object.values(body.error.details).flat().find(Boolean)
      : undefined;
    return detail ?? body?.error?.message ?? "The request could not be completed.";
  }
  return "The request could not be completed.";
}

function title(value: string): string {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

export function DoctorPatientsPage() {
  const [workspace, setWorkspace] = useState<DoctorWorkspace | null>(null);
  const [patients, setPatients] = useState<DoctorPatient[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [details, setDetails] = useState<DoctorPatientDetails | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const detailRequestId = useRef(0);

  const loadDetails = useCallback(async (patientId: number) => {
    const requestId = ++detailRequestId.current;
    setDetailLoading(true);
    setError(null);

    try {
      const patientDetails = await getDoctorPatient(patientId);
      if (requestId === detailRequestId.current) {
        setDetails(patientDetails);
      }
    } catch (loadError) {
      if (requestId === detailRequestId.current) {
        setDetails(null);
        setError(message(loadError));
      }
    } finally {
      if (requestId === detailRequestId.current) {
        setDetailLoading(false);
      }
    }
  }, []);

  const loadInitial = useCallback(async () => {
    try {
      const [workspaceData, patientData] = await Promise.all([
        getDoctorWorkspace(),
        getDoctorPatients()
      ]);
      setWorkspace(workspaceData);
      setPatients(patientData);
      const firstPatientId = patientData[0]?.id ?? null;
      setSelectedId(firstPatientId);

      if (firstPatientId) {
        await loadDetails(firstPatientId);
      } else {
        setDetails(null);
      }
    } catch (loadError) {
      setError(message(loadError));
    } finally {
      setLoading(false);
    }
  }, [loadDetails]);

  useEffect(() => {
    void Promise.resolve().then(loadInitial);
  }, [loadInitial]);

  async function searchPatients(event: FormEvent) {
    event.preventDefault();
    setError(null);

    try {
      const list = await getDoctorPatients(search.trim());
      setPatients(list);

      const nextPatientId =
        selectedId && list.some((patient) => patient.id === selectedId)
          ? selectedId
          : (list[0]?.id ?? null);

      setSelectedId(nextPatientId);

      if (nextPatientId) {
        await loadDetails(nextPatientId);
      } else {
        detailRequestId.current += 1;
        setDetails(null);
        setDetailLoading(false);
      }
    } catch (searchError) {
      setDetailLoading(false);
      setError(message(searchError));
    }
  }

  function selectPatient(patientId: number) {
    setSelectedId(patientId);
    void loadDetails(patientId);
  }

  async function saved() {
    setAction(null);
    if (selectedId) await loadDetails(selectedId);
  }

  if (loading)
    return (
      <div className="doctor-state">
        <LoaderCircle className="spin" />
        Loading patients…
      </div>
    );
  if (!workspace)
    return (
      <div className="doctor-state doctor-state--error">
        <AlertCircle />
        {error}
        <button onClick={() => void loadInitial()}>
          <RefreshCw size={16} />
          Try again
        </button>
      </div>
    );

  return (
    <div className="doctor-page">
      <section className="doctor-hero">
        <div>
          <span>CLINICAL WORKSPACE</span>
          <h2>Patient care</h2>
          <p>Review patient records and record essential clinical information.</p>
        </div>
        <Stethoscope size={42} />
      </section>

      {error && (
        <div className="doctor-alert">
          <AlertCircle size={18} />
          <span>{error}</span>
          <button onClick={() => setError(null)}>
            <X size={16} />
          </button>
        </div>
      )}

      <div className="doctor-layout">
        <aside className="doctor-directory">
          <header>
            <div>
              <span>PATIENTS</span>
              <h3>Patient directory</h3>
            </div>
            <strong>{patients.length}</strong>
          </header>
          <form onSubmit={searchPatients}>
            <Search size={17} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name or number"
            />
            <button type="submit">Search</button>
          </form>
          <div className="doctor-patient-list">
            {patients.length === 0 ? (
              <p>No patients found.</p>
            ) : (
              patients.map((patient) => (
                <button
                  key={patient.id}
                  className={selectedId === patient.id ? "active" : ""}
                  onClick={() => selectPatient(patient.id)}
                >
                  <span>
                    {patient.firstName[0]}
                    {patient.lastName[0]}
                  </span>
                  <div>
                    <strong>
                      {patient.firstName} {patient.lastName}
                    </strong>
                    <small>{patient.patientNumber}</small>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        <main className="doctor-record">
          {detailLoading ? (
            <div className="doctor-state">
              <LoaderCircle className="spin" />
              Loading record…
            </div>
          ) : !details ? (
            <div className="doctor-state">Select a patient to view their record.</div>
          ) : (
            <>
              <header className="doctor-patient-head">
                <div>
                  <span>PATIENT RECORD</span>
                  <h2>
                    {details.patient.firstName} {details.patient.lastName}
                  </h2>
                  <p>
                    {details.patient.patientNumber} · Born{" "}
                    {dateFormat.format(new Date(details.patient.dateOfBirth))} ·{" "}
                    {title(details.patient.sex)} · Blood {details.patient.bloodType}
                  </p>
                </div>
                <div className="doctor-actions">
                  <button onClick={() => setAction("encounter")}>
                    <ClipboardPlus size={16} />
                    Encounter
                  </button>
                  <button onClick={() => setAction("condition")}>
                    <FileHeart size={16} />
                    Condition
                  </button>
                  <button onClick={() => setAction("allergy")}>
                    <ShieldAlert size={16} />
                    Allergy
                  </button>
                  <button className="primary" onClick={() => setAction("prescription")}>
                    <Pill size={16} />
                    Prescription
                  </button>
                </div>
              </header>

              <section className="doctor-summary-grid">
                <Summary label="Encounters" value={details.encounters.length} />
                <Summary
                  label="Active conditions"
                  value={
                    details.conditions.filter((item) => item.clinicalStatus === "ACTIVE").length
                  }
                />
                <Summary
                  label="Active allergies"
                  value={
                    details.allergies.filter((item) => item.clinicalStatus === "ACTIVE").length
                  }
                />
                <Summary label="Prescriptions" value={details.prescriptions.length} />
              </section>

              <section className="doctor-record-grid">
                <RecordCard title="Recent encounters" empty="No encounters recorded.">
                  {details.encounters.map((item) => (
                    <div className="doctor-row" key={item.id}>
                      <div>
                        <strong>{item.chiefComplaint || title(item.encounterType)}</strong>
                        <small>
                          {dateFormat.format(new Date(item.startedAt))} · {item.doctorName}
                        </small>
                      </div>
                      <span>{title(item.status)}</span>
                    </div>
                  ))}
                </RecordCard>
                <RecordCard title="Conditions" empty="No conditions recorded.">
                  {details.conditions.map((item) => (
                    <div className="doctor-row" key={item.id}>
                      <div>
                        <strong>{item.conditionName}</strong>
                        <small>
                          {title(item.category)} · {title(item.severity)}
                        </small>
                      </div>
                      <span>{title(item.clinicalStatus)}</span>
                    </div>
                  ))}
                </RecordCard>
                <RecordCard title="Allergies" empty="No allergies recorded.">
                  {details.allergies.map((item) => (
                    <div className="doctor-row" key={item.id}>
                      <div>
                        <strong>{item.substance}</strong>
                        <small>
                          {title(item.category)} · {title(item.severity)}
                        </small>
                      </div>
                      <span>{title(item.clinicalStatus)}</span>
                    </div>
                  ))}
                </RecordCard>
                <RecordCard title="Prescriptions" empty="No prescriptions recorded.">
                  {details.prescriptions.map((item) => (
                    <div className="doctor-row" key={item.id}>
                      <div>
                        <strong>{item.prescriptionNumber}</strong>
                        <small>
                          {item.issuedAt ? dateFormat.format(new Date(item.issuedAt)) : "Draft"}
                          {item.clinicalReason ? ` · ${item.clinicalReason}` : ""}
                        </small>
                      </div>
                      <span>{title(item.status)}</span>
                    </div>
                  ))}
                </RecordCard>
              </section>
            </>
          )}
        </main>
      </div>

      {action && details && (
        <ActionModal
          action={action}
          patient={details.patient}
          workspace={workspace}
          encounters={details.encounters}
          onClose={() => setAction(null)}
          onSaved={() => void saved()}
        />
      )}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <article>
      <small>{label}</small>
      <strong>{value}</strong>
    </article>
  );
}

function RecordCard({
  title: cardTitle,
  empty,
  children
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  const items = Array.isArray(children) ? children : [children];
  return (
    <article className="doctor-card">
      <header>
        <h3>{cardTitle}</h3>
      </header>
      <div>{items.length && items[0] ? children : <p className="doctor-empty">{empty}</p>}</div>
    </article>
  );
}

function ActionModal({
  action,
  patient,
  workspace,
  encounters,
  onClose,
  onSaved
}: {
  action: Action;
  patient: DoctorPatient;
  workspace: DoctorWorkspace;
  encounters: DoctorPatientDetails["encounters"];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const linkableEncounters = encounters.filter(
    (encounter) => encounter.doctorId === workspace.doctor.practitionerId
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    const common = { patientId: patient.id };
    try {
      if (action === "encounter")
        await createEncounter({
          ...common,
          organizationId: Number(values.organizationId),
          encounterType: values.encounterType,
          chiefComplaint: values.chiefComplaint,
          symptoms: values.symptoms,
          examinationFindings: values.examinationFindings,
          assessmentSummary: values.assessmentSummary,
          planSummary: values.planSummary
        });
      if (action === "condition")
        await createCondition({
          ...common,
          encounterId: values.encounterId ? Number(values.encounterId) : undefined,
          conditionName: values.conditionName,
          category: values.category,
          severity: values.severity,
          onsetDate: values.onsetDate || undefined,
          notes: values.notes
        });
      if (action === "allergy")
        await createAllergy({
          ...common,
          encounterId: values.encounterId ? Number(values.encounterId) : undefined,
          substance: values.substance,
          category: values.category,
          severity: values.severity,
          reactionDescription: values.reactionDescription,
          notes: values.notes
        });
      if (action === "prescription")
        await createPrescription({
          ...common,
          encounterId: values.encounterId ? Number(values.encounterId) : undefined,
          organizationId: Number(values.organizationId),
          clinicalReason: values.clinicalReason,
          notesToPharmacist: values.notesToPharmacist,
          validUntil: values.validUntil
            ? new Date(`${values.validUntil}T23:59:59`).toISOString()
            : undefined,
          items: [
            {
              medicationId: Number(values.medicationId),
              frequencyText: values.frequencyText,
              quantityPrescribed: Number(values.quantityPrescribed),
              quantityUnit: values.quantityUnit,
              instructions: values.instructions
            }
          ]
        });
      onSaved();
    } catch (saveError) {
      setError(message(saveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="doctor-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="doctor-modal" role="dialog" aria-modal="true">
        <header>
          <div>
            <span>NEW RECORD</span>
            <h2>{title(action)}</h2>
            <p>
              For {patient.firstName} {patient.lastName}
            </p>
          </div>
          <button onClick={onClose}>
            <X />
          </button>
        </header>
        <form onSubmit={submit}>
          {error && (
            <div className="doctor-form-error">
              <AlertCircle size={17} />
              {error}
            </div>
          )}
          {action === "encounter" && <EncounterFields workspace={workspace} />}
          {action === "condition" && <ConditionFields encounters={linkableEncounters} />}
          {action === "allergy" && <AllergyFields encounters={linkableEncounters} />}
          {action === "prescription" && (
            <PrescriptionFields workspace={workspace} encounters={linkableEncounters} />
          )}
          <footer>
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="primary" disabled={saving}>
              {saving ? "Saving…" : "Save record"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function EncounterSelect({ encounters }: { encounters: DoctorPatientDetails["encounters"] }) {
  return (
    <label>
      Related encounter
      <select name="encounterId">
        <option value="">None</option>
        {encounters.map((item) => (
          <option key={item.id} value={item.id}>
            {item.encounterNumber} — {item.chiefComplaint}
          </option>
        ))}
      </select>
    </label>
  );
}
function OrganizationSelect({ workspace }: { workspace: DoctorWorkspace }) {
  return (
    <label>
      Clinic
      <select name="organizationId" required>
        {workspace.organizations.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
    </label>
  );
}
function EncounterFields({ workspace }: { workspace: DoctorWorkspace }) {
  return (
    <>
      <div className="form-grid">
        <OrganizationSelect workspace={workspace} />
        <label>
          Type
          <select name="encounterType" defaultValue="CONSULTATION">
            <option value="CONSULTATION">Consultation</option>
            <option value="FOLLOW_UP">Follow-up</option>
            <option value="PREVENTIVE">Preventive</option>
            <option value="EMERGENCY">Emergency</option>
            <option value="OTHER">Other</option>
          </select>
        </label>
      </div>
      <label>
        Chief complaint
        <textarea name="chiefComplaint" required minLength={2} maxLength={1000} />
      </label>
      <label>
        Symptoms
        <textarea name="symptoms" maxLength={3000} />
      </label>
      <label>
        Examination findings
        <textarea name="examinationFindings" maxLength={3000} />
      </label>
      <label>
        Assessment
        <textarea name="assessmentSummary" maxLength={3000} />
      </label>
      <label>
        Plan
        <textarea name="planSummary" maxLength={3000} />
      </label>
    </>
  );
}
function ConditionFields({ encounters }: { encounters: DoctorPatientDetails["encounters"] }) {
  return (
    <>
      <div className="form-grid">
        <label>
          Condition name
          <input name="conditionName" required minLength={2} maxLength={200} />
        </label>
        <EncounterSelect encounters={encounters} />
        <label>
          Category
          <select name="category">
            <option value="DIAGNOSIS">Diagnosis</option>
            <option value="PROBLEM">Problem</option>
            <option value="CHRONIC_CONDITION">Chronic condition</option>
          </select>
        </label>
        <label>
          Severity
          <select name="severity">
            <option value="UNKNOWN">Unknown</option>
            <option value="MILD">Mild</option>
            <option value="MODERATE">Moderate</option>
            <option value="SEVERE">Severe</option>
          </select>
        </label>
        <label>
          Onset date
          <input type="date" name="onsetDate" max={todayInputDate} />
        </label>
      </div>
      <label>
        Notes
        <textarea name="notes" maxLength={2000} />
      </label>
    </>
  );
}
function AllergyFields({ encounters }: { encounters: DoctorPatientDetails["encounters"] }) {
  return (
    <>
      <div className="form-grid">
        <label>
          Substance
          <input name="substance" required minLength={2} maxLength={200} />
        </label>
        <EncounterSelect encounters={encounters} />
        <label>
          Category
          <select name="category">
            <option value="MEDICATION">Medication</option>
            <option value="FOOD">Food</option>
            <option value="ENVIRONMENT">Environment</option>
            <option value="BIOLOGIC">Biologic</option>
            <option value="OTHER">Other</option>
          </select>
        </label>
        <label>
          Severity
          <select name="severity">
            <option value="UNKNOWN">Unknown</option>
            <option value="MILD">Mild</option>
            <option value="MODERATE">Moderate</option>
            <option value="SEVERE">Severe</option>
          </select>
        </label>
      </div>
      <label>
        Reaction
        <input name="reactionDescription" maxLength={500} />
      </label>
      <label>
        Notes
        <textarea name="notes" maxLength={2000} />
      </label>
    </>
  );
}
function PrescriptionFields({
  workspace,
  encounters
}: {
  workspace: DoctorWorkspace;
  encounters: DoctorPatientDetails["encounters"];
}) {
  return (
    <>
      <div className="form-grid">
        <OrganizationSelect workspace={workspace} />
        <EncounterSelect encounters={encounters} />
        <label>
          Medication
          <select name="medicationId" required>
            {workspace.medications.length === 0 && (
              <option value="">No medications available</option>
            )}
            {workspace.medications.map((item) => (
              <option key={item.id} value={item.id}>
                {item.genericName} {item.strength} — {item.dosageForm}
              </option>
            ))}
          </select>
        </label>
        <label>
          Frequency
          <input
            name="frequencyText"
            required
            minLength={2}
            maxLength={200}
            placeholder="For example: twice daily"
          />
        </label>
        <label>
          Quantity
          <input name="quantityPrescribed" type="number" min="1" max="100000" step="1" required />
        </label>
        <label>
          Unit
          <input name="quantityUnit" required maxLength={50} placeholder="tablets, ml…" />
        </label>
        <label>
          Valid until
          <input name="validUntil" type="date" min={tomorrowInputDate} />
        </label>
      </div>
      <label>
        Clinical reason
        <input name="clinicalReason" maxLength={500} />
      </label>
      <label>
        Patient instructions
        <textarea name="instructions" maxLength={2000} />
      </label>
      <label>
        Notes to pharmacist
        <textarea name="notesToPharmacist" maxLength={2000} />
      </label>
    </>
  );
}
