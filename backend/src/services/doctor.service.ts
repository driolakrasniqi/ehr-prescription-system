import crypto from "node:crypto";
import * as repository from "../repositories/doctor.repository.js";
import { writeAuditEvent } from "../repositories/audit.repository.js";
import { AppError } from "../utils/errors.js";
import type { RequestMeta } from "./auth.service.js";
import type {
  CreateAllergyInput,
  CreateConditionInput,
  CreateEncounterInput,
  CreatePrescriptionInput,
  UpdateAllergyInput,
  UpdateConditionInput,
  UpdateEncounterInput,
  UpdatePrescriptionInput
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
  const [medications, therapies] = await Promise.all([
    repository.listActiveMedications(),
    repository.listDoctorTherapies(contexts[0].practitionerId)
  ]);
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
    medications,
    therapies
  };
}

export async function getOverview(userId: number) {
  const contexts = await requireDoctor(userId);
  const doctor = contexts[0];
  const overview = await repository.getDoctorOverview(doctor.practitionerId);
  return {
    profile: {
      firstName: doctor.firstName,
      lastName: doctor.lastName,
      licenseNumber: doctor.licenseNumber,
      specialty: doctor.specialty,
      phone: doctor.phone,
      practitionerNumber: doctor.practitionerNumber,
      clinics: contexts.map((item) => item.organizationName)
    },
    ...overview
  };
}

export async function listPatients(userId: number, search: string) {
  await requireDoctor(userId);
  return repository.listPatients(search);
}

