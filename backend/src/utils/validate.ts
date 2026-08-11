import type { ZodType } from "zod";
import { AppError } from "./errors.js";

/**
 * Parses `data` against `schema`. Returns the typed, parsed value on
 * success. Throws an AppError(400, "VALIDATION_ERROR") with per-field
 * details on failure, so controllers stay thin and error handling
 * stays centralized in errorHandler.ts.
 */
export function parseWithSchema<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);

  if (!result.success) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "The request data is invalid.",
      result.error.flatten().fieldErrors
    );
  }

  return result.data;
}
