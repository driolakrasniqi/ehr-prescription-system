import { apiClient } from "./client";
import type { UserRole, UserStatus } from "../auth/types";

interface ApiSuccess<T> {
  success: true;
  data: T;
}
export interface AdminUser {
  id: number;
  email: string;
  display_name: string | null;
  status: UserStatus;
  failed_login_count: number;
  locked_until: string | null;
  role_id: number;
  role_code: UserRole;
  role_name: string;
  created_at: string;
  profile_number: string | null;
  phone: string | null;
  organization_name: string | null;
  profile_complete: number;
}
export interface Role {
  id: number;
  code: UserRole;
  name: string;
}
export interface StaffInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;

  role: "DOCTOR" | "PHARMACIST";

  licenseNumber: string;
  specialty?: string;
  phone?: string;
  organizationId: number;
  positionTitle?: string;
}

export interface Organization {
  id: number;

  organizationCode: string;

  organizationType: "CLINIC" | "PHARMACY" | "LABORATORY" | "OTHER";

  name: string;
  licenseNumber: string | null;
  phone: string | null;
  email: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  postalCode: string | null;
  countryCode: string;
  status: OrganizationStatus;
  activePractitionerCount: number;
}

export type OrganizationStatus = "PENDING" | "ACTIVE" | "SUSPENDED" | "CLOSED";

export interface OrganizationInput {
  organizationCode: string;
  organizationType: "CLINIC" | "PHARMACY";
  name: string;
  licenseNumber: string;
  phone: string;
  email: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  postalCode: string;
  countryCode: string;
}

export interface CreateOrganizationInput extends OrganizationInput {
  status: OrganizationStatus;
}

export interface PatientInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  sex: "FEMALE" | "MALE";
  bloodType: BloodType;
  maritalStatus: MaritalStatus;
  smokingStatus: SmokingStatus;
  occupation?: string;
  phone?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  postalCode?: string;
  countryCode: string;
}
export type BloodType = "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-" | "UNKNOWN";
export type MaritalStatus = "SINGLE" | "MARRIED" | "DIVORCED" | "WIDOWED" | "OTHER" | "UNKNOWN";
export type SmokingStatus = "NEVER" | "FORMER" | "CURRENT" | "UNKNOWN";

export type EditableStatus = "PENDING" | "ACTIVE" | "DISABLED";
export interface AdminAccountDetails {
  id: number;
  email: string;
  displayName: string | null;
  role: UserRole;
  status: UserStatus;
}
export interface AdminPatientProfile {
  type: "PATIENT";
  patientNumber: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  sex: "FEMALE" | "MALE";
  bloodType: BloodType;
  maritalStatus: MaritalStatus;
  smokingStatus: SmokingStatus;
  occupation: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  postalCode: string | null;
  countryCode: string;
}
export interface AdminPractitionerProfile {
  type: "PRACTITIONER";
  practitionerNumber: string;
  firstName: string;
  lastName: string;
  licenseNumber: string;
  specialty: string | null;
  phone: string | null;
  organizationId: number | null;
  organizationName: string | null;
  positionTitle: string | null;
}
export interface AdminAccountProfile {
  type: "ACCOUNT";
}
export type AdminUserProfile = AdminPatientProfile | AdminPractitionerProfile | AdminAccountProfile;
export interface AdminUserDetails {
  account: AdminAccountDetails;
  profile: AdminUserProfile;
}

export type UpdateUserProfileInput =
  | { profileType: "ACCOUNT"; email: string; displayName: string }
  | {
      profileType: "PATIENT";
      email: string;
      firstName: string;
      lastName: string;
      dateOfBirth: string;
      sex: "FEMALE" | "MALE";
      bloodType: BloodType;
      maritalStatus: MaritalStatus;
      smokingStatus: SmokingStatus;
      occupation: string;
      phone: string;
      addressLine1: string;
      addressLine2: string;
      city: string;
      postalCode: string;
      countryCode: string;
    }
  | {
      profileType: "PRACTITIONER";
      role: "DOCTOR" | "PHARMACIST";
      email: string;
      firstName: string;
      lastName: string;
      licenseNumber: string;
      specialty: string;
      phone: string;
      organizationId: number;
      positionTitle: string;
    };

export async function getUsers() {
  const response = await apiClient.get<ApiSuccess<{ users: AdminUser[] }>>("/admin/users");
  return response.data.data.users;
}
export async function getRoles() {
  const response = await apiClient.get<ApiSuccess<{ roles: Role[] }>>("/admin/roles");
  return response.data.data.roles;
}
export async function updateRole(userId: number, role: UserRole) {
  await apiClient.patch(`/admin/users/${userId}/role`, { role });
}
export async function updateStatus(userId: number, status: "PENDING" | "ACTIVE" | "DISABLED") {
  await apiClient.patch(`/admin/users/${userId}/status`, { status });
}
export async function unlockUser(userId: number) {
  await apiClient.post(`/admin/users/${userId}/unlock`);
}
export async function resetUserPassword(
  userId: number,
  input: { newPassword: string; confirmPassword: string }
) {
  await apiClient.post(`/admin/users/${userId}/reset-password`, input);
}
export async function createStaff(input: StaffInput) {
  const response = await apiClient.post<ApiSuccess<{ userId: number }>>("/admin/staff", input);
  return response.data.data.userId;
}

