import { apiClient } from "./client";

interface ApiSuccess<T> {
  success: true;
  data: T;
}

export type ReportPeriod = "30d" | "90d" | "12m" | "all";
export type ReportPair = { label: string; count: number };

export interface DoctorPerformanceRow {
  doctorName: string;
  specialty: string;
  uniquePatients: number;
  encounters: number;
  completed: number;
  inProgress: number;
  planned: number;
  cancelled: number;
  enteredInError: number;
  completedRate: number;
  averagePerDay: number;
  prescriptions: number;
  cancelledPrescriptions: number;
  cancelledPrescriptionRate: number;
  prescriptionsPerEncounter: number;
  diagnoses: number;
  allergies: number;
  activeDays: number;
  lastActivity: string | null;
  byClinic: ReportPair[];
}

export interface AdminReports {
  period: ReportPeriod;
  generatedAt: string;
  overview: Record<string, number>;
  users: {
    byRole: ReportPair[];
    byStatus: ReportPair[];
    registeredByMonth: ReportPair[];
    lockedAccounts: number;
    pendingActivation: number;
    loggedInRecently: number;
    neverLoggedIn: number;
    failedLoginAttempts: number;
    activityByRole: ReportPair[];
  };
  doctors: {
    total: number;
    active: number;
    inactive: number;
    bySpecialty: ReportPair[];
    byClinic: ReportPair[];
    byAccountStatus: ReportPair[];
    withActiveOrg: number;
    withoutActiveOrg: number;
    withPrimaryOrg: number;
    byPosition: ReportPair[];
    addedByMonth: ReportPair[];
    recentlyActive: number;
    inactiveInPeriod: number;
  };
  doctorPerformance: DoctorPerformanceRow[];
  encounters: {
    total: number;
    byStatus: ReportPair[];
    byType: ReportPair[];
    byDoctor: ReportPair[];
    byClinic: ReportPair[];
    byMonth: ReportPair[];
    uniquePatients: number;
    newPatients: number;
    returningPatients: number;
    completedRate: number;
    cancelledRate: number;
    withPrescription: number;
    withoutPrescription: number;
    withDiagnosis: number;
    withoutDiagnosis: number;
    withAllergy: number;
    byAge: ReportPair[];
    bySex: ReportPair[];
  };
  patients: {
    total: number;
    byStatus: ReportPair[];
    bySex: ReportPair[];
    byAge: ReportPair[];
    byBlood: ReportPair[];
    byMarital: ReportPair[];
    bySmoking: ReportPair[];
    byCity: ReportPair[];
    byCountry: ReportPair[];
    registeredByMonth: ReportPair[];
    withEncounters: number;
    withoutEncounters: number;
    withActivePrescriptions: number;
    withActiveDiagnoses: number;
    withActiveAllergies: number;
    uniqueByDoctor: ReportPair[];
    returning: number;
  };
  clinical: {
    diagnoses: Record<string, number | ReportPair[]>;
    allergies: Record<string, number | ReportPair[]>;
  };
  prescriptions: {
    total: number;
    byStatus: ReportPair[];
    byDoctor: ReportPair[];
    byClinic: ReportPair[];
    byMonth: ReportPair[];
    activeValid: number;
    expired: number;
    expiringSoon: number;
    cancelled: number;
    cancelledRate: number;
    withEncounter: number;
    withoutEncounter: number;
    averagePerEncounter: number;
    uniquePatients: number;
    withMultipleMedications: number;
    averageItems: number;
    bySignature: ReportPair[];
    medications: Record<string, number | ReportPair[]>;
  };
  organizations: {
    total: number;
    byType: ReportPair[];
    byStatus: ReportPair[];
    byCity: ReportPair[];
    staff: Array<{
      name: string;
      type: string;
      doctors: number;
      pharmacists: number;
      activeStaff: number;
    }>;
    activity: Array<{
      name: string;
      type: string;
      encounters: number;
      uniquePatients: number;
      prescriptions: number;
      diagnoses: number;
    }>;
    pharmacists: Array<{
      name: string;
      pharmacy: string;
      status: string;
      lastLogin: string | null;
    }>;
    withoutActiveStaff: number;
    withoutActivity: number;
  };
  security: {
    totalEvents: number;
    successful: number;
    denied: number;
    failed: number;
    byRole: ReportPair[];
    topActions: ReportPair[];
    byMonth: ReportPair[];
    doctorActivity: number;
    adminActivity: number;
    failedLogins: number;
    lockedAccounts: number;
    loggedInRecently: number;
    neverLoggedIn: number;
    activeSessions: number;
    revokedSessions: number;
    expiredSessions: number;
    devices: ReportPair[];
    failedIps: ReportPair[];
    recentSecurity: Array<{ action: string; result: string; eventAt: string }>;
  };
}

export async function getAdminReports(period: ReportPeriod): Promise<AdminReports> {
  const response = await apiClient.get<ApiSuccess<AdminReports>>("/admin/reports", {
    params: { period, _: Date.now() },
    headers: { "Cache-Control": "no-cache", Pragma: "no-cache" }
  });
  return response.data.data;
}
