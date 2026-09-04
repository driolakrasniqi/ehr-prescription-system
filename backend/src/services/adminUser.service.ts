import bcrypt from "bcryptjs";
import { env } from "../config/env.js";
import { randomBytes } from "node:crypto";
import * as repository from "../repositories/adminUser.repository.js";
import * as reportsRepository from "../repositories/adminReports.repository.js";
import * as authRepository from "../repositories/auth.repository.js";
import { listTrackedActivity, TRACKED_DOCTOR_ACTIONS, writeAuditEvent } from "../repositories/audit.repository.js";
import type { ManageableUserStatus, UserRole } from "../types/auth.types.js";
import type {
  CreateAdminInput,
  CreateOrganizationInput,
  CreatePatientInput,
  CreateStaffInput,
  OrganizationStatus,
  UpdateOrganizationInput,
  UpdateUserProfileInput
} from "../validators/adminUser.validator.js";
import { AppError } from "../utils/errors.js";
import type { RequestMeta } from "./auth.service.js";

export async function listUsers() {
  return repository.getAllUsers();
}

export async function listRoles() {
  return repository.getActiveRoles();
}

export async function listOrganizations() {
  return repository.getActiveOrganizations();
}

export async function listManagedOrganizations() {
  return repository.getAllOrganizations();
}

export async function getOverview() {
  const [stats, activity] = await Promise.all([repository.getOverviewStats(), listActivity()]);
  return {
    stats,
    recentActivity: activity.events.slice(0, 8)
  };
}

export async function getReports(period: reportsRepository.ReportPeriod) {
  return reportsRepository.getAdminReports(period);
}

function throwOrganizationConflict(error: unknown): never {
  if (
    typeof error === "object" &&
    error !== null &&
    "errno" in error &&
    (error as { errno?: number }).errno === 1062
  ) {
    throw new AppError(409, "CONFLICT", "Organization code or licence number is already in use.");
  }
  throw error;
}

function existingEmailConflictMessage(
  existingRole: UserRole,
  requestedRole: "DOCTOR" | "PHARMACIST" | "PATIENT"
): string {
  if (
    (existingRole === "DOCTOR" || existingRole === "PHARMACIST") &&
    (requestedRole === "DOCTOR" || requestedRole === "PHARMACIST") &&
    existingRole !== requestedRole
  ) {
    return [
      `This email already belongs to a ${existingRole.toLowerCase()}.`,
      "Doctor and pharmacist roles cannot be converted.",
      "Create a separate account with a different email."
    ].join(" ");
  }

  return "Email is already in use.";
}

export async function createOrganization(
  input: CreateOrganizationInput,
  currentAdminId: number,
  meta: RequestMeta
): Promise<number> {
  try {
    const organizationId = await repository.createOrganization(input);
    await writeAuditEvent({
      actorUserId: currentAdminId,
      actorRoleCode: "ADMIN",
      action: "ORGANIZATION_CREATED",
      entityType: "ORGANIZATION",
      entityId: organizationId,
      result: "SUCCESS",
      ...meta,
      metadata: { code: input.organizationCode, type: input.organizationType, name: input.name }
    });
    return organizationId;
  } catch (error) {
    return throwOrganizationConflict(error);
  }
}

export async function updateOrganization(
  organizationId: number,
  input: UpdateOrganizationInput,
  currentAdminId: number,
  meta: RequestMeta
) {
  const before = await repository.findOrganizationById(organizationId);
  if (!before) throw new AppError(404, "NOT_FOUND", "Organization not found.");
  if (before.organizationType !== input.organizationType && before.activePractitionerCount > 0) {
    throw new AppError(
      409,
      "CONFLICT",
      "The organization type cannot change while practitioners are assigned."
    );
  }
  try {
    await repository.updateOrganization(organizationId, input);
  } catch (error) {
    throwOrganizationConflict(error);
  }
  await writeAuditEvent({
    actorUserId: currentAdminId,
    actorRoleCode: "ADMIN",
    action: "ORGANIZATION_UPDATED",
    entityType: "ORGANIZATION",
    entityId: organizationId,
    result: "SUCCESS",
    ...meta,
    metadata: {
      previousCode: before.organizationCode,
      code: input.organizationCode,
      name: input.name
    }
  });
  return repository.findOrganizationById(organizationId);
}

