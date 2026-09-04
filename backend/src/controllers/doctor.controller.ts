import type { NextFunction, Request, Response } from "express";
import * as service from "../services/doctor.service.js";
import { AppError } from "../utils/errors.js";
import { parseWithSchema } from "../utils/validate.js";
import {
  createAllergySchema,
  createConditionSchema,
  createEncounterSchema,
  createPrescriptionSchema,
  updateAllergySchema,
  updateConditionSchema,
  updateEncounterSchema,
  updatePrescriptionSchema,
  encounterIdSchema,
  conditionIdSchema,
  allergyIdSchema,
  prescriptionIdSchema,
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

export async function getOverview(request: Request, response: Response, next: NextFunction) {
  try {
    response.status(200).json({ success: true, data: await service.getOverview(userId(request)) });
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

export async function listVisits(request: Request, response: Response, next: NextFunction) {
  try {
    const visits = await service.listVisits(userId(request));
    response.status(200).json({ success: true, data: { visits } });
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

export async function updateEncounter(request: Request, response: Response, next: NextFunction) {
  try {
    const encounterId = parseWithSchema(encounterIdSchema, request.params.encounterId);
    const input = parseWithSchema(updateEncounterSchema, request.body);
    await service.updateEncounter(userId(request), encounterId, input, meta(request));
    response.status(200).json({ success: true, data: { updated: true } });
  } catch (error) {
    next(error);
  }
}

export async function deleteEncounter(request: Request, response: Response, next: NextFunction) {
  try {
    const encounterId = parseWithSchema(encounterIdSchema, request.params.encounterId);
    await service.deleteEncounter(userId(request), encounterId, meta(request));
    response.status(200).json({ success: true, data: { deleted: true } });
  } catch (error) {
    next(error);
  }
}

export async function updateCondition(request: Request, response: Response, next: NextFunction) {
  try {
    const conditionId = parseWithSchema(conditionIdSchema, request.params.conditionId);
    const input = parseWithSchema(updateConditionSchema, request.body);
    await service.updateCondition(userId(request), conditionId, input, meta(request));
    response.status(200).json({ success: true, data: { updated: true } });
  } catch (error) {
    next(error);
  }
}

export async function deleteCondition(request: Request, response: Response, next: NextFunction) {
  try {
    const conditionId = parseWithSchema(conditionIdSchema, request.params.conditionId);
    await service.deleteCondition(userId(request), conditionId, meta(request));
    response.status(200).json({ success: true, data: { deleted: true } });
  } catch (error) {
    next(error);
  }
}

export async function updateAllergy(request: Request, response: Response, next: NextFunction) {
  try {
    const allergyId = parseWithSchema(allergyIdSchema, request.params.allergyId);
    const input = parseWithSchema(updateAllergySchema, request.body);
    await service.updateAllergy(userId(request), allergyId, input, meta(request));
    response.status(200).json({ success: true, data: { updated: true } });
  } catch (error) {
    next(error);
  }
}

export async function deleteAllergy(request: Request, response: Response, next: NextFunction) {
  try {
    const allergyId = parseWithSchema(allergyIdSchema, request.params.allergyId);
    await service.deleteAllergy(userId(request), allergyId, meta(request));
    response.status(200).json({ success: true, data: { deleted: true } });
  } catch (error) {
    next(error);
  }
}

export async function updatePrescription(request: Request, response: Response, next: NextFunction) {
  try {
    const prescriptionId = parseWithSchema(prescriptionIdSchema, request.params.prescriptionId);
    const input = parseWithSchema(updatePrescriptionSchema, request.body);
    await service.updatePrescription(userId(request), prescriptionId, input, meta(request));
    response.status(200).json({ success: true, data: { updated: true } });
  } catch (error) {
    next(error);
  }
}

export async function deletePrescriptionRecord(
  request: Request,
  response: Response,
  next: NextFunction
) {
  try {
    const prescriptionId = parseWithSchema(prescriptionIdSchema, request.params.prescriptionId);
    await service.deletePrescription(userId(request), prescriptionId, meta(request));
    response.status(200).json({ success: true, data: { deleted: true } });
  } catch (error) {
    next(error);
  }
}
