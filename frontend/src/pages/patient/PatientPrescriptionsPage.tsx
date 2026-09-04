import { useCallback, useEffect, useState } from "react";
import { isAxiosError } from "axios";
import { AlertCircle, LoaderCircle, RefreshCw } from "lucide-react";
import { getMyPrescriptions, type PharmacyPatientRecord } from "../../api/pharmacistPatientApi";
import { PrescriptionSheet } from "../../components/PrescriptionSheet";
import "../pharmacist/PharmacistPatientsPage.css";
import "./PatientPrescriptionsPage.css";

function message(error: unknown): string {
  if (isAxiosError(error)) {
    const body = error.response?.data as { error?: { message?: string } } | undefined;
    return body?.error?.message ?? "Your prescriptions could not be loaded.";
  }
  return "Your prescriptions could not be loaded.";
}

export function PatientPrescriptionsPage() {
  const [record, setRecord] = useState<PharmacyPatientRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      setRecord(await getMyPrescriptions());
    } catch (loadError) {
      setError(message(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="rx-patient-state">
        <LoaderCircle className="spin" />
        Loading your prescriptions…
      </div>
    );
  }

  if (error || !record) {
    return (
      <div className="rx-patient-state" role="alert">
        <AlertCircle />
        <span>{error ?? "Prescription information is unavailable."}</span>
        <button type="button" onClick={() => void load()}>
          <RefreshCw size={16} />
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="rx-sheet-page">
      <section className="rx-sheet-hero">
        <div>
          <span>MY HEALTH</span>
          <h2>My prescriptions</h2>
          <p>Each prescription is shown as a digital sheet issued by your doctor.</p>
        </div>
      </section>

      {record.prescriptions.length === 0 ? (
        <div className="rx-sheet rx-sheet--empty">
          <p>No prescriptions have been issued yet.</p>
        </div>
      ) : (
        <div className="rx-sheet-stack">
          {record.prescriptions.map((prescription) => (
            <PrescriptionSheet
              key={prescription.id}
              patient={record.patient}
              allergies={record.allergies}
              diagnoses={record.diagnoses ?? []}
              prescription={prescription}
            />
          ))}
        </div>
      )}
    </div>
  );
}
