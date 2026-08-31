import { apiClient } from "./client";

interface ApiSuccess<T> { success: true; data: T }

export type PatientMaritalStatus =
  | "SINGLE" | "MARRIED" | "DIVORCED" | "WIDOWED" | "OTHER" | "UNKNOWN";
export type PatientSmokingStatus = "NEVER" | "FORMER" | "CURRENT" | "UNKNOWN";

export interface PatientProfile {
  patientNumber: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  sex: "FEMALE" | "MALE";
  bloodType: string;
  maritalStatus: PatientMaritalStatus;
  occupation: string | null;
  smokingStatus: PatientSmokingStatus;
  phone: string | null;
  email: string;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  postalCode: string | null;
  countryCode: string;
  status: "ACTIVE" | "INACTIVE" | "DECEASED" | "MERGED";
  createdAt: string;
  updatedAt: string;
}

export interface UpdatePatientProfileInput {
  phone: string;
  occupation: string;
  maritalStatus: PatientMaritalStatus;
  smokingStatus: PatientSmokingStatus;
  addressLine1: string;
  addressLine2: string;
  city: string;
  postalCode: string;
  countryCode: string;
}

export interface PatientDashboardData {
  patient: {
    id: number; patientNumber: string; firstName: string; lastName: string;
    dateOfBirth: string; sex: "FEMALE" | "MALE"; bloodType: string;
  };
  summary: {
    activePrescriptions: number; upcomingAppointments: number;
    activeAllergies: number; activeConditions: number;
  };
  recentPrescriptions: Array<{
    id: number; prescriptionNumber: string; status: string;
    issuedAt: string | null; validUntil: string | null;
    doctorName: string; organizationName: string;
    items: Array<{
      id: number; medicationName: string; strength: string; dosageForm: string;
      frequencyText: string; instructions: string | null;
    }>;
  }>;
  recentEncounters: Array<{
    id: number; encounterNumber: string; startedAt: string; encounterType: string;
    chiefComplaint: string | null; status: string; doctorName: string;
    organizationName: string;
  }>;
  upcomingAppointments: Array<{
    id: number; appointmentNumber: string; scheduledStart: string; scheduledEnd: string;
    appointmentType: string; status: string; reason: string | null;
    practitionerName: string; organizationName: string;
  }>;
}

export async function getPatientDashboard(): Promise<PatientDashboardData> {
  const response = await apiClient.get<ApiSuccess<PatientDashboardData>>("/patient/dashboard");
  return response.data.data;
}

export async function getPatientProfile(): Promise<PatientProfile> {
  const response = await apiClient.get<ApiSuccess<{ profile: PatientProfile }>>("/patient/profile");
  return response.data.data.profile;
}

export async function updatePatientProfile(
  input: UpdatePatientProfileInput
): Promise<PatientProfile> {
  const response = await apiClient.patch<ApiSuccess<{ profile: PatientProfile }>>(
    "/patient/profile",
    input
  );
  return response.data.data.profile;
}
