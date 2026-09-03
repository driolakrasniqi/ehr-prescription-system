import type { NextFunction, Request, Response } from "express";

import { verifyAccessToken } from "../utils/jwt.js";

import { AppError } from "../utils/errors.js";

import { findUserById } from "../repositories/auth.repository.js";

const BEARER_PREFIX = "Bearer ";

export async function authenticate(
  request: Request,
  _response: Response,
  next: NextFunction
): Promise<void> {
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

  let payload;

  try {
    payload = verifyAccessToken(token);
  } catch {
    next(new AppError(401, "UNAUTHENTICATED", "The access token is invalid or has expired."));

    return;
  }

  try {
    const userId = Number(payload.sub);

    if (!Number.isSafeInteger(userId) || userId <= 0) {
      next(new AppError(401, "UNAUTHENTICATED", "The access token is invalid or has expired."));

      return;
    }

    const user = await findUserById(userId);

    if (!user || user.status !== "ACTIVE") {
      next(new AppError(401, "UNAUTHENTICATED", "This account is no longer active."));

      return;
    }

    if (payload.version !== user.token_version) {
      next(
        new AppError(
          401,
          "SESSION_INVALIDATED",
          "This session is no longer valid. Please sign in again."
        )
      );

      return;
    }

    request.user = {
      id: user.id,

      // Always use the current database role.
      // Never authorize from the possibly old JWT role.
      role: user.role_code
    };

    next();
  } catch (error) {
    next(error);
  }
}
