import { apiClient } from "./client";

interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface PharmacistOverview {
  profile: {
    firstName: string;
    lastName: string;
    licenseNumber: string;
    phone: string | null;
    practitionerNumber: string;
    pharmacies: string[];
  };
  patientCount: number;
  prescriptionCount: number;
  recentPrescriptions: Array<{
    id: number;
    prescriptionNumber: string;
    issuedAt: string;
    patientName: string;
    patientId: number;
    medicationName: string | null;
    quantity: string | null;
  }>;
}

export async function getPharmacistOverview(): Promise<PharmacistOverview> {
  const response = await apiClient.get<ApiSuccess<PharmacistOverview>>("/pharmacist/overview");
  return response.data.data;
}
