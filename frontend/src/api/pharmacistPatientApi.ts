import { apiClient } from "./client";

interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface PharmacyPatient {
  id: number;
  patientNumber: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  sex: "FEMALE" | "MALE";
  bloodType: string;
  prescriptionCount: number;
}

export interface PatientPrescriptionItem {
  id: number;
  lineNumber: number;
  medicationName: string;
  strength: string;
  dosageForm: string;
  doseValue: string | number | null;
  doseUnit: string | null;
  route: string | null;
  frequencyText: string;
  quantityPrescribed: number;
  quantityUnit: string;
  instructions: string | null;
  dose: string;
}

export interface PatientPrescription {
  id: number;
  prescriptionNumber: string;
  status: string;
  issuedAt: string | null;
  validUntil: string | null;
  clinicalReason: string | null;
  notesToPharmacist?: string | null;
  doctorName: string;
  clinicName: string;
  items: PatientPrescriptionItem[];
}

export interface PatientAllergy {
  id: number;
  substance: string;
  category: string;
  severity: string;
  reactionDescription: string | null;
  notes: string | null;
  doctorName: string | null;
}

export interface PatientDiagnosis {
  id: number;
  conditionName: string;
  category: string;
  severity: string;
  doctorName: string | null;
}

export interface PharmacyPatientRecord {
  patient: {
    id: number;
    patientNumber: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    sex: string;
    bloodType: string;
  };
  prescriptions: PatientPrescription[];
  allergies: PatientAllergy[];
  diagnoses: PatientDiagnosis[];
}

export async function getPharmacyPatients(search = ""): Promise<PharmacyPatient[]> {
  const response = await apiClient.get<ApiSuccess<{ patients: PharmacyPatient[] }>>(
    "/pharmacist/patients",
    { params: { search } }
  );
  return response.data.data.patients;
}

export async function getPharmacyPatient(patientId: number): Promise<PharmacyPatientRecord> {
  const response = await apiClient.get<ApiSuccess<PharmacyPatientRecord>>(
    `/pharmacist/patients/${patientId}`
  );
  return response.data.data;
}

export async function getMyPrescriptions(): Promise<PharmacyPatientRecord> {
  const response = await apiClient.get<ApiSuccess<PharmacyPatientRecord>>("/patient/prescriptions");
  return response.data.data;
}
