import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import type { AccessTokenPayload, UserRole } from "../types/auth.types.js";

const ACCESS_TOKEN_TTL_SECONDS = env.ACCESS_TOKEN_TTL_MINUTES * 60;

const VALID_ROLES: UserRole[] = ["ADMIN", "DOCTOR", "PHARMACIST", "PATIENT"];

/**
 * Signs a short-lived access token.
 *
 * The token contains:
 * - User ID
 * - Current role
 * - Token version
 * - Token type
 *
 * It does not contain email, name, or clinical data.
 */
export function signAccessToken(userId: number, role: UserRole, tokenVersion: number): string {
  const payload: AccessTokenPayload = {
    sub: String(userId),
    role,
    version: tokenVersion,
    type: "access"
  };

  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: ACCESS_TOKEN_TTL_SECONDS
  });
}

/**
 * Verifies and decodes an access token.
 *
 * Throws when:
 * - The signature is invalid
 * - The token has expired
 * - The payload has an invalid structure
 * - The role is not supported
 * - The token version is invalid
 */
export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);

  if (typeof decoded === "string") {
    throw new Error("Unexpected JWT payload format.");
  }

  const sub = decoded["sub"];
  const role = decoded["role"];
  const version = decoded["version"];
  const type = decoded["type"];

  if (
    typeof sub !== "string" ||
    !/^[1-9]\d*$/.test(sub) ||
    typeof role !== "string" ||
    !VALID_ROLES.includes(role as UserRole) ||
    typeof version !== "number" ||
    !Number.isSafeInteger(version) ||
    version < 0 ||
    type !== "access"
  ) {
    throw new Error("Malformed access token payload.");
  }

  return {
    sub,
    role: role as UserRole,
    version,
    type: "access"
  };
}
