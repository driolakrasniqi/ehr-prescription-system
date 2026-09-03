import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";

import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";
import { signAccessToken } from "../utils/jwt.js";
import { generateRefreshToken, hashRefreshToken } from "../utils/tokens.js";

import * as authRepository from "../repositories/auth.repository.js";
import { writeAuditEvent } from "../repositories/audit.repository.js";

import type { UserAuthRecord } from "../repositories/auth.repository.js";
import type {
  ChangePasswordInput,
  LoginInput,
  RegisterInput
} from "../validators/auth.validator.js";
import type { SafeUser } from "../types/auth.types.js";

const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const ACCOUNT_LOCK_DURATION_MS = 15 * 60 * 1000;

const REFRESH_TOKEN_TTL_MS = env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

export interface RequestMeta {
  ipAddress: string | null;
  userAgent: string | null;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  user: SafeUser;
}

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export interface RegisterResult {
  user: SafeUser;
}

function toSafeUser(user: UserAuthRecord, statusOverride?: SafeUser["status"]): SafeUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role_code,
    displayName: user.display_name,
    status: statusOverride ?? user.status
  };
}

function invalidCredentialsError(): AppError {
  return new AppError(401, "INVALID_CREDENTIALS", "The email or password is incorrect.");
}

function accountLockedError(): AppError {
  return new AppError(
    401,
    "ACCOUNT_LOCKED",
    "This account is temporarily locked due to repeated failed login attempts. Try again later."
  );
}

export async function registerPatient(
  input: RegisterInput,
  meta: RequestMeta
): Promise<RegisterResult> {
  const normalizedEmail = input.email.toLowerCase().trim();

  const existingUser = await authRepository.findUserByEmail(normalizedEmail);

  if (existingUser) {
    throw new AppError(409, "CONFLICT", "An account with this email address already exists.");
  }

  const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_SALT_ROUNDS);

  const displayName = `${input.firstName.trim()} ${input.lastName.trim()}`;

  const patientNumber = `PAT-${randomBytes(6).toString("hex").toUpperCase()}`;

  try {
    const userId = await authRepository.createPatientAccount({
      email: normalizedEmail,
      passwordHash,
      displayName,
      patientNumber,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      dateOfBirth: input.dateOfBirth,
      sex: input.sex,
      phone: input.phone?.trim() || null
    });

    await writeAuditEvent({
      actorUserId: userId,
      actorRoleCode: "PATIENT",
      action: "USER_REGISTERED",
      entityType: "USER",
      entityId: userId,
      result: "SUCCESS",
      ...meta
    });

    return {
      user: {
        id: userId,
        email: normalizedEmail,
        role: "PATIENT",
        displayName,
        status: "ACTIVE"
      }
    };
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "errno" in error &&
      (error as { errno?: number }).errno === 1062
    ) {
      throw new AppError(409, "CONFLICT", "An account with these details already exists.");
    }

    throw error;
  }
}

export async function login(input: LoginInput, meta: RequestMeta): Promise<LoginResult> {
  const normalizedEmail = input.email.toLowerCase().trim();

  const user = await authRepository.findUserByEmail(normalizedEmail);

  if (!user) {
    // Use the same error as an incorrect password so the login
    // endpoint does not reveal whether an email is registered.
    await writeAuditEvent({
      action: "LOGIN_FAILED",
      entityType: "USER",
      result: "DENIED",
      ...meta,
      metadata: {
        reason: "INVALID_CREDENTIALS"
      }
    });

    throw invalidCredentialsError();
  }

  if (user.status === "DISABLED") {
    throw new AppError(
      401,
      "ACCOUNT_DISABLED",
      "This account has been disabled. Contact an administrator."
    );
  }

  if (user.status === "PENDING") {
    throw new AppError(401, "ACCOUNT_NOT_ACTIVE", "This account has not been activated yet.");
  }

  // If a previous lock has expired, the failed-login counter
  // starts again from zero.
  let failedLoginCount = user.failed_login_count;

  if (user.status === "LOCKED") {
    const lockStillActive = user.locked_until !== null && user.locked_until.getTime() > Date.now();

    if (lockStillActive) {
      throw accountLockedError();
    }

    failedLoginCount = 0;
  }

  const passwordMatches = await bcrypt.compare(input.password, user.password_hash);

  if (!passwordMatches) {
    const nextFailedCount = failedLoginCount + 1;

    const shouldLock = nextFailedCount >= MAX_FAILED_LOGIN_ATTEMPTS;

    const lockedUntil = shouldLock ? new Date(Date.now() + ACCOUNT_LOCK_DURATION_MS) : null;

    await authRepository.registerFailedLogin(
      user.id,
      nextFailedCount,
      lockedUntil,
      shouldLock ? "LOCKED" : "ACTIVE"
    );

    await writeAuditEvent({
      actorUserId: user.id,
      actorRoleCode: user.role_code,
      action: shouldLock ? "ACCOUNT_LOCKED" : "LOGIN_FAILED",
      entityType: "USER",
      entityId: user.id,
      result: "DENIED",
      ...meta,
      metadata: {
        failedAttempt: nextFailedCount
      }
    });

    if (shouldLock) {
      throw accountLockedError();
    }

    throw invalidCredentialsError();
  }

  await authRepository.registerSuccessfulLogin(user.id);

  const accessToken = signAccessToken(user.id, user.role_code, user.token_version);

  const refreshToken = generateRefreshToken();

  const refreshTokenHash = hashRefreshToken(refreshToken);

  const refreshTokenExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

  await authRepository.insertRefreshToken({
    userId: user.id,
    tokenHash: refreshTokenHash,
    expiresAt: refreshTokenExpiresAt,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent
  });

  await writeAuditEvent({
    actorUserId: user.id,
    actorRoleCode: user.role_code,
    action: "LOGIN_SUCCEEDED",
    entityType: "USER",
    entityId: user.id,
    result: "SUCCESS",
    ...meta
  });

  return {
    accessToken,
    refreshToken,
    refreshTokenExpiresAt,
    user: toSafeUser(user, "ACTIVE")
  };
}

