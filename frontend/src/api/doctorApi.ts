import { apiClient } from "./client";

interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface DoctorPatient {
  id: number;
  patientNumber: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  sex: "FEMALE" | "MALE";
  bloodType: string;
  phone: string | null;
  email: string | null;
}

export interface DoctorWorkspace {
  doctor: { practitionerId: number; firstName: string; lastName: string };
  organizations: Array<{ id: number; name: string }>;
  medications: Array<{
    id: number;
    medicationCode: string;
    genericName: string;
    brandName: string | null;
    strength: string;
    dosageForm: string;
    defaultRoute: string | null;
  }>;
}

export interface DoctorPatientDetails {
  patient: DoctorPatient;
  encounters: Array<{
    id: number;
    doctorId: number;
    encounterNumber: string;
    encounterType: string;
    startedAt: string;
    chiefComplaint: string | null;
    assessmentSummary: string | null;
    planSummary: string | null;
    status: string;
    doctorName: string;
    organizationName: string;
  }>;
  conditions: Array<{
    id: number;
    conditionName: string;
    category: string;
    clinicalStatus: string;
    severity: string;
    onsetDate: string | null;
    notes: string | null;
  }>;
  allergies: Array<{
    id: number;
    substance: string;
    category: string;
    severity: string;
    reactionDescription: string | null;
    clinicalStatus: string;
    notes: string | null;
  }>;
  prescriptions: Array<{
    id: number;
    prescriptionNumber: string;
    status: string;
    issuedAt: string | null;
    validUntil: string | null;
    clinicalReason: string | null;
  }>;
}

export async function getDoctorWorkspace(): Promise<DoctorWorkspace> {
  const response = await apiClient.get<ApiSuccess<DoctorWorkspace>>("/doctor/workspace");
  return response.data.data;
}

export async function getDoctorPatients(search = ""): Promise<DoctorPatient[]> {
  const response = await apiClient.get<ApiSuccess<{ patients: DoctorPatient[] }>>(
    "/doctor/patients",
    { params: { search } }
  );
  return response.data.data.patients;
}

export async function getDoctorPatient(patientId: number): Promise<DoctorPatientDetails> {
  const response = await apiClient.get<ApiSuccess<DoctorPatientDetails>>(
    `/doctor/patients/${patientId}`
  );
  return response.data.data;
}

export async function createEncounter(input: Record<string, unknown>): Promise<void> {
  await apiClient.post("/doctor/encounters", input);
}

export async function createCondition(input: Record<string, unknown>): Promise<void> {
  await apiClient.post("/doctor/conditions", input);
}

export async function createAllergy(input: Record<string, unknown>): Promise<void> {
  await apiClient.post("/doctor/allergies", input);
}

export async function createPrescription(input: Record<string, unknown>): Promise<void> {
  await apiClient.post("/doctor/prescriptions", input);
}
