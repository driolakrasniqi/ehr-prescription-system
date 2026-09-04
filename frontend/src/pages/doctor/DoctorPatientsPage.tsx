import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { isAxiosError } from "axios";
import {
  AlertCircle,
  ClipboardPlus,
  Copy,
  FileHeart,
  LoaderCircle,
  Pencil,
  Pill,
  RefreshCw,
  Search,
  ShieldAlert,
  Stethoscope,
  Trash2,
  X
} from "lucide-react";
import {
  createAllergy,
  createCondition,
  createEncounter,
  createPrescription,
  deleteAllergy,
  deleteCondition,
  deleteEncounter,
  deletePrescription,
  getDoctorPatient,
  getDoctorPatients,
  getDoctorWorkspace,
  updateAllergy,
  updateCondition,
  updateEncounter,
  updatePrescription,
  type DoctorPatient,
  type DoctorPatientDetails,
  type DoctorWorkspace
} from "../../api/doctorApi";
import { PrescriptionSheet } from "../../components/PrescriptionSheet";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { submitFormOnEnter } from "../../utils/formEnterSubmit";
import { filterAndSortMedications } from "../../utils/medicationSearch";
import { filterAndSortPatients } from "../../utils/patientSearch";
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

function bloodLabel(value: string): string {
  return value === "UNKNOWN" ? "Unknown" : value;
}

