import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/errors.js";

/**
 * Mounted after all routes. Returns the consistent
 * { success: false, error: { code, message } } shape.
 */
export function notFoundHandler(_request: Request, response: Response): void {
  response.status(404).json({
    success: false,
    error: {
      code: "NOT_FOUND",
      message: "The requested endpoint does not exist."
    }
  });
}

/**
 * Centralized error handler. Must be registered last, after every
 * route and after notFoundHandler. Never leaks stack traces or raw
 * database errors to the client.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(error: unknown, _request: Request, response: Response, _next: NextFunction): void {
  if (error instanceof AppError) {
    response.status(error.statusCode).json({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {})
      }
    });
    return;
  }

  if (error instanceof ZodError) {
    response.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "The request data is invalid.",
        details: error.flatten().fieldErrors
      }
    });
    return;
  }

  console.error(error);

  response.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message: "An internal server error occurred."
    }
  });
}
