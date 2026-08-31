import * as repository from "../repositories/patientPortal.repository.js";
import { AppError } from "../utils/errors.js";
import { writeAuditEvent } from "../repositories/audit.repository.js";
import type { RequestMeta } from "./auth.service.js";
import type { UpdateOwnPatientProfileInput } from "../validators/patientPortal.validator.js";

function withoutInternalId(profile: repository.PatientProfileRow) {
  const { id: _id, ...publicProfile } = profile;
  return publicProfile;
}

export async function getProfile(userId: number) {
  const profile = await repository.getPatientProfile(userId);
  if (!profile) {
    throw new AppError(404, "NOT_FOUND", "Patient profile not found for this account.");
  }
  return withoutInternalId(profile);
}

export async function updateProfile(
  userId: number,
  input: UpdateOwnPatientProfileInput,
  meta: RequestMeta
) {
  const before = await repository.getPatientProfile(userId);
  if (!before) {
    throw new AppError(404, "NOT_FOUND", "Patient profile not found for this account.");
  }
  if (before.status !== "ACTIVE") {
    throw new AppError(409, "CONFLICT", "Only an active patient profile can be updated.");
  }

  await repository.updateOwnPatientProfile(userId, input);
  await writeAuditEvent({
    actorUserId: userId,
    actorRoleCode: "PATIENT",
    action: "PATIENT_PROFILE_SELF_UPDATED",
    entityType: "PATIENT",
    entityId: before.id,
    result: "SUCCESS",
    ...meta,
    metadata: {
      updatedFields: [
        "phone", "occupation", "maritalStatus", "smokingStatus",
        "addressLine1", "addressLine2", "city", "postalCode", "countryCode"
      ]
    }
  });

  return getProfile(userId);
}

export async function getDashboard(userId: number) {
  const dashboard = await repository.getPatientDashboard(userId);
  if (!dashboard) {
    throw new AppError(404, "NOT_FOUND", "Patient profile not found for this account.");
  }
  return dashboard;
}
