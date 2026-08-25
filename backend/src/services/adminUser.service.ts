import bcrypt from "bcryptjs";
import { env } from "../config/env.js";
import * as repository from "../repositories/adminUser.repository.js";
import * as authRepository from "../repositories/auth.repository.js";
import { writeAuditEvent } from "../repositories/audit.repository.js";
import type { ManageableUserStatus, UserRole } from "../types/auth.types.js";
import type { CreateStaffInput } from "../validators/adminUser.validator.js";
import { AppError } from "../utils/errors.js";
import type { RequestMeta } from "./auth.service.js";

export async function listUsers() { return repository.getAllUsers(); }
export async function listRoles() { return repository.getActiveRoles(); }

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

  if (
    target.role_code === "ADMIN" &&
    role !== "ADMIN" &&
    await repository.countActiveAdminsExcluding(
      userId
    ) === 0
  ) {
    throw new AppError(
      409,
      "LAST_ADMIN_PROTECTED",
      "The final active administrator cannot be demoted."
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

export async function createStaff(input: CreateStaffInput, currentAdminId: number, meta: RequestMeta): Promise<number> {
  if (await authRepository.findUserByEmail(input.email.toLowerCase())) throw new AppError(409, "CONFLICT", "Email is already in use.");
  const hash = await bcrypt.hash(input.password, env.BCRYPT_SALT_ROUNDS);
  try {
    const userId = await repository.createStaffAccount(input, hash);
    await writeAuditEvent({ actorUserId: currentAdminId, actorRoleCode: "ADMIN", action: "STAFF_ACCOUNT_CREATED", entityType: "USER", entityId: userId, result: "SUCCESS", ...meta, metadata: { role: input.role } });
    return userId;
  } catch (error) {
    if (typeof error === "object" && error !== null && "errno" in error && (error as { errno?: number }).errno === 1062) throw new AppError(409, "CONFLICT", "Email, practitioner number, or license number already exists.");
    throw error;
  }
}
