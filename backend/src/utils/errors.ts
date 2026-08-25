export type ErrorCode =
  | "VALIDATION_ERROR"
  | "INVALID_CREDENTIALS"
  | "ACCOUNT_LOCKED"
  | "ACCOUNT_NOT_LOCKED"
  | "ACCOUNT_DISABLED"
  | "ACCOUNT_NOT_ACTIVE"
  | "SESSION_INVALIDATED"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "SELF_ROLE_CHANGE_NOT_ALLOWED"
  | "SELF_STATUS_CHANGE_NOT_ALLOWED"
  | "LAST_ADMIN_PROTECTED"
  | "PROFILE_REQUIRED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

/**
 * A known, expected application error. The centralized error handler
 * uses `statusCode` and `code` to build a consistent API response and
 * never exposes anything beyond `message`/`details` to the client.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly details?: unknown;

  constructor(statusCode: number, code: ErrorCode, message: string, details?: unknown) {
    super(message);

    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;

    Error.captureStackTrace?.(this, AppError);
  }
}
