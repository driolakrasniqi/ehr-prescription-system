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
  therapies: Array<{
    medicationId: number;
    medicationName: string;
    strength: string | null;
    dosageForm: string | null;
    frequencyText: string;
    quantityPrescribed: number;
    quantityUnit: string;
    instructions: string | null;
    usedCount: number;
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
    symptoms: string | null;
    examinationFindings: string | null;
    assessmentSummary: string | null;
    planSummary: string | null;
    organizationId: number;
    doctorName: string;
    organizationName: string;
  }>;
  conditions: Array<{
    id: number;
    doctorId: number;
    encounterId: number | null;
    conditionName: string;
    category: string;
    severity: string;
    clinicalStatus?: string;
    onsetDate: string | null;
    notes: string | null;
    doctorName: string;
  }>;
  allergies: Array<{
    id: number;
    doctorId: number;
    encounterId: number | null;
    substance: string;
    category: string;
    severity: string;
    reactionDescription: string | null;
    notes: string | null;
    doctorName: string;
  }>;
  prescriptions: Array<{
    id: number;
    doctorId: number;
    organizationId: number;
    encounterId: number | null;
    prescriptionNumber: string;
    status: string;
    issuedAt: string | null;
    validUntil: string | null;
    validUntilDate: string | null;
    clinicalReason: string | null;
    notesToPharmacist: string | null;
    doctorName: string;
    clinicName: string;
    medicationId: number | null;
    medicationName: string | null;
    frequencyText: string | null;
    quantityPrescribed: number | null;
    quantityUnit: string | null;
    instructions: string | null;
    items: Array<{
      id: number;
      medicationId: number | null;
      medicationName: string;
      strength: string | null;
      dosageForm: string | null;
      route: string | null;
      frequencyText: string | null;
      quantityPrescribed: number;
      quantityUnit: string;
      instructions: string | null;
    }>;
  }>;
}

export async function getDoctorWorkspace(): Promise<DoctorWorkspace> {
  const response = await apiClient.get<ApiSuccess<DoctorWorkspace>>("/doctor/workspace");
  return response.data.data;
}

export interface DoctorOverview {
  profile: {
    firstName: string;
    lastName: string;
    licenseNumber: string;
    specialty: string | null;
    phone: string | null;
    practitionerNumber: string;
    clinics: string[];
  };
  patientCount: number;
  visitCount: number;
  prescriptionCount: number;
  recentVisits: Array<{
    id: number;
    encounterNumber: string;
    startedAt: string;
    encounterType: string;
    chiefComplaint: string | null;
    status: string;
    patientName: string;
    patientId: number;
    organizationName: string;
  }>;
}

export async function getDoctorOverview(): Promise<DoctorOverview> {
  const response = await apiClient.get<ApiSuccess<DoctorOverview>>("/doctor/overview");
  return response.data.data;
}

export type DoctorVisit = DoctorOverview["recentVisits"][number];

export async function getDoctorVisits(): Promise<DoctorVisit[]> {
  const response = await apiClient.get<ApiSuccess<{ visits: DoctorVisit[] }>>("/doctor/visits");
  return response.data.data.visits;
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

export async function updateEncounter(id: number, input: Record<string, unknown>): Promise<void> {
  await apiClient.patch(`/doctor/encounters/${id}`, input);
}

export async function deleteEncounter(id: number): Promise<void> {
  await apiClient.delete(`/doctor/encounters/${id}`);
}

export async function updateCondition(id: number, input: Record<string, unknown>): Promise<void> {
  await apiClient.patch(`/doctor/conditions/${id}`, input);
}

export async function deleteCondition(id: number): Promise<void> {
  await apiClient.delete(`/doctor/conditions/${id}`);
}

export async function updateAllergy(id: number, input: Record<string, unknown>): Promise<void> {
  await apiClient.patch(`/doctor/allergies/${id}`, input);
}

export async function deleteAllergy(id: number): Promise<void> {
  await apiClient.delete(`/doctor/allergies/${id}`);
}

export async function updatePrescription(id: number, input: Record<string, unknown>): Promise<void> {
  await apiClient.patch(`/doctor/prescriptions/${id}`, input);
}

export async function deletePrescription(id: number): Promise<void> {
  await apiClient.delete(`/doctor/prescriptions/${id}`);
}
