export type UserRole = "ADMIN" | "DOCTOR" | "PHARMACIST" | "PATIENT";

export type UserStatus = "PENDING" | "ACTIVE" | "LOCKED" | "DISABLED";

/**
 * Safe user shape returned by /auth/login, /auth/me. Mirrors the
 * backend's SafeUser — never includes password or token data.
 */
export interface AuthenticatedUser {
  id: number;
  email: string;
  role: UserRole;
  displayName: string | null;
  status: UserStatus;
}
