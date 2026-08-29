import bcrypt from "bcryptjs";
import { env } from "../config/env.js";
import {  randomBytes} from "node:crypto";
import * as repository from "../repositories/adminUser.repository.js";
import * as authRepository from "../repositories/auth.repository.js";
import { writeAuditEvent } from "../repositories/audit.repository.js";
import type { ManageableUserStatus, UserRole } from "../types/auth.types.js";
import type {
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
  return repository
    .getActiveOrganizations();
} 

export async function listManagedOrganizations() {
  return repository.getAllOrganizations();
}

function throwOrganizationConflict(error: unknown): never {
  if (typeof error === "object" && error !== null && "errno" in error &&
      (error as { errno?: number }).errno === 1062) {
    throw new AppError(409, "CONFLICT", "Organization code or licence number is already in use.");
  }
  throw error;
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
      metadata: { code: input.organizationCode, type: input.organizationType }
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
    throw new AppError(409, "CONFLICT", "The organization type cannot change while practitioners are assigned.");
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
    metadata: { previousCode: before.organizationCode, code: input.organizationCode }
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

  const updated = await repository.updateOrganizationStatus(
    organizationId,
    status
  );

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

  const expectedType = before.role === "PATIENT"
    ? "PATIENT"
    : before.role === "DOCTOR" || before.role === "PHARMACIST"
      ? "PRACTITIONER"
      : "ACCOUNT";
  if (input.profileType !== expectedType) {
    throw new AppError(409, "CONFLICT", "The submitted profile does not match this account.");
  }
  if (userId === currentAdminId && input.profileType === "PRACTITIONER") {
    throw new AppError(403, "SELF_ROLE_CHANGE_NOT_ALLOWED", "You cannot convert your own administrator access.");
  }

  try {
    await repository.updateUserProfile(userId, input, currentAdminId);
  } catch (error) {
    if (typeof error === "object" && error !== null && "errno" in error &&
        (error as { errno?: number }).errno === 1062) {
      throw new AppError(409, "CONFLICT", "Email, licence number, or organization assignment already exists.");
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
    metadata: { profileType: input.profileType, roleChanged }
  });

  return getUserDetails(userId);
}

export async function changeUserRole(
  userId: number,
  role: UserRole,
  currentAdminId: number,
  meta: RequestMeta
): Promise<void> {
  if (
    userId === currentAdminId &&
    role !== "ADMIN"
  ) {
    throw new AppError(
      403,
      "SELF_ROLE_CHANGE_NOT_ALLOWED",
      "You cannot remove your own administrator role."
    );
  }

  const target =
    await authRepository.findUserById(
      userId
    );

  if (!target) {
    throw new AppError(
      404,
      "NOT_FOUND",
      "User not found."
    );
  }

  if (target.role_code === role) {
    return;
  }

  const professionalTransition =
    (target.role_code === "DOCTOR" || target.role_code === "PHARMACIST") &&
    (role === "DOCTOR" || role === "PHARMACIST");

  if (!professionalTransition) {
    throw new AppError(
      409,
      "ROLE_TRANSITION_REQUIRES_PROFILE_WORKFLOW",
      "Patient and administrator roles cannot be converted from People & Access. Use a separate account; professional role changes must be completed in People Directory."
    );
  }

  const hasProfile =
    await repository.hasRequiredProfile(
      userId,
      role
    );

  if (!hasProfile) {
    throw new AppError(
      409,
      "PROFILE_REQUIRED",
      `A ${role.toLowerCase()} profile is required before assigning this role.`
    );
  }

  const roleRecord =
    await repository.findRoleByCode(role);

  if (!roleRecord) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "The selected role does not exist."
    );
  }

  const updated =
    await repository.updateUserRole(
      userId,
      roleRecord.id
    );

  if (!updated) {
    throw new AppError(
      404,
      "NOT_FOUND",
      "User not found."
    );
  }

  await authRepository
    .revokeAllRefreshTokensForUser(userId);

  await authRepository
    .incrementTokenVersion(userId);

  await writeAuditEvent({
    actorUserId: currentAdminId,
    actorRoleCode: "ADMIN",
    action: "USER_ROLE_CHANGED",
    entityType: "USER",
    entityId: userId,
    result: "SUCCESS",
    ...meta,
    metadata: {
      from: target.role_code,
      to: role
    }
  });
}

export async function changeUserStatus(
  userId: number,
  status: ManageableUserStatus,
  currentAdminId: number,
  meta: RequestMeta
): Promise<void> {
  if (
    userId === currentAdminId &&
    status !== "ACTIVE"
  ) {
    throw new AppError(
      403,
      "SELF_STATUS_CHANGE_NOT_ALLOWED",
      "You cannot deactivate your own account."
    );
  }

  const target =
    await authRepository.findUserById(
      userId
    );

  if (!target) {
    throw new AppError(
      404,
      "NOT_FOUND",
      "User not found."
    );
  }

  if (
    target.role_code === "ADMIN" &&
    status !== "ACTIVE" &&
    await repository.countActiveAdminsExcluding(
      userId
    ) === 0
  ) {
    throw new AppError(
      409,
      "LAST_ADMIN_PROTECTED",
      "The final active administrator cannot be deactivated."
    );
  }

  const updated =
    await repository.updateUserStatus(
      userId,
      status
    );

  if (!updated) {
    throw new AppError(
      404,
      "NOT_FOUND",
      "User not found."
    );
  }

  if (status !== "ACTIVE") {
    await authRepository
      .revokeAllRefreshTokensForUser(userId);

    await authRepository
      .incrementTokenVersion(userId);
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
    throw new AppError(
      404,
      "NOT_FOUND",
      "User not found."
    );
  }

  if (target.status !== "LOCKED") {
    throw new AppError(
      409,
      "ACCOUNT_NOT_LOCKED",
      "This account is not locked."
    );
  }

  const unlocked = await repository.unlockUser(userId);

  if (!unlocked) {
    throw new AppError(
      409,
      "ACCOUNT_NOT_LOCKED",
      "This account is no longer locked."
    );
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

export async function createStaff(
  input: CreateStaffInput,
  currentAdminId: number,
  meta: RequestMeta
): Promise<number> {
  const normalizedEmail =
    input.email
      .trim()
      .toLowerCase();

  const existingUser =
    await authRepository
      .findUserByEmail(
        normalizedEmail
      );

  if (existingUser) {
    throw new AppError(
      409,
      "CONFLICT",
      "Email is already in use."
    );
  }

  const passwordHash =
    await bcrypt.hash(
      input.password,
      env.BCRYPT_SALT_ROUNDS
    );

  const practitionerNumber =
    `PR-${randomBytes(8)
      .toString("hex")
      .toUpperCase()}`;

  try {
    const userId =
      await repository
        .createStaffAccount(
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
      action:
        "STAFF_ACCOUNT_CREATED",
      entityType: "USER",
      entityId: userId,
      result: "SUCCESS",
      ...meta,
      metadata: {
        role: input.role,
        practitionerNumber
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

export async function createPatient(
  input: CreatePatientInput,
  currentAdminId: number,
  meta: RequestMeta
): Promise<number> {
  const normalizedEmail = input.email.trim().toLowerCase();
  if (await authRepository.findUserByEmail(normalizedEmail)) {
    throw new AppError(409, "CONFLICT", "Email is already in use.");
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
      metadata: { patientNumber }
    });
    return userId;
  } catch (error) {
    if (typeof error === "object" && error !== null && "errno" in error &&
        (error as { errno?: number }).errno === 1062) {
      throw new AppError(409, "CONFLICT", "Email or patient number already exists.");
    }
    throw error;
  }
}
