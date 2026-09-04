import * as repository from "../repositories/pharmacistPatient.repository.js";
import { AppError } from "../utils/errors.js";

function doseText(item: {
  doseValue?: string | number | null;
  doseUnit?: string | null;
  strength?: string | null;
  frequencyText?: string | null;
}): string {
  const measured =
    item.doseValue != null && String(item.doseValue).trim() !== "" && item.doseUnit
      ? `${item.doseValue} ${item.doseUnit}`
      : null;
  if (measured && item.frequencyText) {
    return `${measured} · ${item.frequencyText}`;
  }
  if (measured) return measured;
  if (item.strength && item.frequencyText) {
    return `${item.strength} · ${item.frequencyText}`;
  }
  return item.frequencyText || item.strength || "Dose not specified";
}

function withDose(
  prescriptions: Array<{
    notesToPharmacist?: string | null;
    items: Array<Record<string, unknown>>;
  }>
) {
  return prescriptions.map((prescription) => ({
    ...prescription,
    items: prescription.items.map((item) => ({
      ...item,
      dose: doseText({
        doseValue: item.doseValue as string | number | null | undefined,
        doseUnit: item.doseUnit as string | null | undefined,
        strength: item.strength as string | null | undefined,
        frequencyText: item.frequencyText as string | null | undefined
      })
    }))
  }));
}

export async function listPatients(userId: number, search: string) {
  if (!(await repository.pharmacistIsActive(userId))) {
    throw new AppError(403, "FORBIDDEN", "An active pharmacy assignment is required.");
  }
  return repository.listPatients(search);
}

export async function getPatientRecord(userId: number, patientId: number) {
  if (!(await repository.pharmacistIsActive(userId))) {
    throw new AppError(403, "FORBIDDEN", "An active pharmacy assignment is required.");
  }
  const record = await repository.getPatientRecord(patientId);
  if (!record) throw new AppError(404, "NOT_FOUND", "Patient not found.");
  return {
    patient: record.patient,
    allergies: record.allergies,
    diagnoses: record.diagnoses,
    prescriptions: withDose(
      record.prescriptions as Array<{
        notesToPharmacist?: string | null;
        items: Array<Record<string, unknown>>;
      }>
    )
  };
}

export async function getOwnPrescriptionRecord(userId: number) {
  const record = await repository.getOwnPatientRecord(userId);
  if (!record) {
    throw new AppError(404, "NOT_FOUND", "No patient profile is linked to this account.");
  }
  return {
    patient: record.patient,
    allergies: record.allergies,
    diagnoses: record.diagnoses,
    prescriptions: withDose(
      record.prescriptions as Array<{
        notesToPharmacist?: string | null;
        items: Array<Record<string, unknown>>;
      }>
    ).map((prescription) => {
      const { notesToPharmacist: _notes, ...visible } = prescription;
      return visible;
    })
  };
}