export async function changeOrganizationStatus(
  organizationId: number,
  status: OrganizationStatus,
  currentAdminId: number,
  meta: RequestMeta
) {
  const before = await repository.findOrganizationById(organizationId);

  if (!before) {
    throw new AppError(404, "NOT_FOUND", "Organization not found.");
  }

  if (before.status === status) {
    return before;
  }

  const updated = await repository.updateOrganizationStatus(organizationId, status);

  if (!updated) {
    throw new AppError(404, "NOT_FOUND", "Organization not found.");
  }

  await writeAuditEvent({
    actorUserId: currentAdminId,
    actorRoleCode: "ADMIN",
    action: "ORGANIZATION_STATUS_CHANGED",
    entityType: "ORGANIZATION",
    entityId: organizationId,
    result: "SUCCESS",
    ...meta,
    metadata: {
      from: before.status,
      to: status,
      activePractitionerCount: before.activePractitionerCount
    }
  });

  return repository.findOrganizationById(organizationId);
}

export async function getUserDetails(userId: number) {
  const account = await repository.getUserAccountDetails(userId);
  if (!account) throw new AppError(404, "NOT_FOUND", "User not found.");

  if (account.role === "PATIENT") {
    const profile = await repository.getPatientProfile(userId);
    if (!profile) throw new AppError(409, "PROFILE_REQUIRED", "Patient profile not found.");
    return { account, profile };
  }

  if (account.role === "DOCTOR" || account.role === "PHARMACIST") {
    const profile = await repository.getPractitionerProfile(userId);
    if (!profile) throw new AppError(409, "PROFILE_REQUIRED", "Practitioner profile not found.");
    return { account, profile };
  }

  return { account, profile: { type: "ACCOUNT" as const } };
}

export async function updateProfile(
  userId: number,
  input: UpdateUserProfileInput,
  currentAdminId: number,
  meta: RequestMeta
) {
  const before = await repository.getUserAccountDetails(userId);
  if (!before) throw new AppError(404, "NOT_FOUND", "User not found.");

  const expectedType =
    before.role === "PATIENT"
      ? "PATIENT"
      : before.role === "DOCTOR" || before.role === "PHARMACIST"
        ? "PRACTITIONER"
        : "ACCOUNT";
  if (input.profileType !== expectedType) {
    throw new AppError(409, "CONFLICT", "The submitted profile does not match this account.");
  }
  if (input.profileType === "PRACTITIONER" && input.role !== before.role) {
    throw new AppError(
      409,
      "ROLE_TRANSITION_REQUIRES_PROFILE_WORKFLOW",
      "Doctor and pharmacist roles cannot be converted. Create a separate account when a person needs a different identity."
    );
  }
  if (userId === currentAdminId && input.profileType === "PRACTITIONER") {
    throw new AppError(
      403,
      "SELF_ROLE_CHANGE_NOT_ALLOWED",
      "You cannot convert your own administrator access."
    );
  }

  try {
    await repository.updateUserProfile(userId, input, currentAdminId);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "errno" in error &&
      (error as { errno?: number }).errno === 1062
    ) {
      throw new AppError(
        409,
        "CONFLICT",
        "Email, licence number, or organization assignment already exists."
      );
    }
    throw error;
  }

  const roleChanged = input.profileType === "PRACTITIONER" && input.role !== before.role;
  if (roleChanged) {
    await authRepository.revokeAllRefreshTokensForUser(userId);
    await authRepository.incrementTokenVersion(userId);
  }

  await writeAuditEvent({
    actorUserId: currentAdminId,
    actorRoleCode: "ADMIN",
    action: "USER_PROFILE_UPDATED",
    entityType: "USER",
    entityId: userId,
    result: "SUCCESS",
    ...meta,
    metadata: {
      profileType: input.profileType,
      roleChanged,
      email: input.email,
      name:
        input.profileType === "ACCOUNT"
          ? input.displayName
          : `${input.firstName} ${input.lastName}`.trim()
    }
  });

  return getUserDetails(userId);
}