export async function listVisits(userId: number) {
  const contexts = await requireDoctor(userId);
  return repository.listDoctorVisits(contexts[0].practitionerId);
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

function denyUnlessOwner(ownerDoctorId: number, currentDoctorId: number): void {
  if (ownerDoctorId !== currentDoctorId) {
    throw new AppError(403, "FORBIDDEN", "You can only change records that you created.");
  }
}

async function requireOwnedEncounter(encounterId: number, doctorId: number) {
  const record = await repository.findEncounterOwner(encounterId);
  if (!record) throw new AppError(404, "NOT_FOUND", "Encounter not found.");
  denyUnlessOwner(record.doctorId, doctorId);
  return record;
}

async function requireOwnedCondition(conditionId: number, doctorId: number) {
  const record = await repository.findConditionOwner(conditionId);
  if (!record) throw new AppError(404, "NOT_FOUND", "Condition not found.");
  denyUnlessOwner(record.doctorId, doctorId);
  return record;
}

async function requireOwnedAllergy(allergyId: number, doctorId: number) {
  const record = await repository.findAllergyOwner(allergyId);
  if (!record) throw new AppError(404, "NOT_FOUND", "Allergy not found.");
  denyUnlessOwner(record.doctorId, doctorId);
  return record;
}

async function requireOwnedPrescription(prescriptionId: number, doctorId: number) {
  const record = await repository.findPrescriptionOwner(prescriptionId);
  if (!record) throw new AppError(404, "NOT_FOUND", "Prescription not found.");
  denyUnlessOwner(record.doctorId, doctorId);
  return record;
}

export async function updateEncounter(
  userId: number,
  encounterId: number,
  input: UpdateEncounterInput,
  meta: RequestMeta
) {
  const contexts = await requireDoctor(userId);
  const doctorId = contexts[0].practitionerId;
  const record = await requireOwnedEncounter(encounterId, doctorId);
  requireOrganization(contexts, input.organizationId);
  await repository.updateEncounter(encounterId, input);
  await writeAuditEvent({
    actorUserId: userId,
    actorRoleCode: "DOCTOR",
    action: "ENCOUNTER_UPDATED",
    entityType: "ENCOUNTER",
    entityId: encounterId,
    result: "SUCCESS",
    ...meta,
    metadata: { patientId: record.patientId }
  });
}

export async function deleteEncounter(userId: number, encounterId: number, meta: RequestMeta) {
  const contexts = await requireDoctor(userId);
  const record = await requireOwnedEncounter(encounterId, contexts[0].practitionerId);
  await repository.deleteEncounter(encounterId);
  await writeAuditEvent({
    actorUserId: userId,
    actorRoleCode: "DOCTOR",
    action: "ENCOUNTER_DELETED",
    entityType: "ENCOUNTER",
    entityId: encounterId,
    result: "SUCCESS",
    ...meta,
    metadata: { patientId: record.patientId }
  });
}

export async function updateCondition(
  userId: number,
  conditionId: number,
  input: UpdateConditionInput,
  meta: RequestMeta
) {
  const contexts = await requireDoctor(userId);
  const doctorId = contexts[0].practitionerId;
  const record = await requireOwnedCondition(conditionId, doctorId);
  await requirePatient(record.patientId);
  await validateEncounter(input.encounterId, record.patientId, doctorId);
  await repository.updateCondition(conditionId, input);
  await writeAuditEvent({
    actorUserId: userId,
    actorRoleCode: "DOCTOR",
    action: "CONDITION_UPDATED",
    entityType: "CONDITION",
    entityId: conditionId,
    result: "SUCCESS",
    ...meta,
    metadata: { patientId: record.patientId }
  });
}

export async function deleteCondition(userId: number, conditionId: number, meta: RequestMeta) {
  const contexts = await requireDoctor(userId);
  const record = await requireOwnedCondition(conditionId, contexts[0].practitionerId);
  await repository.deleteCondition(conditionId);
  await writeAuditEvent({
    actorUserId: userId,
    actorRoleCode: "DOCTOR",
    action: "CONDITION_DELETED",
    entityType: "CONDITION",
    entityId: conditionId,
    result: "SUCCESS",
    ...meta,
    metadata: { patientId: record.patientId }
  });
}

export async function updateAllergy(
  userId: number,
  allergyId: number,
  input: UpdateAllergyInput,
  meta: RequestMeta
) {
  const contexts = await requireDoctor(userId);
  const doctorId = contexts[0].practitionerId;
  const record = await requireOwnedAllergy(allergyId, doctorId);
  await requirePatient(record.patientId);
  await validateEncounter(input.encounterId, record.patientId, doctorId);
  await repository.updateAllergy(allergyId, input);
  await writeAuditEvent({
    actorUserId: userId,
    actorRoleCode: "DOCTOR",
    action: "ALLERGY_UPDATED",
    entityType: "ALLERGY",
    entityId: allergyId,
    result: "SUCCESS",
    ...meta,
    metadata: { patientId: record.patientId }
  });
}

export async function deleteAllergy(userId: number, allergyId: number, meta: RequestMeta) {
  const contexts = await requireDoctor(userId);
  const record = await requireOwnedAllergy(allergyId, contexts[0].practitionerId);
  await repository.deleteAllergy(allergyId);
  await writeAuditEvent({
    actorUserId: userId,
    actorRoleCode: "DOCTOR",
    action: "ALLERGY_DELETED",
    entityType: "ALLERGY",
    entityId: allergyId,
    result: "SUCCESS",
    ...meta,
    metadata: { patientId: record.patientId }
  });
}

export async function updatePrescription(
  userId: number,
  prescriptionId: number,
  input: UpdatePrescriptionInput,
  meta: RequestMeta
) {
  const contexts = await requireDoctor(userId);
  const context = requireOrganization(contexts, input.organizationId);
  const record = await requireOwnedPrescription(prescriptionId, context.practitionerId);
  await requirePatient(record.patientId);
  await validateEncounter(input.encounterId, record.patientId, context.practitionerId);
  await repository.updatePrescription(prescriptionId, input);
  await writeAuditEvent({
    actorUserId: userId,
    actorRoleCode: "DOCTOR",
    action: "PRESCRIPTION_UPDATED",
    entityType: "PRESCRIPTION",
    entityId: prescriptionId,
    result: "SUCCESS",
    ...meta,
    metadata: { patientId: record.patientId, itemCount: input.items.length }
  });
}

export async function deletePrescription(userId: number, prescriptionId: number, meta: RequestMeta) {
  const contexts = await requireDoctor(userId);
  const record = await requireOwnedPrescription(prescriptionId, contexts[0].practitionerId);
  await repository.deletePrescription(prescriptionId);
  await writeAuditEvent({
    actorUserId: userId,
    actorRoleCode: "DOCTOR",
    action: "PRESCRIPTION_DELETED",
    entityType: "PRESCRIPTION",
    entityId: prescriptionId,
    result: "SUCCESS",
    ...meta,
    metadata: { patientId: record.patientId }
  });
}
