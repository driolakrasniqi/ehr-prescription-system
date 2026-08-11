import type { CookieOptions, NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { loginSchema } from "../validators/auth.validator.js";
import { parseWithSchema } from "../utils/validate.js";
import * as authService from "../services/auth.service.js";

// Scoped to the auth routes only, so the refresh token is never sent
// on unrelated API calls.
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
  response.cookie(env.REFRESH_COOKIE_NAME, token, {
    ...baseCookieOptions(),
    expires: expiresAt
  });
}

function clearRefreshCookie(response: Response): void {
  response.clearCookie(env.REFRESH_COOKIE_NAME, baseCookieOptions());
}

function getRequestMeta(request: Request): { ipAddress: string | null; userAgent: string | null } {
  return {
    ipAddress: request.ip ?? null,
    userAgent: request.get("user-agent") ?? null
  };
}

export async function login(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
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

export async function refresh(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const rawRefreshToken = request.cookies[env.REFRESH_COOKIE_NAME] as string | undefined;
    const result = await authService.refresh(rawRefreshToken, getRequestMeta(request));

    setRefreshCookie(response, result.refreshToken, result.refreshTokenExpiresAt);

    response.status(200).json({
      success: true,
      data: {
        accessToken: result.accessToken
      }
    });
  } catch (error) {
    clearRefreshCookie(response);
    next(error);
  }
}

export async function logout(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const rawRefreshToken = request.cookies[env.REFRESH_COOKIE_NAME] as string | undefined;
    await authService.logout(rawRefreshToken);

    clearRefreshCookie(response);

    response.status(200).json({
      success: true,
      data: null
    });
  } catch (error) {
    // Logout must be safe to call even on failure paths — still clear
    // the cookie client-side, but report the error.
    clearRefreshCookie(response);
    next(error);
  }
}

export async function me(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    if (!request.user) {
      throw new Error("req.user is missing — the 'authenticate' middleware must run before this handler.");
    }

    const user = await authService.getCurrentUser(request.user.id);

    response.status(200).json({
      success: true,
      data: { user }
    });
  } catch (error) {
    next(error);
  }
}
