import type { NextFunction, Request, Response } from "express";
import * as service from "../services/doctor.service.js";
import { AppError } from "../utils/errors.js";
import { parseWithSchema } from "../utils/validate.js";
import {
  createAllergySchema,
  createConditionSchema,
  createEncounterSchema,
  createPrescriptionSchema,
  patientIdSchema,
  patientSearchSchema
} from "../validators/doctor.validator.js";

function userId(request: Request): number {
  if (!request.user) throw new AppError(401, "UNAUTHENTICATED", "Authentication is required.");
  return request.user.id;
}

function meta(request: Request) {
  return {
    ipAddress: request.ip ?? null,
    userAgent: request.get("user-agent") ?? null
  };
}

export async function getWorkspace(request: Request, response: Response, next: NextFunction) {
  try {
    response.status(200).json({ success: true, data: await service.getWorkspace(userId(request)) });
  } catch (error) {
    next(error);
  }
}

export async function listPatients(request: Request, response: Response, next: NextFunction) {
  try {
    const query = parseWithSchema(patientSearchSchema, request.query);
    const patients = await service.listPatients(userId(request), query.search);
    response.status(200).json({ success: true, data: { patients } });
  } catch (error) {
    next(error);
  }
}

export async function getPatient(request: Request, response: Response, next: NextFunction) {
  try {
    const patientId = parseWithSchema(patientIdSchema, request.params.patientId);
    response
      .status(200)
      .json({ success: true, data: await service.getPatient(userId(request), patientId) });
  } catch (error) {
    next(error);
  }
}

export async function createEncounter(request: Request, response: Response, next: NextFunction) {
  try {
    const input = parseWithSchema(createEncounterSchema, request.body);
    const encounterId = await service.createEncounter(userId(request), input, meta(request));
    response.status(201).json({ success: true, data: { encounterId } });
  } catch (error) {
    next(error);
  }
}

export async function createCondition(request: Request, response: Response, next: NextFunction) {
  try {
    const input = parseWithSchema(createConditionSchema, request.body);
    const conditionId = await service.createCondition(userId(request), input, meta(request));
    response.status(201).json({ success: true, data: { conditionId } });
  } catch (error) {
    next(error);
  }
}

export async function createAllergy(request: Request, response: Response, next: NextFunction) {
  try {
    const input = parseWithSchema(createAllergySchema, request.body);
    const allergyId = await service.createAllergy(userId(request), input, meta(request));
    response.status(201).json({ success: true, data: { allergyId } });
  } catch (error) {
    next(error);
  }
}

export async function createPrescription(request: Request, response: Response, next: NextFunction) {
  try {
    const input = parseWithSchema(createPrescriptionSchema, request.body);
    const prescriptionId = await service.createPrescription(userId(request), input, meta(request));
    response.status(201).json({ success: true, data: { prescriptionId } });
  } catch (error) {
    next(error);
  }
}
