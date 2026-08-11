import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import type { AccessTokenPayload, UserRole } from "../types/auth.types.js";

const ACCESS_TOKEN_TTL_SECONDS = env.ACCESS_TOKEN_TTL_MINUTES * 60;

/**
 * Signs a short-lived access token. Only carries the user id, role,
 * and token type — no email, name, or clinical data.
 */
export function signAccessToken(userId: number, role: UserRole): string {
  const payload: AccessTokenPayload = {
    sub: String(userId),
    role,
    type: "access"
  };

  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: ACCESS_TOKEN_TTL_SECONDS
  });
}

/**
 * Verifies and decodes an access token. Throws if the signature,
 * expiration, or payload shape is invalid.
 */
export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);

  if (typeof decoded === "string") {
    throw new Error("Unexpected JWT payload format.");
  }

  const sub = decoded["sub"];
  const role = decoded["role"] as UserRole | undefined;
  const type = decoded["type"];

  if (typeof sub !== "string" || !role || type !== "access") {
    throw new Error("Malformed access token payload.");
  }

  return { sub, role, type: "access" };
}
