import type { NextFunction, Request, Response } from "express";
import * as service from "../services/patientPortal.service.js";
import { AppError } from "../utils/errors.js";

export async function getDashboard(
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!request.user) {
      throw new AppError(401, "UNAUTHENTICATED", "Authentication is required.");
    }
    const dashboard = await service.getDashboard(request.user.id);
    response.status(200).json({ success: true, data: dashboard });
  } catch (error) {
    next(error);
  }
}