export async function changeUserRole(
  userId: number,
  role: UserRole,
  currentAdminId: number,
  meta: RequestMeta
): Promise<void> {
  if (userId === currentAdminId && role !== "ADMIN") {
    throw new AppError(
      403,
      "SELF_ROLE_CHANGE_NOT_ALLOWED",
      "You cannot remove your own administrator role."
    );
  }

  const target = await authRepository.findUserById(userId);

  if (!target) {
    throw new AppError(404, "NOT_FOUND", "User not found.");
  }

  if (target.role_code === role) {
    return;
  }

  throw new AppError(
    409,
    "ROLE_TRANSITION_REQUIRES_PROFILE_WORKFLOW",
    "Roles cannot be converted. Create a separate account when a person needs a different identity."
  );
}

export async function changeUserStatus(
  userId: number,
  status: ManageableUserStatus,
  currentAdminId: number,
  meta: RequestMeta
): Promise<void> {
  if (userId === currentAdminId && status !== "ACTIVE") {
    throw new AppError(
      403,
      "SELF_STATUS_CHANGE_NOT_ALLOWED",
      "You cannot deactivate your own account."
    );
  }

  const target = await authRepository.findUserById(userId);

  if (!target) {
    throw new AppError(404, "NOT_FOUND", "User not found.");
  }

  if (
    target.role_code === "ADMIN" &&
    status !== "ACTIVE" &&
    (await repository.countActiveAdminsExcluding(userId)) === 0
  ) {
    throw new AppError(
      409,
      "LAST_ADMIN_PROTECTED",
      "The final active administrator cannot be deactivated."
    );
  }

  const updated = await repository.updateUserStatus(userId, status);

  if (!updated) {
    throw new AppError(404, "NOT_FOUND", "User not found.");
  }

  if (status !== "ACTIVE") {
    await authRepository.revokeAllRefreshTokensForUser(userId);

    await authRepository.incrementTokenVersion(userId);
  }

  await writeAuditEvent({
    actorUserId: currentAdminId,
    actorRoleCode: "ADMIN",
    action: "USER_STATUS_CHANGED",
    entityType: "USER",
    entityId: userId,
    result: "SUCCESS",
    ...meta,
    metadata: {
      from: target.status,
      to: status
    }
  });
}

export async function unlockUser(
  userId: number,
  currentAdminId: number,
  meta: RequestMeta
): Promise<void> {
  const target = await authRepository.findUserById(userId);

  if (!target) {
    throw new AppError(404, "NOT_FOUND", "User not found.");
  }

  if (target.status !== "LOCKED") {
    throw new AppError(409, "ACCOUNT_NOT_LOCKED", "This account is not locked.");
  }

  const unlocked = await repository.unlockUser(userId);

  if (!unlocked) {
    throw new AppError(409, "ACCOUNT_NOT_LOCKED", "This account is no longer locked.");
  }

  await writeAuditEvent({
    actorUserId: currentAdminId,
    actorRoleCode: "ADMIN",
    action: "ACCOUNT_UNLOCKED",
    entityType: "USER",
    entityId: userId,
    result: "SUCCESS",
    ...meta
  });
}

export async function resetUserPassword(
  userId: number,
  newPassword: string,
  currentAdminId: number,
  meta: RequestMeta
): Promise<void> {
  if (userId === currentAdminId) {
    throw new AppError(
      403,
      "SELF_PASSWORD_RESET_NOT_ALLOWED",
      "Change your own password from Settings."
    );
  }

  const target = await authRepository.findUserById(userId);

  if (!target) {
    throw new AppError(404, "NOT_FOUND", "User not found.");
  }

  const passwordHash = await bcrypt.hash(newPassword, env.BCRYPT_SALT_ROUNDS);
  await authRepository.updatePassword(userId, passwordHash);
  await authRepository.revokeAllRefreshTokensForUser(userId);

  if (target.status === "LOCKED") {
    await repository.unlockUser(userId);
  }

  await writeAuditEvent({
    actorUserId: currentAdminId,
    actorRoleCode: "ADMIN",
    action: "PASSWORD_RESET_BY_ADMIN",
    entityType: "USER",
    entityId: userId,
    result: "SUCCESS",
    ...meta,
    metadata: {
      unlocked: target.status === "LOCKED"
    }
  });
}

