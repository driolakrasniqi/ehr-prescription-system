import type { CookieOptions, NextFunction, Request, Response } from "express";

import { env } from "../config/env.js";

import { changePasswordSchema, loginSchema, registerSchema } from "../validators/auth.validator.js";

import { parseWithSchema } from "../utils/validate.js";

import { AppError } from "../utils/errors.js";

import * as authService from "../services/auth.service.js";

const REFRESH_COOKIE_PATH = "/api/v1/auth";

function baseCookieOptions(): CookieOptions {
  return {
    httpOnly: true,

    secure: env.NODE_ENV === "production",

    sameSite: "lax",

    path: REFRESH_COOKIE_PATH
  };
}

function setRefreshCookie(response: Response, token: string, expiresAt: Date): void {
  const maxAge = Math.max(0, expiresAt.getTime() - Date.now());

  response.cookie(env.REFRESH_COOKIE_NAME, token, {
    ...baseCookieOptions(),
    expires: expiresAt,
    maxAge
  });
}

function clearRefreshCookie(response: Response): void {
  response.clearCookie(env.REFRESH_COOKIE_NAME, baseCookieOptions());
}

function disableCaching(response: Response): void {
  response.set({
    "Cache-Control": "no-store, no-cache, must-revalidate, private",

    Pragma: "no-cache",

    Expires: "0"
  });
}

function getRequestMeta(request: Request): {
  ipAddress: string | null;
  userAgent: string | null;
} {
  return {
    ipAddress: request.ip ?? null,

    userAgent: request.get("user-agent") ?? null
  };
}

function getAuthenticatedUserId(request: Request): number {
  if (!request.user) {
    throw new AppError(401, "UNAUTHENTICATED", "Authentication is required.");
  }

  return request.user.id;
}

export async function register(
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  try {
    disableCaching(response);

    const input = parseWithSchema(registerSchema, request.body);

    const result = await authService.registerPatient(input, getRequestMeta(request));

    /*
     * Registration does not automatically
     * create a signed-in session. The user
     * must sign in after registration.
     */
    response.status(201).json({
      success: true,

      data: {
        user: result.user
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function login(
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  try {
    disableCaching(response);

    const input = parseWithSchema(loginSchema, request.body);

    const result = await authService.login(input, getRequestMeta(request));

    setRefreshCookie(response, result.refreshToken, result.refreshTokenExpiresAt);

    response.status(200).json({
      success: true,

      data: {
        accessToken: result.accessToken,

        user: result.user
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function refresh(
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  try {
    disableCaching(response);

    const rawRefreshToken = request.cookies[env.REFRESH_COOKIE_NAME] as string | undefined;

    const result = await authService.refresh(rawRefreshToken, getRequestMeta(request));

    /*
     * Refresh-token rotation:
     * replace the old cookie with the
     * newly generated token.
     */
    setRefreshCookie(response, result.refreshToken, result.refreshTokenExpiresAt);

    response.status(200).json({
      success: true,

      data: {
        accessToken: result.accessToken
      }
    });
  } catch (error) {
    /*
     * A failed refresh means the browser
     * should no longer keep the unusable
     * refresh-token cookie.
     */
    clearRefreshCookie(response);

    next(error);
  }
}

export async function logout(
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  try {
    disableCaching(response);

    const rawRefreshToken = request.cookies[env.REFRESH_COOKIE_NAME] as string | undefined;

    await authService.logout(rawRefreshToken, getRequestMeta(request));

    clearRefreshCookie(response);

    response.status(200).json({
      success: true,
      data: null
    });
  } catch (error) {
    /*
     * Logout must still remove the
     * browser cookie when server-side
     * revocation fails.
     */
    clearRefreshCookie(response);

    next(error);
  }
}

export async function me(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    disableCaching(response);

    const userId = getAuthenticatedUserId(request);

    const user = await authService.getCurrentUser(userId);

    response.status(200).json({
      success: true,

      data: {
        user
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function logoutAll(
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  try {
    disableCaching(response);

    const userId = getAuthenticatedUserId(request);

    await authService.logoutAll(userId, getRequestMeta(request));

    clearRefreshCookie(response);

    response.status(200).json({
      success: true,
      data: null
    });
  } catch (error) {
    /*
     * The local cookie should still be
     * cleared if the server operation
     * fails.
     */
    clearRefreshCookie(response);

    next(error);
  }
}

export async function changePassword(
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  try {
    disableCaching(response);

    const userId = getAuthenticatedUserId(request);

    const input = parseWithSchema(changePasswordSchema, request.body);

    await authService.changePassword(userId, input, getRequestMeta(request));

    /*
     * A successful password change
     * revokes existing sessions, so
     * remove the refresh cookie.
     */
    clearRefreshCookie(response);

    response.status(200).json({
      success: true,

      data: {
        message: "Password changed. Please sign in again."
      }
    });
  } catch (error) {
    /*
     * Do not clear the cookie when the
     * password change fails validation,
     * such as an incorrect current
     * password.
     */
    next(error);
  }
}
