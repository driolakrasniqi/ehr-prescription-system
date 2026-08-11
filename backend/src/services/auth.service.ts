import bcrypt from "bcryptjs";
import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";
import { signAccessToken } from "../utils/jwt.js";
import { generateRefreshToken, hashRefreshToken } from "../utils/tokens.js";
import * as authRepository from "../repositories/auth.repository.js";
import type { UserAuthRecord } from "../repositories/auth.repository.js";
import type { LoginInput } from "../validators/auth.validator.js";
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

export async function login(input: LoginInput, meta: RequestMeta): Promise<LoginResult> {
  const normalizedEmail = input.email.toLowerCase().trim();
  const user = await authRepository.findUserByEmail(normalizedEmail);

  if (!user) {
    // Same error as a wrong password, so login never reveals whether
    // an email address is registered.
    throw invalidCredentialsError();
  }

  if (user.status === "DISABLED") {
    throw new AppError(401, "ACCOUNT_DISABLED", "This account has been disabled. Contact an administrator.");
  }

  if (user.status === "PENDING") {
    throw new AppError(401, "ACCOUNT_NOT_ACTIVE", "This account has not been activated yet.");
  }

  // Local view of the failed-attempt counter for this attempt. If the
  // account was LOCKED but the lock window has already elapsed, treat
  // it as a fresh start rather than rejecting outright.
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

    if (shouldLock) {
      throw accountLockedError();
    }

    throw invalidCredentialsError();
  }

  await authRepository.registerSuccessfulLogin(user.id);

  const accessToken = signAccessToken(user.id, user.role_code);
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

  return {
    accessToken,
    refreshToken,
    refreshTokenExpiresAt,
    user: toSafeUser(user, "ACTIVE")
  };
}

export async function refresh(rawRefreshToken: string | undefined, meta: RequestMeta): Promise<RefreshResult> {
  if (!rawRefreshToken) {
    throw new AppError(401, "UNAUTHENTICATED", "No refresh token was provided.");
  }

  const tokenHash = hashRefreshToken(rawRefreshToken);
  const record = await authRepository.findRefreshTokenByHash(tokenHash);

  if (!record) {
    throw new AppError(401, "UNAUTHENTICATED", "The refresh token is invalid.");
  }

  if (record.revoked_at !== null) {
    // Token reuse: either a stale rotated token or a stolen one being
    // replayed. Reject; do not rotate or issue new tokens.
    throw new AppError(401, "UNAUTHENTICATED", "The refresh token has already been used or revoked.");
  }

  if (record.expires_at.getTime() <= Date.now()) {
    throw new AppError(401, "UNAUTHENTICATED", "The refresh token has expired.");
  }

  const user = await authRepository.findUserById(record.user_id);

  if (!user || user.status !== "ACTIVE") {
    throw new AppError(401, "UNAUTHENTICATED", "The account associated with this session is no longer active.");
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

  const accessToken = signAccessToken(user.id, user.role_code);

  return {
    accessToken,
    refreshToken: newRefreshToken,
    refreshTokenExpiresAt: newExpiresAt
  };
}

export async function logout(rawRefreshToken: string | undefined): Promise<void> {
  if (!rawRefreshToken) {
    return;
  }

  const tokenHash = hashRefreshToken(rawRefreshToken);
  const record = await authRepository.findRefreshTokenByHash(tokenHash);

  if (record && record.revoked_at === null) {
    await authRepository.revokeRefreshTokenById(record.id);
  }
}

export async function getCurrentUser(userId: number): Promise<SafeUser> {
  const user = await authRepository.findUserById(userId);

  if (!user) {
    throw new AppError(401, "UNAUTHENTICATED", "The authenticated user no longer exists.");
  }

  return toSafeUser(user);
}
