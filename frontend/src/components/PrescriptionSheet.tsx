import { useRef, type ReactNode } from "react";
import { HeartPulse, Printer } from "lucide-react";
import "./PrescriptionSheet.css";

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

export interface PrescriptionSheetPatient {
  firstName: string;
  lastName: string;
  patientNumber: string;
  dateOfBirth: string;
  sex: string;
  bloodType: string;
}

export interface PrescriptionSheetAllergy {
  substance: string;
}

export interface PrescriptionSheetDiagnosis {
  conditionName: string;
}

export interface PrescriptionSheetItem {
  id: number;
  medicationName: string;
  strength?: string | null;
  dosageForm?: string | null;
  route?: string | null;
  frequencyText?: string | null;
  quantityPrescribed: number;
  quantityUnit: string;
  instructions?: string | null;
  dose?: string;
}

export interface PrescriptionSheetData {
  prescriptionNumber: string;
  issuedAt: string | null;
  validUntil?: string | null;
  validUntilDate?: string | null;
  clinicalReason: string | null;
  notesToPharmacist?: string | null;
  doctorName: string;
  clinicName: string;
  items: PrescriptionSheetItem[];
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

function quantityLabel(value: number, unit: string): string {
  return `${Number(value)} ${unit}`;
}

function sheetDate(value: string | null | undefined, empty = "—"): string {
  if (!value) return empty;
  const dateOnly = value.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    return dateFormat.format(new Date(`${dateOnly}T12:00:00`));
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? empty : dateFormat.format(parsed);
}

export function PrescriptionSheet({
  patient,
  allergies,
  diagnoses = [],
  prescription,
  showPharmacistNotes = false,
  actions
}: {
  patient: PrescriptionSheetPatient;
  allergies: PrescriptionSheetAllergy[];
  diagnoses?: PrescriptionSheetDiagnosis[];
  prescription: PrescriptionSheetData;
  showPharmacistNotes?: boolean;
  actions?: ReactNode;
}) {
  const sheetRef = useRef<HTMLElement>(null);
  const allergyText = allergies.length
    ? allergies.map((item) => item.substance).join(", ")
    : "None recorded";
  const diagnosisText = diagnoses.length
    ? diagnoses.map((item) => item.conditionName).join(", ")
    : "None recorded";
  const validUntil = prescription.validUntil || prescription.validUntilDate;

  function printSheet(): void {
    const node = sheetRef.current;
    if (!node) return;
    node.classList.add("rx-sheet--print-target");
    document.body.classList.add("printing-rx");
    const restore = (): void => {
      node.classList.remove("rx-sheet--print-target");
      document.body.classList.remove("printing-rx");
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    window.print();
    window.setTimeout(restore, 500);
  }

  return (
    <article className="rx-sheet" ref={sheetRef}>
      <header className="rx-sheet__head">
        <div className="rx-sheet__brand">
          <span className="rx-sheet__mark">
            <HeartPulse size={18} />
          </span>
          <div>
            <strong>Cliniq</strong>
            <small>{prescription.clinicName}</small>
          </div>
        </div>
        <div className="rx-sheet__title">
          <span>ELECTRONIC PRESCRIPTION</span>
          <strong>{prescription.prescriptionNumber}</strong>
        </div>
      </header>

      <dl className="rx-sheet__facts">
        <div>
          <dt>Date</dt>
          <dd>{sheetDate(prescription.issuedAt)}</dd>
        </div>
        <div>
          <dt>Valid until</dt>
          <dd>{sheetDate(validUntil, "No expiry")}</dd>
        </div>
      </dl>

      <section className="rx-sheet__parties">
        <div>
          <span>Patient</span>
          <strong>
            {patient.firstName} {patient.lastName}
          </strong>
          <p>
            {patient.patientNumber}
            <br />
            Born {sheetDate(patient.dateOfBirth)} · {title(patient.sex)} · Blood{" "}
            {bloodLabel(patient.bloodType)}
          </p>
        </div>
        <div>
          <span>Prescribing doctor</span>
          <strong>Dr. {prescription.doctorName}</strong>
          <p>{prescription.clinicName}</p>
        </div>
      </section>

      <div className="rx-sheet__flags">
        <p className="rx-sheet__allergies">
          <strong>Known allergies:</strong> {allergyText}
        </p>
        <p className="rx-sheet__diagnoses">
          <strong>Diagnoses:</strong> {diagnosisText}
        </p>
      </div>

      <table className="rx-sheet__table">
        <thead>
          <tr>
            <th>#</th>
            <th>Medication</th>
            <th>Quantity</th>
            <th>How often</th>
          </tr>
        </thead>
        <tbody>
          {prescription.items.map((item, index) => (
            <tr key={item.id}>
              <td>{index + 1}</td>
              <td>
                <strong>
                  {item.medicationName} {item.strength}
                </strong>
                <small>
                  {item.dosageForm}
                  {item.route ? ` · ${item.route}` : ""}
                  {item.instructions ? ` · ${item.instructions}` : ""}
                </small>
              </td>
              <td>{quantityLabel(item.quantityPrescribed, item.quantityUnit)}</td>
              <td>{item.frequencyText || item.dose}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {prescription.clinicalReason && (
        <p className="rx-sheet__reason">
          <strong>Clinical reason:</strong> {prescription.clinicalReason}
        </p>
      )}

      {showPharmacistNotes && prescription.notesToPharmacist && (
        <p className="rx-sheet__reason">
          <strong>Notes to pharmacist:</strong> {prescription.notesToPharmacist}
        </p>
      )}

      <footer className="rx-sheet__sign">
        <div>
          <em>Dr. {prescription.doctorName}</em>
          <small>Prescribing doctor</small>
        </div>
        <small>Electronic prescription recorded in Cliniq</small>
      </footer>

      <div className="rx-sheet__actions">
        <button type="button" className="rx-sheet__print" onClick={printSheet}>
          <Printer size={15} />
          Print
        </button>
        {actions}
      </div>
    </article>
  );
}
