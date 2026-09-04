import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { isAxiosError } from "axios";
import {
  AlertCircle,
  HeartPulse,
  LoaderCircle,
  Search,
  ShieldAlert,
  UserRound,
  X
} from "lucide-react";
import {
  getPharmacyPatient,
  getPharmacyPatients,
  type PharmacyPatient,
  type PharmacyPatientRecord
} from "../../api/pharmacistPatientApi";
import { PrescriptionSheet } from "../../components/PrescriptionSheet";
import { filterAndSortPatients } from "../../utils/patientSearch";
import "./PharmacistPatientsPage.css";

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

function message(error: unknown): string {
  if (isAxiosError(error)) {
    const body = error.response?.data as { error?: { message?: string } } | undefined;
    return body?.error?.message ?? "The request could not be completed.";
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

export function PharmacistPatientsPage() {
  const [searchParams] = useSearchParams();
  const requestedPatientId = Number(searchParams.get("patient"));
  const [patients, setPatients] = useState<PharmacyPatient[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [record, setRecord] = useState<PharmacyPatientRecord | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedIdRef = useRef<number | null>(null);
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
      const details = await getPharmacyPatient(patientId);
      if (requestId === detailRequestId.current) {
        setRecord(details);
      }
    } catch (loadError) {
      if (requestId === detailRequestId.current) {
        setRecord(null);
        setError(message(loadError));
      }
    } finally {
      if (requestId === detailRequestId.current) {
        setDetailLoading(false);
      }
    }
  }, []);

  const loadList = useCallback(
    async (term = "") => {
      const list = await getPharmacyPatients(term);
      setPatients(list);
      const currentId = selectedIdRef.current;
      const stillVisible = currentId && list.some((item) => item.id === currentId);
      const requested =
        !term &&
        Number.isInteger(requestedPatientId) &&
        list.some((item) => item.id === requestedPatientId)
          ? requestedPatientId
          : null;
      const nextId = stillVisible
        ? currentId
        : requested
          ? requested
          : term && list.length === 1
            ? (list[0]?.id ?? null)
            : null;
      selectedIdRef.current = nextId;
      setSelectedId(nextId);
      if (nextId) {
        await loadDetails(nextId);
      } else {
        detailRequestId.current += 1;
        setRecord(null);
        setDetailLoading(false);
      }
    },
    [loadDetails, requestedPatientId]
  );

  useEffect(() => {
    void loadList()
      .catch((loadError: unknown) => setError(message(loadError)))
      .finally(() => setLoading(false));
  }, [loadList]);

  useEffect(() => {
    if (loading) return;
    const handle = window.setTimeout(() => {
      void getPharmacyPatients(search.trim())
        .then((list) => {
          setPatients(list);
          const currentId = selectedIdRef.current;
          if (currentId && !list.some((item) => item.id === currentId) && search.trim()) {
            return;
          }
        })
        .catch((searchError: unknown) => setError(message(searchError)));
    }, 220);
    return () => window.clearTimeout(handle);
  }, [loading, search]);

  async function searchPatients(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await loadList(search.trim());
    } catch (searchError) {
      setDetailLoading(false);
      setError(message(searchError));
    }
  }

  function selectPatient(patientId: number) {
    selectedIdRef.current = patientId;
    setSelectedId(patientId);
    void loadDetails(patientId);
  }

  if (loading) {
    return (
      <div className="rx-patient-state">
        <LoaderCircle className="spin" />
        Loading patients…
      </div>
    );
  }

  return (
    <div className="rx-patient-page">
      <section className="rx-patient-hero">
        <div>
          <span>PHARMACY WORKSPACE</span>
          <h2>Patient lookup</h2>
          <p>Search by the patient’s name or number to see the medicines prescribed by the doctor.</p>
        </div>
        <UserRound size={42} />
      </section>

      {error && (
        <div className="rx-patient-alert">
          <AlertCircle size={18} />
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)}>
            <X size={16} />
          </button>
        </div>
      )}

      <div className="rx-patient-layout">
        <aside className="rx-patient-directory">
          <header>
            <div>
              <span>PATIENTS</span>
              <h3>Patient directory</h3>
            </div>
            <strong>{visiblePatients.length}</strong>
          </header>
          <form onSubmit={searchPatients}>
            <Search size={16} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name or patient number"
              maxLength={100}
            />
            <button type="submit">Search</button>
          </form>
          <div className="rx-patient-list">
            {visiblePatients.length === 0 ? (
              <p>No patients found.</p>
            ) : (
              visiblePatients.map((patient) => (
                <button
                  key={patient.id}
                  type="button"
                  className={patient.id === selectedId ? "active" : undefined}
                  onClick={() => selectPatient(patient.id)}
                >
                  <span>
                    <strong>
                      {patient.firstName} {patient.lastName}
                    </strong>
                    <small>
                      {patient.patientNumber} · {Number(patient.prescriptionCount)} prescription
                      {Number(patient.prescriptionCount) === 1 ? "" : "s"}
                    </small>
                  </span>
                </button>
              ))
            )}
          </div>
        </aside>

        <main className="rx-patient-record">
          {detailLoading ? (
            <div className="rx-patient-state">
              <LoaderCircle className="spin" />
              Loading record…
            </div>
          ) : !record ? (
            <div className="rx-patient-state">
              Select a patient from the directory, or search by name or number.
            </div>
          ) : (
            <PatientPrescriptionRecord record={record} showPharmacistNotes />
          )}
        </main>
      </div>
    </div>
  );
}

