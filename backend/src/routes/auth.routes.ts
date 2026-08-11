import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { env } from "../config/env.js";
import { authenticate } from "../middleware/authenticate.js";
import { AppError } from "../utils/errors.js";
import * as authController from "../controllers/auth.controller.js";

// HTTP-level brute-force protection, independent of the per-account
// lockout implemented in auth.service.ts (which tracks failed
// attempts against a specific user regardless of source IP).
const loginRateLimiter = rateLimit({
  windowMs: env.LOGIN_RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
  limit: env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_request, _response, next) => {
    next(new AppError(429, "RATE_LIMITED", "Too many login attempts. Please try again later."));
  }
});

export const authRouter = Router();

authRouter.post("/login", loginRateLimiter, authController.login);
authRouter.post("/refresh", authController.refresh);
authRouter.post("/logout", authController.logout);
authRouter.get("/me", authenticate, authController.me);
