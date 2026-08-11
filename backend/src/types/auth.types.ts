export type UserRole = "ADMIN" | "DOCTOR" | "PHARMACIST" | "PATIENT";

export type UserStatus = "PENDING" | "ACTIVE" | "LOCKED" | "DISABLED";

/**
 * Claims carried inside the short-lived JWT access token.
 * Intentionally minimal — no clinical or otherwise sensitive data.
 */
export interface AccessTokenPayload {
  sub: string;
  role: UserRole;
  type: "access";
}

/**
 * Set on `req.user` by the `authenticate` middleware once the access
 * token has been verified.
 */
export interface AuthenticatedUser {
  id: number;
  role: UserRole;
}

/**
 * Safe, public-facing representation of a user. Never includes
 * password_hash, refresh tokens, or other sensitive columns.
 */
export interface SafeUser {
  id: number;
  email: string;
  role: UserRole;
  displayName: string | null;
  status: UserStatus;
}