export async function createStaff(
  input: CreateStaffInput,
  currentAdminId: number,
  meta: RequestMeta
): Promise<number> {
  const normalizedEmail = input.email.trim().toLowerCase();

  const existingUser = await authRepository.findUserByEmail(normalizedEmail);

  if (existingUser) {
    throw new AppError(
      409,
      "CONFLICT",
      existingEmailConflictMessage(existingUser.role_code, input.role)
    );
  }

  const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_SALT_ROUNDS);

  const practitionerNumber = `PR-${randomBytes(8).toString("hex").toUpperCase()}`;

  try {
    const userId = await repository.createStaffAccount(
      {
        ...input,
        email: normalizedEmail
      },
      passwordHash,
      practitionerNumber
    );

    await writeAuditEvent({
      actorUserId: currentAdminId,
      actorRoleCode: "ADMIN",
      action: "STAFF_ACCOUNT_CREATED",
      entityType: "USER",
      entityId: userId,
      result: "SUCCESS",
      ...meta,
      metadata: {
        role: input.role,
        practitionerNumber,
        email: normalizedEmail,
        name: `${input.firstName} ${input.lastName}`.trim()
      }
    });

    return userId;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "errno" in error &&
      (
        error as {
          errno?: number;
        }
      ).errno === 1062
    ) {
      throw new AppError(
        409,
        "CONFLICT",
        "Email, practitioner number, or license number already exists."
      );
    }

    throw error;
  }
}

export async function createAdmin(
  input: CreateAdminInput,
  currentAdminId: number,
  meta: RequestMeta
): Promise<number> {
  const normalizedEmail = input.email.trim().toLowerCase();
  const existingUser = await authRepository.findUserByEmail(normalizedEmail);
  if (existingUser) {
    throw new AppError(
      409,
      "CONFLICT",
      existingEmailConflictMessage(existingUser.role_code, "PATIENT")
    );
  }

  const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_SALT_ROUNDS);
  try {
    const userId = await repository.createAdminAccount(
      { email: normalizedEmail, firstName: input.firstName, lastName: input.lastName },
      passwordHash
    );
    await writeAuditEvent({
      actorUserId: currentAdminId,
      actorRoleCode: "ADMIN",
      action: "ADMIN_ACCOUNT_CREATED",
      entityType: "USER",
      entityId: userId,
      result: "SUCCESS",
      ...meta,
      metadata: {
        email: normalizedEmail,
        name: `${input.firstName} ${input.lastName}`.trim()
      }
    });
    return userId;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "errno" in error &&
      (error as { errno?: number }).errno === 1062
    ) {
      throw new AppError(409, "CONFLICT", "Email is already in use.");
    }
    throw error;
  }
}

export async function createPatient(
  input: CreatePatientInput,
  currentAdminId: number,
  meta: RequestMeta
): Promise<number> {
  const normalizedEmail = input.email.trim().toLowerCase();
  const existingPatient = await authRepository.findUserByEmail(normalizedEmail);
  if (existingPatient) {
    throw new AppError(
      409,
      "CONFLICT",
      existingEmailConflictMessage(existingPatient.role_code, "PATIENT")
    );
  }

  const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_SALT_ROUNDS);
  const patientNumber = `PAT-${randomBytes(8).toString("hex").toUpperCase()}`;

  try {
    const userId = await repository.createPatientAccount(
      { ...input, email: normalizedEmail },
      passwordHash,
      patientNumber,
      currentAdminId
    );
    await writeAuditEvent({
      actorUserId: currentAdminId,
      actorRoleCode: "ADMIN",
      action: "PATIENT_ACCOUNT_CREATED",
      entityType: "USER",
      entityId: userId,
      result: "SUCCESS",
      ...meta,
      metadata: {
        patientNumber,
        email: normalizedEmail,
        name: `${input.firstName} ${input.lastName}`.trim()
      }
    });
    return userId;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "errno" in error &&
      (error as { errno?: number }).errno === 1062
    ) {
      throw new AppError(409, "CONFLICT", "Email or patient number already exists.");
    }
    throw error;
  }
}