export function DoctorPatientsPage() {
  const [searchParams] = useSearchParams();
  const requestedPatientId = Number(searchParams.get("patient"));
  const [workspace, setWorkspace] = useState<DoctorWorkspace | null>(null);
  const [patients, setPatients] = useState<DoctorPatient[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [details, setDetails] = useState<DoctorPatientDetails | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    kind: Action;
    id: number;
    label: string;
  } | null>(null);
  const [draftPrescription, setDraftPrescription] = useState<
    Partial<DoctorPatientDetails["prescriptions"][number]> | null
  >(null);
  const detailRequestId = useRef(0);
  const visiblePatients = useMemo(
    () => filterAndSortPatients(patients, search),
    [patients, search]
  );

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
      const requested =
        Number.isInteger(requestedPatientId) &&
        patientData.some((patient) => patient.id === requestedPatientId)
          ? requestedPatientId
          : null;
      setSelectedId(requested);

      if (requested) {
        await loadDetails(requested);
      } else {
        setDetails(null);
      }
    } catch (loadError) {
      setError(message(loadError));
    } finally {
      setLoading(false);
    }
  }, [loadDetails, requestedPatientId]);

  useEffect(() => {
    void Promise.resolve().then(loadInitial);
  }, [loadInitial]);

  useEffect(() => {
    if (loading) return;
    const handle = window.setTimeout(() => {
      void getDoctorPatients(search.trim())
        .then(setPatients)
        .catch((searchError: unknown) => setError(message(searchError)));
    }, 220);
    return () => window.clearTimeout(handle);
  }, [loading, search]);

  async function searchPatients(event: FormEvent) {
    event.preventDefault();
    setError(null);

    try {
      const list = await getDoctorPatients(search.trim());
      setPatients(list);

      const nextPatientId =
        selectedId && list.some((patient) => patient.id === selectedId)
          ? selectedId
          : list.length === 1
            ? (list[0]?.id ?? null)
            : null;

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
    setEditingId(null);
    setDraftPrescription(null);
    if (selectedId) await loadDetails(selectedId);
    try {
      setWorkspace(await getDoctorWorkspace());
    } catch {
      /* keep the current workspace if refresh fails */
    }
  }

  function openCreate(nextAction: Action) {
    setEditingId(null);
    setDraftPrescription(null);
    setAction(nextAction);
  }

  function useTherapy(therapy: DoctorWorkspace["therapies"][number]) {
    setEditingId(null);
    setDraftPrescription({
      medicationId: therapy.medicationId,
      medicationName: `${therapy.medicationName}${therapy.strength ? ` ${therapy.strength}` : ""}`,
      frequencyText: therapy.frequencyText,
      quantityPrescribed: therapy.quantityPrescribed,
      quantityUnit: therapy.quantityUnit,
      instructions: therapy.instructions
    });
    setAction("prescription");
  }

  function openEdit(nextAction: Action, id: number) {
    setEditingId(id);
    setAction(nextAction);
  }

  function requestRemoveRecord(kind: Action, id: number, label: string) {
    setPendingDelete({ kind, id, label });
  }

  async function confirmRemoveRecord(): Promise<void> {
    if (!pendingDelete) return;
    const { kind, id } = pendingDelete;
    setPendingDelete(null);
    setError(null);
    try {
      if (kind === "encounter") await deleteEncounter(id);
      if (kind === "condition") await deleteCondition(id);
      if (kind === "allergy") await deleteAllergy(id);
      if (kind === "prescription") await deletePrescription(id);
      if (selectedId) await loadDetails(selectedId);
    } catch (deleteError) {
      setError(message(deleteError));
    }
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
            <strong>{visiblePatients.length}</strong>
          </header>
          <form onSubmit={searchPatients}>
            <Search size={17} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name or patient number"
            />
            <button type="submit">Search</button>
          </form>
          <div className="doctor-patient-list">
            {visiblePatients.length === 0 ? (
              <p>No patients found.</p>
            ) : (
              visiblePatients.map((patient) => (
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
            <div className="doctor-state">Select a patient from the directory to open their record.</div>
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
                    {title(details.patient.sex)} · Blood {bloodLabel(details.patient.bloodType)}
                  </p>
                </div>
                <div className="doctor-actions">
                  <button onClick={() => openCreate("encounter")}>
                    <ClipboardPlus size={16} />
                    Encounter
                  </button>
                  <button onClick={() => openCreate("condition")}>
                    <FileHeart size={16} />
                    Condition
                  </button>
                  <button onClick={() => openCreate("allergy")}>
                    <ShieldAlert size={16} />
                    Allergy
                  </button>
                  <button className="primary" onClick={() => openCreate("prescription")}>
                    <Pill size={16} />
                    Prescription
                  </button>
                </div>
              </header>

              <section className="doctor-summary-grid">
                <Summary label="Encounters" value={details.encounters.length} />
                <Summary label="Conditions" value={details.conditions.length} />
                <Summary label="Allergies" value={details.allergies.length} />
                <Summary label="Prescriptions" value={details.prescriptions.length} />
              </section>

              <section className="doctor-record-grid">
                <RecordCard title="Recent encounters" empty="No encounters recorded.">
                  {details.encounters.map((item) => (
                    <div className="doctor-row" key={item.id}>
                      <div>
                        <strong>{item.chiefComplaint || title(item.encounterType)}</strong>
                        <small>
                          {dateFormat.format(new Date(item.startedAt))}
                          {item.assessmentSummary ? ` · ${item.assessmentSummary}` : ""}
                        </small>
                        <small className="doctor-byline">Recorded by Dr. {item.doctorName}</small>
                      </div>
                      <RecordActions
                        canChange={item.doctorId === workspace.doctor.practitionerId}
                        onEdit={() => openEdit("encounter", item.id)}
                        onDelete={() =>
                          void requestRemoveRecord("encounter", item.id, item.chiefComplaint || item.encounterNumber)
                        }
                      />
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
                        <small className="doctor-byline">Recorded by Dr. {item.doctorName}</small>
                      </div>
                      <RecordActions
                        canChange={item.doctorId === workspace.doctor.practitionerId}
                        onEdit={() => openEdit("condition", item.id)}
                        onDelete={() => void requestRemoveRecord("condition", item.id, item.conditionName)}
                      />
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
                        <small className="doctor-byline">Recorded by Dr. {item.doctorName}</small>
                      </div>
                      <RecordActions
                        canChange={item.doctorId === workspace.doctor.practitionerId}
                        onEdit={() => openEdit("allergy", item.id)}
                        onDelete={() => void requestRemoveRecord("allergy", item.id, item.substance)}
                      />
                    </div>
                  ))}
                </RecordCard>
              </section>

              <section className="doctor-rx-section">
                {workspace.therapies.length > 0 && (
                  <article className="doctor-therapy-card">
                    <header>
                      <div>
                        <h3>Saved therapies</h3>
                        <p>Copy a previous therapy, then change only what this patient needs.</p>
                      </div>
                    </header>
                    <div className="doctor-therapy-list">
                      {workspace.therapies.map((therapy) => (
                        <div className="doctor-therapy" key={`${therapy.medicationId}-${therapy.frequencyText}-${therapy.quantityPrescribed}`}>
                          <div>
                            <strong>
                              {therapy.medicationName}
                              {therapy.strength ? ` ${therapy.strength}` : ""}
                            </strong>
                            <small>
                              {Number(therapy.quantityPrescribed)} {therapy.quantityUnit} · {therapy.frequencyText}
                              {therapy.usedCount > 1 ? ` · used ${therapy.usedCount} times` : ""}
                            </small>
                          </div>
                          <button type="button" onClick={() => useTherapy(therapy)}>
                            <Copy size={14} />
                            Use
                          </button>
                        </div>
                      ))}
                    </div>
                  </article>
                )}
                <header>
                  <h3>Prescriptions</h3>
                </header>
                {details.prescriptions.length === 0 ? (
                  <p className="doctor-empty">No prescriptions recorded.</p>
                ) : (
                  <div className="rx-sheet-stack">
                    {details.prescriptions.map((item) => (
                    <PrescriptionSheet
                      key={item.id}
                      patient={details.patient}
                      allergies={details.allergies}
                      diagnoses={details.conditions.filter((condition) => {
                        const status = (condition.clinicalStatus ?? "ACTIVE").toUpperCase();
                        return status === "ACTIVE" || status === "RECURRENCE" || status === "RELAPSE";
                      })}
                      showPharmacistNotes
                      prescription={{
                        prescriptionNumber: item.prescriptionNumber,
                        issuedAt: item.issuedAt,
                        validUntil: item.validUntil,
                        validUntilDate: item.validUntilDate,
                        clinicalReason: item.clinicalReason,
                        notesToPharmacist: item.notesToPharmacist,
                        doctorName: item.doctorName,
                        clinicName: item.clinicName,
                        items:
                          item.items?.length > 0
                            ? item.items
                            : item.medicationName
                              ? [
                                  {
                                    id: item.id,
                                    medicationName: item.medicationName,
                                    frequencyText: item.frequencyText,
                                    quantityPrescribed: item.quantityPrescribed ?? 0,
                                    quantityUnit: item.quantityUnit ?? "",
                                    instructions: item.instructions
                                  }
                                ]
                              : []
                      }}
                      actions={
                        item.doctorId === workspace.doctor.practitionerId ? (
                          <RecordActions
                            canChange
                            onEdit={() => openEdit("prescription", item.id)}
                            onDelete={() =>
                              void requestRemoveRecord(
                                "prescription",
                                item.id,
                                item.medicationName || item.prescriptionNumber
                              )
                            }
                          />
                        ) : undefined
                      }
                    />
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </main>
      </div>

      {action && details && (
        <ActionModal
          action={action}
          editingId={editingId}
          draftPrescription={draftPrescription}
          patient={details.patient}
          workspace={workspace}
          details={details}
          onClose={() => {
            setAction(null);
            setEditingId(null);
            setDraftPrescription(null);
          }}
          onSaved={() => void saved()}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Confirm deletion"
          message={`Delete this ${pendingDelete.kind}? ${pendingDelete.label}`}
          confirmLabel="Delete"
          tone="danger"
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => void confirmRemoveRecord()}
        />
      )}
    </div>
  );
}

function RecordActions({
  canChange,
  onEdit,
  onDelete
}: {
  canChange: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  if (!canChange) return null;
  return (
    <div className="doctor-row__actions">
      <button type="button" onClick={onEdit} aria-label="Edit">
        <Pencil size={14} />
      </button>
      <button type="button" onClick={onDelete} aria-label="Delete">
        <Trash2 size={14} />
      </button>
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
  editingId,
  draftPrescription,
  patient,
  workspace,
  details,
  onClose,
  onSaved
}: {
  action: Action;
  editingId: number | null;
  draftPrescription: Partial<DoctorPatientDetails["prescriptions"][number]> | null;
  patient: DoctorPatient;
  workspace: DoctorWorkspace;
  details: DoctorPatientDetails;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const linkableEncounters = details.encounters.filter(
    (encounter) => encounter.doctorId === workspace.doctor.practitionerId
  );
  const encounter = details.encounters.find((item) => item.id === editingId);
  const condition = details.conditions.find((item) => item.id === editingId);
  const allergy = details.allergies.find((item) => item.id === editingId);
  const prescription = editingId
    ? details.prescriptions.find((item) => item.id === editingId)
    : draftPrescription;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    const common = { patientId: patient.id };
    try {
      if (action === "prescription" && !String(values.medicationId ?? "").trim()) {
        setError("Select a medication from the list.");
        setSaving(false);
        return;
      }
      const encounterPayload = {
        organizationId: Number(values.organizationId),
        encounterType: values.encounterType,
        chiefComplaint: values.chiefComplaint,
        symptoms: values.symptoms,
        examinationFindings: values.examinationFindings,
        assessmentSummary: values.assessmentSummary,
        planSummary: values.planSummary
      };
      const conditionPayload = {
        encounterId: values.encounterId ? Number(values.encounterId) : undefined,
        conditionName: values.conditionName,
        category: values.category,
        severity: values.severity,
        onsetDate: values.onsetDate || undefined,
        notes: values.notes
      };
      const allergyPayload = {
        encounterId: values.encounterId ? Number(values.encounterId) : undefined,
        substance: values.substance,
        category: values.category,
        severity: values.severity,
        reactionDescription: values.reactionDescription,
        notes: values.notes
      };
      const prescriptionPayload = {
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
      };
      if (action === "encounter") {
        if (editingId) await updateEncounter(editingId, encounterPayload);
        else await createEncounter({ ...common, ...encounterPayload });
      }
      if (action === "condition") {
        if (editingId) await updateCondition(editingId, conditionPayload);
        else await createCondition({ ...common, ...conditionPayload });
      }
      if (action === "allergy") {
        if (editingId) await updateAllergy(editingId, allergyPayload);
        else await createAllergy({ ...common, ...allergyPayload });
      }
      if (action === "prescription") {
        if (editingId) await updatePrescription(editingId, prescriptionPayload);
        else await createPrescription({ ...common, ...prescriptionPayload });
      }
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
            <span>{editingId ? "EDIT RECORD" : draftPrescription ? "COPY THERAPY" : "NEW RECORD"}</span>
            <h2>{title(action)}</h2>
            <p>
              For {patient.firstName} {patient.lastName}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X />
          </button>
        </header>
        <form onSubmit={submit} onKeyDown={submitFormOnEnter}>
          {error && (
            <div className="doctor-form-error">
              <AlertCircle size={17} />
              {error}
            </div>
          )}
          {action === "encounter" && (
            <EncounterFields workspace={workspace} values={encounter} />
          )}
          {action === "condition" && (
            <ConditionFields encounters={linkableEncounters} values={condition} />
          )}
          {action === "allergy" && <AllergyFields encounters={linkableEncounters} values={allergy} />}
          {action === "prescription" && (
            <PrescriptionFields
              workspace={workspace}
              encounters={linkableEncounters}
              values={prescription as DoctorPatientDetails["prescriptions"][number] | undefined}
            />
          )}
          <footer>
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={saving}>
              {saving ? "Saving…" : editingId ? "Save changes" : "Save record"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function EncounterSelect({
  encounters,
  defaultValue
}: {
  encounters: DoctorPatientDetails["encounters"];
  defaultValue?: number | null;
}) {
  return (
    <label>
      Related encounter
      <select name="encounterId" defaultValue={defaultValue ? String(defaultValue) : ""}>
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
function OrganizationSelect({
  workspace,
  defaultValue
}: {
  workspace: DoctorWorkspace;
  defaultValue?: number;
}) {
  return (
    <label>
      Clinic
      <select name="organizationId" required defaultValue={defaultValue ? String(defaultValue) : undefined}>
        {workspace.organizations.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
    </label>
  );
}
function EncounterFields({
  workspace,
  values
}: {
  workspace: DoctorWorkspace;
  values?: DoctorPatientDetails["encounters"][number];
}) {
  return (
    <>
      <div className="form-grid">
        <OrganizationSelect workspace={workspace} defaultValue={values?.organizationId} />
        <label>
          Type
          <select name="encounterType" defaultValue={values?.encounterType ?? "CONSULTATION"}>
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
        <textarea
          name="chiefComplaint"
          required
          minLength={2}
          maxLength={1000}
          defaultValue={values?.chiefComplaint ?? ""}
        />
      </label>
      <label>
        Symptoms
        <textarea name="symptoms" maxLength={3000} defaultValue={values?.symptoms ?? ""} />
      </label>
      <label>
        Examination findings
        <textarea
          name="examinationFindings"
          maxLength={3000}
          defaultValue={values?.examinationFindings ?? ""}
        />
      </label>
      <label>
        Assessment
        <textarea
          name="assessmentSummary"
          maxLength={3000}
          defaultValue={values?.assessmentSummary ?? ""}
        />
      </label>
      <label>
        Plan
        <textarea name="planSummary" maxLength={3000} defaultValue={values?.planSummary ?? ""} />
      </label>
    </>
  );
}
function ConditionFields({
  encounters,
  values
}: {
  encounters: DoctorPatientDetails["encounters"];
  values?: DoctorPatientDetails["conditions"][number];
}) {
  return (
    <>
      <div className="form-grid">
        <label>
          Condition name
          <input
            name="conditionName"
            required
            minLength={2}
            maxLength={200}
            defaultValue={values?.conditionName ?? ""}
          />
        </label>
        <EncounterSelect encounters={encounters} defaultValue={values?.encounterId} />
        <label>
          Category
          <select name="category" defaultValue={values?.category ?? "DIAGNOSIS"}>
            <option value="DIAGNOSIS">Diagnosis</option>
            <option value="PROBLEM">Problem</option>
            <option value="CHRONIC_CONDITION">Chronic condition</option>
          </select>
        </label>
        <label>
          Severity
          <select name="severity" defaultValue={values?.severity ?? "UNKNOWN"}>
            <option value="UNKNOWN">Unknown</option>
            <option value="MILD">Mild</option>
            <option value="MODERATE">Moderate</option>
            <option value="SEVERE">Severe</option>
          </select>
        </label>
        <label>
          Onset date
          <input type="date" name="onsetDate" max={todayInputDate} defaultValue={values?.onsetDate ?? ""} />
        </label>
      </div>
      <label>
        Notes
        <textarea name="notes" maxLength={2000} defaultValue={values?.notes ?? ""} />
      </label>
    </>
  );
}
function AllergyFields({
  encounters,
  values
}: {
  encounters: DoctorPatientDetails["encounters"];
  values?: DoctorPatientDetails["allergies"][number];
}) {
  return (
    <>
      <div className="form-grid">
        <label>
          Substance
          <input
            name="substance"
            required
            minLength={2}
            maxLength={200}
            defaultValue={values?.substance ?? ""}
          />
        </label>
        <EncounterSelect encounters={encounters} defaultValue={values?.encounterId} />
        <label>
          Category
          <select name="category" defaultValue={values?.category ?? "MEDICATION"}>
            <option value="MEDICATION">Medication</option>
            <option value="FOOD">Food</option>
            <option value="ENVIRONMENT">Environment</option>
            <option value="BIOLOGIC">Biologic</option>
            <option value="OTHER">Other</option>
          </select>
        </label>
        <label>
          Severity
          <select name="severity" defaultValue={values?.severity ?? "UNKNOWN"}>
            <option value="UNKNOWN">Unknown</option>
            <option value="MILD">Mild</option>
            <option value="MODERATE">Moderate</option>
            <option value="SEVERE">Severe</option>
          </select>
        </label>
      </div>
      <label>
        Reaction
        <input name="reactionDescription" maxLength={500} defaultValue={values?.reactionDescription ?? ""} />
      </label>
      <label>
        Notes
        <textarea name="notes" maxLength={2000} defaultValue={values?.notes ?? ""} />
      </label>
    </>
  );
}

type WorkspaceMedication = DoctorWorkspace["medications"][number];

function medicationLabel(item: WorkspaceMedication): string {
  const brand = item.brandName ? ` (${item.brandName})` : "";
  return `${item.genericName}${brand} ${item.strength} — ${item.dosageForm}`;
}

function MedicationSearch({
  medications,
  initialId = "",
  initialLabel = ""
}: {
  medications: WorkspaceMedication[];
  initialId?: string;
  initialLabel?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState(initialLabel);
  const [selectedId, setSelectedId] = useState(initialId);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const filtered = useMemo(
    () => filterAndSortMedications(medications, query).slice(0, 40),
    [medications, query]
  );

  useEffect(() => {
    function closeIfOutside(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", closeIfOutside);
    return () => document.removeEventListener("mousedown", closeIfOutside);
  }, []);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  function selectMedication(item: WorkspaceMedication) {
    setSelectedId(String(item.id));
    setQuery(medicationLabel(item));
    setOpen(false);
  }

  return (
    <label className="medication-search">
      Medication
      <div className="medication-search__control" ref={wrapRef}>
        <Search size={15} />
        <input
          type="search"
          value={query}
          onChange={(event) => {
            const value = event.target.value;
            setQuery(value);
            setSelectedId("");
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
              return;
            }
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((index) => Math.min(index + 1, Math.max(filtered.length - 1, 0)));
              return;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((index) => Math.max(index - 1, 0));
              return;
            }
            if (event.key === "Enter" && open && !selectedId && filtered[activeIndex]) {
              event.preventDefault();
              event.stopPropagation();
              selectMedication(filtered[activeIndex]);
            }
          }}
          placeholder={
            medications.length === 0 ? "No medications available" : "Type a letter to filter medications"
          }
          autoComplete="off"
          disabled={medications.length === 0}
        />
        <input name="medicationId" value={selectedId} required tabIndex={-1} readOnly aria-hidden="true" />
        {open && medications.length > 0 && (
          <ul className="medication-search__list" role="listbox">
            {filtered.length === 0 ? (
              <li className="medication-search__empty">No medications match “{query.trim()}”.</li>
            ) : (
              filtered.map((item, index) => (
                <li key={item.id}>
                  <button
                    type="button"
                    role="option"
                    className={index === activeIndex ? "active" : undefined}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectMedication(item)}
                  >
                    <strong>
                      {item.genericName} {item.strength}
                    </strong>
                    <small>
                      {item.dosageForm}
                      {item.brandName ? ` · ${item.brandName}` : ""}
                    </small>
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </label>
  );
}

function PrescriptionFields({
  workspace,
  encounters,
  values
}: {
  workspace: DoctorWorkspace;
  encounters: DoctorPatientDetails["encounters"];
  values?: Partial<DoctorPatientDetails["prescriptions"][number]>;
}) {
  const selectedMedication = workspace.medications.find((item) => item.id === values?.medicationId);
  return (
    <>
      <div className="form-grid">
        <OrganizationSelect workspace={workspace} defaultValue={values?.organizationId} />
        <EncounterSelect encounters={encounters} defaultValue={values?.encounterId} />
        <MedicationSearch
          key={`${values?.id ?? "new"}-${values?.medicationId ?? "none"}`}
          medications={workspace.medications}
          initialId={values?.medicationId ? String(values.medicationId) : ""}
          initialLabel={
            selectedMedication
              ? medicationLabel(selectedMedication)
              : (values?.medicationName ?? "")
          }
        />
        <label>
          Frequency
          <input
            name="frequencyText"
            required
            minLength={2}
            maxLength={200}
            placeholder="For example: twice daily"
            defaultValue={values?.frequencyText ?? ""}
          />
        </label>
        <label>
          Quantity
          <input
            name="quantityPrescribed"
            type="number"
            min="1"
            max="100000"
            step="1"
            required
            defaultValue={values?.quantityPrescribed ?? ""}
          />
        </label>
        <label>
          Unit
          <input
            name="quantityUnit"
            required
            maxLength={50}
            placeholder="tablets, ml…"
            defaultValue={values?.quantityUnit ?? ""}
          />
        </label>
        <label>
          Valid until
          <input
            name="validUntil"
            type="date"
            min={values ? undefined : tomorrowInputDate}
            defaultValue={values?.validUntilDate ?? ""}
          />
        </label>
      </div>
      <label>
        Clinical reason
        <input name="clinicalReason" maxLength={500} defaultValue={values?.clinicalReason ?? ""} />
      </label>
      <label>
        Patient instructions
        <textarea name="instructions" maxLength={2000} defaultValue={values?.instructions ?? ""} />
      </label>
      <label>
        Notes to pharmacist
        <textarea
          name="notesToPharmacist"
          maxLength={2000}
          defaultValue={values?.notesToPharmacist ?? ""}
        />
      </label>
    </>
  );
}
