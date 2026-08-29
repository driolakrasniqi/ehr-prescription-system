import { apiClient } from "./client";

interface ApiSuccess<T> { success: true; data: T }

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