async function findUserDeletionReason(
  userId: number,
  currentAdminId: number
): Promise<{ reason: string | null; patientId: number | null; practitionerId: number | null }> {
  if (userId === currentAdminId) {
    return { reason: "You cannot delete your own account.", patientId: null, practitionerId: null };
  }

  const target = await authRepository.findUserById(userId);
  if (!target) {
    throw new AppError(404, "NOT_FOUND", "User not found.");
  }

  const patientId = await repository.getPatientIdByUserId(userId);
  const practitionerId = await repository.getPractitionerIdByUserId(userId);

  if (target.role_code === "PATIENT") {
    if (!patientId) {
      throw new AppError(404, "NOT_FOUND", "Patient profile not found.");
    }
    const counts = await repository.getPatientRecordCounts(patientId);
    if (counts.encounters > 0 || counts.prescriptions > 0) {
      return {
        reason: [
          "This patient cannot be deleted because a doctor has already recorded a visit or prescription.",
          counts.encounters > 0 ? `Visits: ${counts.encounters}.` : "",
          counts.prescriptions > 0 ? `Prescriptions: ${counts.prescriptions}.` : ""
        ]
          .filter(Boolean)
          .join(" "),
        patientId,
        practitionerId
      };
    }
    if (counts.allergies > 0 || counts.conditions > 0) {
      return {
        reason:
          "This patient cannot be deleted because a doctor has already recorded allergies or conditions.",
        patientId,
        practitionerId
      };
    }
  } else if (target.role_code === "DOCTOR") {
    if (!practitionerId) {
      throw new AppError(404, "NOT_FOUND", "Doctor profile not found.");
    }
    const counts = await repository.getDoctorRecordCounts(practitionerId);
    if (
      counts.encounters > 0 ||
      counts.prescriptions > 0 ||
      counts.allergies > 0 ||
      counts.conditions > 0
    ) {
      return {
        reason:
          "This doctor cannot be deleted because they have recorded visits, prescriptions, or other clinical data.",
        patientId,
        practitionerId
      };
    }
  } else if (target.role_code === "PHARMACIST") {
    if (!practitionerId) {
      throw new AppError(404, "NOT_FOUND", "Pharmacist profile not found.");
    }
  } else if (target.role_code === "ADMIN") {
    if ((await repository.countActiveAdminsExcluding(userId)) === 0) {
      return {
        reason: "The last administrator cannot be deleted.",
        patientId,
        practitionerId
      };
    }
    const counts = await repository.getAdminDeletionCounts(userId);
    if (counts.createdPatients > 0) {
      return {
        reason:
          "This administrator cannot be deleted because they created patient records that are still in the system.",
        patientId,
        practitionerId
      };
    }
  }

  return { reason: null, patientId, practitionerId };
}

async function findOrganizationDeletionReason(organizationId: number): Promise<string | null> {
  const organization = await repository.findOrganizationById(organizationId);
  if (!organization) {
    throw new AppError(404, "NOT_FOUND", "Organization not found.");
  }

  const counts = await repository.getOrganizationDeletionCounts(organizationId);

  if (organization.organizationType === "CLINIC") {
    if (counts.doctors > 0) {
      return "This clinic cannot be deleted while doctors are assigned to it, including past assignments.";
    }
    if (counts.patients > 0) {
      return "This clinic cannot be deleted while patients are still linked to it.";
    }
    if (counts.encounters > 0 || counts.prescriptions > 0) {
      return "This clinic cannot be deleted because visits or prescriptions are still recorded there.";
    }
  } else if (organization.organizationType === "PHARMACY") {
    if (counts.doctors > 0) {
      return "This pharmacy cannot be deleted while doctors are assigned to it, including past assignments.";
    }
    if (counts.pharmacists > 0) {
      return "This pharmacy cannot be deleted while pharmacists are assigned to it, including past assignments.";
    }
  } else if (counts.doctors > 0 || counts.pharmacists > 0) {
    return "This organization cannot be deleted while professionals are assigned to it.";
  }

  return null;
}

export async function getUserDeletionCheck(userId: number, currentAdminId: number) {
  const { reason } = await findUserDeletionReason(userId, currentAdminId);
  return { canDelete: reason === null, reason };
}

export async function getOrganizationDeletionCheck(organizationId: number) {
  const reason = await findOrganizationDeletionReason(organizationId);
  return { canDelete: reason === null, reason };
}

