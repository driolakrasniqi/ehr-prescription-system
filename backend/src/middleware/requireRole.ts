import type { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/errors.js";
import type { UserRole } from "../types/auth.types.js";

/**
 * Authorization guard. Must run after `authenticate`. Rejects with
 * 403 if the authenticated user's role is not in `allowedRoles`.
 *
 * Usage: router.get("/doctor-only", authenticate, requireRole("DOCTOR"), handler)
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return function roleGuard(request: Request, _response: Response, next: NextFunction): void {
    if (!request.user) {
      next(new AppError(401, "UNAUTHENTICATED", "Authentication is required."));
      return;
    }

    if (!allowedRoles.includes(request.user.role)) {
      next(new AppError(403, "FORBIDDEN", "You do not have permission to perform this action."));
      return;
    }

    next();
  };
}