export interface AdminInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export async function createAdmin(input: AdminInput) {
  const response = await apiClient.post<ApiSuccess<{ userId: number }>>("/admin/admins", input);
  return response.data.data.userId;
}
export async function createPatient(input: PatientInput) {
  const response = await apiClient.post<ApiSuccess<{ userId: number }>>("/admin/patients", input);
  return response.data.data.userId;
}
export async function getOrganizations(): Promise<Organization[]> {
  const response = await apiClient.get<
    ApiSuccess<{
      organizations: Organization[];
    }>
  >("/admin/organizations");

  return response.data.data.organizations;
}

export async function getManagedOrganizations(): Promise<Organization[]> {
  const response = await apiClient.get<ApiSuccess<{ organizations: Organization[] }>>(
    "/admin/organizations/manage"
  );
  return response.data.data.organizations;
}

export async function createOrganization(input: CreateOrganizationInput): Promise<number> {
  const response = await apiClient.post<ApiSuccess<{ organizationId: number }>>(
    "/admin/organizations",
    input
  );
  return response.data.data.organizationId;
}

export async function updateOrganization(
  organizationId: number,
  input: OrganizationInput
): Promise<Organization> {
  const response = await apiClient.patch<ApiSuccess<{ organization: Organization }>>(
    `/admin/organizations/${organizationId}`,
    input
  );
  return response.data.data.organization;
}

export async function updateOrganizationStatus(
  organizationId: number,
  status: OrganizationStatus
): Promise<Organization> {
  const response = await apiClient.patch<ApiSuccess<{ organization: Organization }>>(
    `/admin/organizations/${organizationId}/status`,
    { status }
  );
  return response.data.data.organization;
}

export async function getUserDetails(userId: number): Promise<AdminUserDetails> {
  const response = await apiClient.get<ApiSuccess<AdminUserDetails>>(`/admin/users/${userId}`);
  return response.data.data;
}

export async function updateUserProfile(
  userId: number,
  input: UpdateUserProfileInput
): Promise<AdminUserDetails> {
  const response = await apiClient.patch<ApiSuccess<AdminUserDetails>>(
    `/admin/users/${userId}/profile`,
    input
  );
  return response.data.data;
}

export async function deleteUser(userId: number): Promise<void> {
  await apiClient.delete(`/admin/users/${userId}`);
}

export async function deleteOrganization(organizationId: number): Promise<void> {
  await apiClient.delete(`/admin/organizations/${organizationId}`);
}

export interface DeletionCheck {
  canDelete: boolean;
  reason: string | null;
}

export async function checkOrganizationDeletion(organizationId: number): Promise<DeletionCheck> {
  const response = await apiClient.get<ApiSuccess<DeletionCheck>>(
    `/admin/organizations/${organizationId}/deletion`
  );
  return response.data.data;
}

export async function checkUserDeletion(userId: number): Promise<DeletionCheck> {
  const response = await apiClient.get<ApiSuccess<DeletionCheck>>(
    `/admin/users/${userId}/deletion`
  );
  return response.data.data;
}

export interface ActivityEvent {
  id: number;
  action: string;
  category: "ACCOUNT" | "CLINICAL";
  entityType: string;
  entityId: number | null;
  eventAt: string;
  actorUserId: number | null;
  actorName: string;
  actorEmail: string | null;
  actorRole: string | null;
  targetName: string;
  recordKind: string;
  summary: string;
}

export interface LatestPersonUpdate {
  entityId: number;
  personName: string;
  lastUpdatedAt: string;
  updatedBy: string;
  updatedByEmail: string | null;
  change: string;
}

export interface LatestDoctorUpdate {
  actorUserId: number;
  doctorName: string;
  doctorEmail: string | null;
  patientName: string;
  lastUpdatedAt: string;
  change: string;
}

export async function getActivity(search = "") {
  const response = await apiClient.get<
    ApiSuccess<{
      events: ActivityEvent[];
      latestByPerson: LatestPersonUpdate[];
      latestByDoctor: LatestDoctorUpdate[];
    }>
  >("/admin/activity", { params: search ? { search } : undefined });
  return response.data.data;
}

export interface AdminOverview {
  stats: {
    doctors: number;
    pharmacists: number;
    patients: number;
    admins: number;
    clinics: number;
    pharmacies: number;
  };
  recentActivity: ActivityEvent[];
}

export async function getAdminOverview(): Promise<AdminOverview> {
  const response = await apiClient.get<ApiSuccess<AdminOverview>>("/admin/overview");
  return response.data.data;
}
