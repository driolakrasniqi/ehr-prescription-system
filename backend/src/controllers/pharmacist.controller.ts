import type { NextFunction, Request, Response } from "express";
import * as service from "../services/pharmacist.service.js";
import { AppError } from "../utils/errors.js";

function userId(request: Request): number {
  if (!request.user) throw new AppError(401, "UNAUTHENTICATED", "Authentication is required.");
  return request.user.id;
}

export async function getWorkspace(request: Request, response: Response, next: NextFunction) {
  try {
    response.status(200).json({ success: true, data: await service.getWorkspace(userId(request)) });
  } catch (error) {
    next(error);
  }
}

export async function getOverview(request: Request, response: Response, next: NextFunction) {
  try {
    response.status(200).json({ success: true, data: await service.getOverview(userId(request)) });
  } catch (error) {
    next(error);
  }
}
