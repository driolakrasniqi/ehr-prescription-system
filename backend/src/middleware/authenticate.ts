import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../utils/jwt.js";
import { AppError } from "../utils/errors.js";

const BEARER_PREFIX = "Bearer ";

/**
 * Requires a valid `Authorization: Bearer <token>` access token.
 * Attaches `{ id, role }` to `req.user` for downstream handlers.
 */
export function authenticate(request: Request, _response: Response, next: NextFunction): void {
  const header = request.get("authorization");

  if (!header || !header.startsWith(BEARER_PREFIX)) {
    next(new AppError(401, "UNAUTHENTICATED", "An access token is required."));
    return;
  }

  const token = header.slice(BEARER_PREFIX.length).trim();

  if (!token) {
    next(new AppError(401, "UNAUTHENTICATED", "An access token is required."));
    return;
  }

  try {
    const payload = verifyAccessToken(token);

    request.user = {
      id: Number(payload.sub),
      role: payload.role
    };

    next();
  } catch {
    next(new AppError(401, "UNAUTHENTICATED", "The access token is invalid or has expired."));
  }
}
