import type { NextFunction, Request, Response } from "express";
import * as service from "../services/pharmacistPatient.service.js";
import { AppError } from "../utils/errors.js";
import { parseWithSchema } from "../utils/validate.js";
import {
  pharmacistPatientIdSchema,
  pharmacistPatientSearchSchema
} from "../validators/pharmacistPatient.validator.js";

function userId(request: Request): number {
  if (!request.user) throw new AppError(401, "UNAUTHENTICATED", "Authentication is required.");
  return request.user.id;
}

export async function listPatients(request: Request, response: Response, next: NextFunction) {
  try {
    const query = parseWithSchema(pharmacistPatientSearchSchema, request.query);
    const patients = await service.listPatients(userId(request), query.search);
    response.status(200).json({ success: true, data: { patients } });
  } catch (error) {
    next(error);
  }
}

export async function getPatientRecord(request: Request, response: Response, next: NextFunction) {
  try {
    const patientId = parseWithSchema(pharmacistPatientIdSchema, request.params.patientId);
    response.status(200).json({
      success: true,
      data: await service.getPatientRecord(userId(request), patientId)
    });
  } catch (error) {
    next(error);
  }
}

export async function getOwnPrescriptionRecord(
  request: Request,
  response: Response,
  next: NextFunction
) {
  try {
    response.status(200).json({
      success: true,
      data: await service.getOwnPrescriptionRecord(userId(request))
    });
  } catch (error) {
    next(error);
  }
}