export function PatientPrescriptionRecord({
  record,
  showPharmacistNotes = false
}: {
  record: PharmacyPatientRecord;
  showPharmacistNotes?: boolean;
}) {
  return (
    <>
      <header className="rx-patient-head">
        <div>
          <span>PATIENT RECORD</span>
          <h2>
            {record.patient.firstName} {record.patient.lastName}
          </h2>
          <p>
            {record.patient.patientNumber} · Born{" "}
            {dateFormat.format(new Date(record.patient.dateOfBirth))} · {title(record.patient.sex)} ·
            Blood {bloodLabel(record.patient.bloodType)}
          </p>
        </div>
      </header>

      <section className="rx-patient-summary">
        <article>
          <small>Prescriptions</small>
          <strong>{record.prescriptions.length}</strong>
        </article>
        <article>
          <small>Allergies</small>
          <strong>{record.allergies.length}</strong>
        </article>
        <article>
          <small>Diagnoses</small>
          <strong>{(record.diagnoses ?? []).length}</strong>
        </article>
      </section>

      <section className="rx-patient-allergies">
        <header>
          <h3>
            <ShieldAlert size={16} /> Allergies
          </h3>
        </header>
        {record.allergies.length === 0 ? (
          <p className="rx-patient-empty">No allergies recorded.</p>
        ) : (
          record.allergies.map((allergy) => (
            <div className="rx-patient-allergy" key={allergy.id}>
              <div>
                <strong>{allergy.substance}</strong>
                <small>
                  {title(allergy.category)}
                  {allergy.reactionDescription ? ` · ${allergy.reactionDescription}` : ""}
                  {allergy.doctorName ? ` · Recorded by Dr. ${allergy.doctorName}` : ""}
                </small>
              </div>
              <span>{title(allergy.severity)}</span>
            </div>
          ))
        )}
      </section>

      <section className="rx-patient-allergies">
        <header>
          <h3>
            <HeartPulse size={16} /> Diagnoses
          </h3>
        </header>
        {(record.diagnoses ?? []).length === 0 ? (
          <p className="rx-patient-empty">No diagnoses recorded.</p>
        ) : (
          (record.diagnoses ?? []).map((diagnosis) => (
            <div className="rx-patient-allergy" key={diagnosis.id}>
              <div>
                <strong>{diagnosis.conditionName}</strong>
                <small>
                  {title(diagnosis.category)}
                  {diagnosis.doctorName ? ` · Recorded by Dr. ${diagnosis.doctorName}` : ""}
                </small>
              </div>
              <span>{title(diagnosis.severity)}</span>
            </div>
          ))
        )}
      </section>

      <section className="rx-prescription-stack">
        {record.prescriptions.length === 0 ? (
          <p className="rx-patient-empty">No prescriptions recorded.</p>
        ) : (
          record.prescriptions.map((prescription) => (
            <PrescriptionSheet
              key={prescription.id}
              patient={record.patient}
              allergies={record.allergies}
              diagnoses={record.diagnoses ?? []}
              prescription={prescription}
              showPharmacistNotes={showPharmacistNotes}
            />
          ))
        )}
      </section>
    </>
  );
}
