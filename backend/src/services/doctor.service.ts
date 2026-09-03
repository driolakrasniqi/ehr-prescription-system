import crypto from "node:crypto";
import * as repository from "../repositories/doctor.repository.js";
import { writeAuditEvent } from "../repositories/audit.repository.js";
import { AppError } from "../utils/errors.js";
import type { RequestMeta } from "./auth.service.js";
import type {
  CreateAllergyInput,
  CreateConditionInput,
  CreateEncounterInput,
  CreatePrescriptionInput
} from "../validators/doctor.validator.js";

async function requireDoctor(
  userId: number
): Promise<[repository.DoctorContextRow, ...repository.DoctorContextRow[]]> {
  const contexts = await repository.getDoctorContexts(userId);
  if (!contexts.length) {
    throw new AppError(403, "FORBIDDEN", "An active clinic assignment is required.");
  }
  return contexts as [repository.DoctorContextRow, ...repository.DoctorContextRow[]];
}

async function requirePatient(patientId: number): Promise<void> {
  if (!(await repository.patientExists(patientId))) {
    throw new AppError(404, "NOT_FOUND", "Patient not found.");
  }
}

function requireOrganization(
  contexts: Awaited<ReturnType<typeof repository.getDoctorContexts>>,
  organizationId: number
) {
  const context = contexts.find((item) => item.organizationId === organizationId);
  if (!context) {
    throw new AppError(403, "FORBIDDEN", "You are not assigned to this active clinic.");
  }
  return context;
}

async function validateEncounter(
  encounterId: number | undefined,
  patientId: number,
  doctorId: number
): Promise<void> {
  if (
    encounterId &&
    !(await repository.encounterBelongsToPatientAndDoctor(encounterId, patientId, doctorId))
  ) {
    throw new AppError(400, "VALIDATION_ERROR", "The selected encounter is invalid.");
  }
}

function recordNumber(prefix: string): string {
  return `${prefix}-${Date.now()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

export async function getWorkspace(userId: number) {
  const contexts = await requireDoctor(userId);
  const medications = await repository.listActiveMedications();
  return {
    doctor: {
      practitionerId: contexts[0].practitionerId,
      firstName: contexts[0].firstName,
      lastName: contexts[0].lastName
    },
    organizations: contexts.map(({ organizationId, organizationName }) => ({
      id: organizationId,
      name: organizationName
    })),
    medications
  };
}

export async function listPatients(userId: number, search: string) {
  await requireDoctor(userId);
  return repository.listPatients(search);
}

export async function getPatient(userId: number, patientId: number) {
  await requireDoctor(userId);
  const details = await repository.getPatientDetails(patientId);
  if (!details) throw new AppError(404, "NOT_FOUND", "Patient not found.");
  return details;
}

export async function createEncounter(
  userId: number,
  input: CreateEncounterInput,
  meta: RequestMeta
) {
  const contexts = await requireDoctor(userId);
  const context = requireOrganization(contexts, input.organizationId);
  await requirePatient(input.patientId);
  const encounterId = await repository.createEncounter(
    input,
    context.practitionerId,
    recordNumber("ENC")
  );
  await writeAuditEvent({
    actorUserId: userId,
    actorRoleCode: "DOCTOR",
    action: "ENCOUNTER_CREATED",
    entityType: "ENCOUNTER",
    entityId: encounterId,
    result: "SUCCESS",
    ...meta,
    metadata: { patientId: input.patientId, organizationId: input.organizationId }
  });
  return encounterId;
}

export async function createCondition(
  userId: number,
  input: CreateConditionInput,
  meta: RequestMeta
) {
  const contexts = await requireDoctor(userId);
  await requirePatient(input.patientId);
  await validateEncounter(input.encounterId, input.patientId, contexts[0].practitionerId);
  const conditionId = await repository.createCondition(input, contexts[0].practitionerId);
  await writeAuditEvent({
    actorUserId: userId,
    actorRoleCode: "DOCTOR",
    action: "CONDITION_CREATED",
    entityType: "CONDITION",
    entityId: conditionId,
    result: "SUCCESS",
    ...meta,
    metadata: { patientId: input.patientId }
  });
  return conditionId;
}

export async function createAllergy(userId: number, input: CreateAllergyInput, meta: RequestMeta) {
  const contexts = await requireDoctor(userId);
  await requirePatient(input.patientId);
  await validateEncounter(input.encounterId, input.patientId, contexts[0].practitionerId);
  const allergyId = await repository.createAllergy(input, contexts[0].practitionerId);
  await writeAuditEvent({
    actorUserId: userId,
    actorRoleCode: "DOCTOR",
    action: "ALLERGY_CREATED",
    entityType: "ALLERGY",
    entityId: allergyId,
    result: "SUCCESS",
    ...meta,
    metadata: { patientId: input.patientId }
  });
  return allergyId;
}

export async function createPrescription(
  userId: number,
  input: CreatePrescriptionInput,
  meta: RequestMeta
) {
  const contexts = await requireDoctor(userId);
  const context = requireOrganization(contexts, input.organizationId);
  await requirePatient(input.patientId);
  await validateEncounter(input.encounterId, input.patientId, context.practitionerId);
  const prescriptionId = await repository.createPrescription(
    input,
    context.practitionerId,
    recordNumber("RX")
  );
  await writeAuditEvent({
    actorUserId: userId,
    actorRoleCode: "DOCTOR",
    action: "PRESCRIPTION_ISSUED",
    entityType: "PRESCRIPTION",
    entityId: prescriptionId,
    result: "SUCCESS",
    ...meta,
    metadata: { patientId: input.patientId, itemCount: input.items.length }
  });
  return prescriptionId;
}
