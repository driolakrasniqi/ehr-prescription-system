import type { NextFunction, Request, Response } from "express";
import * as service from "../services/patientPortal.service.js";
import { AppError } from "../utils/errors.js";
import { updateOwnPatientProfileSchema } from "../validators/patientPortal.validator.js";

function requireUser(request: Request) {
  if (!request.user) {
    throw new AppError(401, "UNAUTHENTICATED", "Authentication is required.");
  }
  return request.user;
}

export async function getProfile(
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = requireUser(request);
    const profile = await service.getProfile(user.id);
    response.status(200).json({ success: true, data: { profile } });
  } catch (error) {
    next(error);
  }
}

export async function updateProfile(
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = requireUser(request);
    const input = updateOwnPatientProfileSchema.parse(request.body);
    const profile = await service.updateProfile(user.id, input, {
      ipAddress: request.ip ?? null,
      userAgent: request.get("user-agent") ?? null
    });
    response.status(200).json({ success: true, data: { profile } });
  } catch (error) {
    next(error);
  }
}

export async function getDashboard(
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = requireUser(request);
    const dashboard = await service.getDashboard(user.id);
    response.status(200).json({ success: true, data: dashboard });
  } catch (error) {
    next(error);
  }
}