export async function refresh(
  rawRefreshToken: string | undefined,
  meta: RequestMeta
): Promise<RefreshResult> {
  if (!rawRefreshToken) {
    throw new AppError(401, "UNAUTHENTICATED", "No refresh token was provided.");
  }

  const tokenHash = hashRefreshToken(rawRefreshToken);

  const record = await authRepository.findRefreshTokenByHash(tokenHash);

  if (!record) {
    throw new AppError(401, "UNAUTHENTICATED", "The refresh token is invalid.");
  }

  if (record.revoked_at !== null) {
    // A revoked token being reused can indicate token theft.
    // Revoke every refresh token and invalidate existing
    // access tokens for the associated account.
    await authRepository.revokeAllRefreshTokensForUser(record.user_id);

    await authRepository.incrementTokenVersion(record.user_id);

    await writeAuditEvent({
      actorUserId: record.user_id,
      action: "REFRESH_TOKEN_REUSE_DETECTED",
      entityType: "USER",
      entityId: record.user_id,
      result: "DENIED",
      ...meta
    });

    throw new AppError(
      401,
      "UNAUTHENTICATED",
      "The refresh token has already been used or revoked."
    );
  }

  if (record.expires_at.getTime() <= Date.now()) {
    throw new AppError(401, "UNAUTHENTICATED", "The refresh token has expired.");
  }

  const user = await authRepository.findUserById(record.user_id);

  if (!user || user.status !== "ACTIVE") {
    throw new AppError(
      401,
      "UNAUTHENTICATED",
      "The account associated with this session is no longer active."
    );
  }

  const newRefreshToken = generateRefreshToken();

  const newTokenHash = hashRefreshToken(newRefreshToken);

  const newExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

  await authRepository.rotateRefreshToken({
    oldTokenId: record.id,
    userId: record.user_id,
    newTokenHash,
    newExpiresAt,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent
  });

  const accessToken = signAccessToken(user.id, user.role_code, user.token_version);

  await writeAuditEvent({
    actorUserId: user.id,
    actorRoleCode: user.role_code,
    action: "TOKEN_REFRESHED",
    entityType: "USER",
    entityId: user.id,
    result: "SUCCESS",
    ...meta
  });

  return {
    accessToken,
    refreshToken: newRefreshToken,
    refreshTokenExpiresAt: newExpiresAt
  };
}

export async function logout(
  rawRefreshToken: string | undefined,
  meta?: RequestMeta
): Promise<void> {
  if (!rawRefreshToken) {
    return;
  }

  const tokenHash = hashRefreshToken(rawRefreshToken);

  const record = await authRepository.findRefreshTokenByHash(tokenHash);

  if (record && record.revoked_at === null) {
    await authRepository.revokeRefreshTokenById(record.id);

    await writeAuditEvent({
      actorUserId: record.user_id,
      action: "LOGOUT",
      entityType: "USER",
      entityId: record.user_id,
      result: "SUCCESS",
      ...(meta ?? {})
    });
  }
}

export async function logoutAll(userId: number, meta: RequestMeta): Promise<void> {
  const user = await authRepository.findUserById(userId);

  await authRepository.revokeAllRefreshTokensForUser(userId);

  await authRepository.incrementTokenVersion(userId);

  await writeAuditEvent({
    actorUserId: userId,
    actorRoleCode: user?.role_code ?? null,
    action: "LOGOUT_ALL",
    entityType: "USER",
    entityId: userId,
    result: "SUCCESS",
    ...meta
  });
}

export async function changePassword(
  userId: number,
  input: ChangePasswordInput,
  meta: RequestMeta
): Promise<void> {
  const user = await authRepository.findUserById(userId);

  if (!user || user.status !== "ACTIVE") {
    throw new AppError(401, "UNAUTHENTICATED", "The account is not active.");
  }

  const currentPasswordMatches = await bcrypt.compare(input.currentPassword, user.password_hash);

  if (!currentPasswordMatches) {
    throw invalidCredentialsError();
  }

  const passwordHash = await bcrypt.hash(input.newPassword, env.BCRYPT_SALT_ROUNDS);

  // updatePassword also increments token_version.
  await authRepository.updatePassword(userId, passwordHash);

  await authRepository.revokeAllRefreshTokensForUser(userId);

  await writeAuditEvent({
    actorUserId: userId,
    actorRoleCode: user.role_code,
    action: "PASSWORD_CHANGED",
    entityType: "USER",
    entityId: userId,
    result: "SUCCESS",
    ...meta
  });
}

export async function getCurrentUser(userId: number): Promise<SafeUser> {
  const user = await authRepository.findUserById(userId);

  if (!user) {
    throw new AppError(401, "UNAUTHENTICATED", "The authenticated user no longer exists.");
  }

  return toSafeUser(user);
}