export async function deleteUser(
  userId: number,
  currentAdminId: number,
  meta: RequestMeta
): Promise<void> {
  const target = await authRepository.findUserById(userId);
  if (!target) {
    throw new AppError(404, "NOT_FOUND", "User not found.");
  }

  const { reason, patientId, practitionerId } = await findUserDeletionReason(
    userId,
    currentAdminId
  );
  if (reason) {
    throw new AppError(409, "CONFLICT", reason);
  }

  await repository.deleteUserAccount(userId, patientId, practitionerId);
  await writeAuditEvent({
    actorUserId: currentAdminId,
    actorRoleCode: "ADMIN",
    action: "USER_DELETED",
    entityType: "USER",
    entityId: userId,
    result: "SUCCESS",
    ...meta,
    metadata: {
      role: target.role_code,
      email: target.email,
      name: target.display_name
    }
  });
}

export async function deleteOrganization(
  organizationId: number,
  currentAdminId: number,
  meta: RequestMeta
): Promise<void> {
  const organization = await repository.findOrganizationById(organizationId);
  if (!organization) {
    throw new AppError(404, "NOT_FOUND", "Organization not found.");
  }

  const reason = await findOrganizationDeletionReason(organizationId);
  if (reason) {
    throw new AppError(409, "CONFLICT", reason);
  }

  await repository.deleteOrganizationById(organizationId);
  await writeAuditEvent({
    actorUserId: currentAdminId,
    actorRoleCode: "ADMIN",
    action: "ORGANIZATION_DELETED",
    entityType: "ORGANIZATION",
    entityId: organizationId,
    result: "SUCCESS",
    ...meta,
    metadata: { name: organization.name, type: organization.organizationType }
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value) {
    return {};
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  if (typeof value === "object") {
    return value as Record<string, unknown>;
  }
  return {};
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function labelStatus(value: unknown): string {
  return asText(value)?.replaceAll("_", " ").toLowerCase() ?? "unknown";
}

function summarizeActivity(
  action: string,
  metadata: Record<string, unknown>,
  targetName: string
): string {
  switch (action) {
    case "STAFF_ACCOUNT_CREATED":
      return `Created ${labelStatus(metadata.role)} account${targetName ? ` for ${targetName}` : ""}`;
    case "ADMIN_ACCOUNT_CREATED":
      return `Created administrator account${targetName ? ` for ${targetName}` : ""}`;
    case "PATIENT_ACCOUNT_CREATED":
      return `Created patient account${targetName ? ` for ${targetName}` : ""}`;
    case "USER_PROFILE_UPDATED": {
      const parts = [`Updated profile${targetName ? ` for ${targetName}` : ""}`];
      if (asText(metadata.email)) {
        parts.push(`email ${asText(metadata.email)}`);
      }
      if (metadata.roleChanged) {
        parts.push("including role");
      }
      return parts.join(" · ");
    }
    case "USER_ROLE_CHANGED":
      return `Changed role from ${labelStatus(metadata.from)} to ${labelStatus(metadata.to)}`;
    case "USER_STATUS_CHANGED":
      return `Changed status from ${labelStatus(metadata.from)} to ${labelStatus(metadata.to)}`;
    case "ACCOUNT_UNLOCKED":
      return `Unlocked account${targetName ? ` for ${targetName}` : ""}`;
    case "PASSWORD_RESET_BY_ADMIN":
      return `Reset password${targetName ? ` for ${targetName}` : ""}`;
    case "USER_DELETED":
      return `Deleted ${labelStatus(metadata.role)} account${targetName ? ` (${targetName})` : ""}`;
    case "ORGANIZATION_CREATED":
      return `Created ${labelStatus(metadata.type)}${targetName ? ` ${targetName}` : ""}`;
    case "ORGANIZATION_UPDATED":
      return `Updated organization details${targetName ? ` for ${targetName}` : ""}`;
    case "ORGANIZATION_STATUS_CHANGED":
      return `Changed organization status from ${labelStatus(metadata.from)} to ${labelStatus(metadata.to)}`;
    case "ORGANIZATION_DELETED":
      return `Deleted ${labelStatus(metadata.type)}${targetName ? ` ${targetName}` : ""}`;
    case "ENCOUNTER_CREATED":
      return `Recorded a visit${targetName ? ` for ${targetName}` : ""}`;
    case "CONDITION_CREATED":
      return `Recorded a condition${targetName ? ` for ${targetName}` : ""}`;
    case "ALLERGY_CREATED":
      return `Recorded an allergy${targetName ? ` for ${targetName}` : ""}`;
    case "PRESCRIPTION_ISSUED": {
      const items = metadata.itemCount;
      const itemNote = typeof items === "number" && items > 0 ? ` (${items} ${items === 1 ? "item" : "items"})` : "";
      return `Issued a prescription${targetName ? ` for ${targetName}` : ""}${itemNote}`;
    }
    case "ENCOUNTER_UPDATED":
      return `Updated a visit${targetName ? ` for ${targetName}` : ""}`;
    case "ENCOUNTER_DELETED":
      return `Deleted a visit${targetName ? ` for ${targetName}` : ""}`;
    case "CONDITION_UPDATED":
      return `Updated a condition${targetName ? ` for ${targetName}` : ""}`;
    case "CONDITION_DELETED":
      return `Deleted a condition${targetName ? ` for ${targetName}` : ""}`;
    case "ALLERGY_UPDATED":
      return `Updated an allergy${targetName ? ` for ${targetName}` : ""}`;
    case "ALLERGY_DELETED":
      return `Deleted an allergy${targetName ? ` for ${targetName}` : ""}`;
    case "PRESCRIPTION_UPDATED":
      return `Updated a prescription${targetName ? ` for ${targetName}` : ""}`;
    case "PRESCRIPTION_DELETED":
      return `Deleted a prescription${targetName ? ` for ${targetName}` : ""}`;
    default:
      return action.replaceAll("_", " ").toLowerCase();
  }
}

const doctorActions = new Set<string>(TRACKED_DOCTOR_ACTIONS);

function recordKind(entityType: string): string {
  switch (entityType) {
    case "ORGANIZATION":
      return "Organization";
    case "ENCOUNTER":
      return "Visit";
    case "CONDITION":
      return "Condition";
    case "ALLERGY":
      return "Allergy";
    case "PRESCRIPTION":
      return "Prescription";
    default:
      return "Person";
  }
}

export async function listActivity(search = "") {
  const rows = await listTrackedActivity(search);
  const events = rows.map((row) => {
    const metadata = asRecord(row.metadata);
    const targetName =
      row.targetName ?? asText(metadata.name) ?? asText(metadata.email) ?? "Unknown record";
    const actorName = row.actorName ?? row.actorEmail ?? "System";
    const category = doctorActions.has(row.action) ? "CLINICAL" : "ACCOUNT";

    return {
      id: row.id,
      action: row.action,
      category,
      entityType: row.entityType,
      entityId: row.entityId,
      eventAt: new Date(row.eventAt).toISOString(),
      actorUserId: row.actorUserId,
      actorName,
      actorEmail: row.actorEmail,
      actorRole: row.actorRole,
      targetName,
      recordKind: recordKind(row.entityType),
      summary: summarizeActivity(row.action, metadata, targetName)
    };
  });

  const latestByPerson = events
    .filter((event) => event.category === "ACCOUNT" && event.entityType === "USER" && event.entityId != null)
    .reduce<
      Array<{
        entityId: number;
        personName: string;
        lastUpdatedAt: string;
        updatedBy: string;
        updatedByEmail: string | null;
        change: string;
      }>
    >((list, event) => {
      if (list.some((item) => item.entityId === event.entityId)) {
        return list;
      }
      list.push({
        entityId: event.entityId as number,
        personName: event.targetName,
        lastUpdatedAt: event.eventAt,
        updatedBy: event.actorName,
        updatedByEmail: event.actorEmail,
        change: event.summary
      });
      return list;
    }, []);

  const latestByDoctor = events
    .filter((event) => event.category === "CLINICAL" && event.actorUserId != null)
    .reduce<
      Array<{
        actorUserId: number;
        doctorName: string;
        doctorEmail: string | null;
        patientName: string;
        lastUpdatedAt: string;
        change: string;
      }>
    >((list, event) => {
      if (list.some((item) => item.actorUserId === event.actorUserId)) {
        return list;
      }
      list.push({
        actorUserId: event.actorUserId as number,
        doctorName: event.actorName,
        doctorEmail: event.actorEmail,
        patientName: event.targetName,
        lastUpdatedAt: event.eventAt,
        change: event.summary
      });
      return list;
    }, []);

  return { events, latestByPerson, latestByDoctor };
}
