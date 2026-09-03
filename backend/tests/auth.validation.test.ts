import test from "node:test";
import assert from "node:assert/strict";
import { changePasswordSchema, registerSchema } from "../src/validators/auth.validator.js";
import {
  createPatientSchema,
  createStaffSchema,
  updatePatientProfileSchema,
  updateUserStatusSchema
} from "../src/validators/adminUser.validator.js";
import {
  createAllergySchema,
  createConditionSchema,
  createEncounterSchema,
  createPrescriptionSchema
} from "../src/validators/doctor.validator.js";

test("public registration accepts valid patient data", () => {
  const result = registerSchema.safeParse({
    firstName: "Mia",
    lastName: "Test",
    dateOfBirth: "2014-03-28",
    sex: "FEMALE",
    email: "mia@example.com",
    password: "StrongPass123!",
    confirmPassword: "StrongPass123!"
  });
  assert.equal(result.success, true);
});

test("registration rejects mismatched passwords", () => {
  const result = registerSchema.safeParse({
    firstName: "Mia",
    lastName: "Test",
    dateOfBirth: "2014-03-28",
    sex: "FEMALE",
    email: "mia@example.com",
    password: "StrongPass123!",
    confirmPassword: "DifferentPass123!"
  });
  assert.equal(result.success, false);
});

test("staff creation rejects ADMIN role", () => {
  const result = createStaffSchema.safeParse({
    email: "admin@example.com",
    password: "StrongPass123!",
    firstName: "System",
    lastName: "Admin",
    role: "ADMIN",
    practitionerNumber: "P-1",
    licenseNumber: "L-1",
    organizationId: 1
  });
  assert.equal(result.success, false);
});

test("admin status input rejects LOCKED", () => {
  assert.equal(updateUserStatusSchema.safeParse({ status: "LOCKED" }).success, false);
});

test("admin patient create and update reject future dates of birth", () => {
  const futureDate = "2999-01-01";
  const base = {
    email: "future.patient@example.com",
    firstName: "Future",
    lastName: "Patient",
    dateOfBirth: futureDate,
    sex: "FEMALE" as const,
    bloodType: "UNKNOWN" as const,
    maritalStatus: "UNKNOWN" as const,
    smokingStatus: "UNKNOWN" as const,
    countryCode: "XK"
  };

  assert.equal(
    createPatientSchema.safeParse({ ...base, password: "StrongPass123!" }).success,
    false
  );
  assert.equal(
    updatePatientProfileSchema.safeParse({ ...base, profileType: "PATIENT" }).success,
    false
  );
});

test("registration rejects an impossible calendar date", () => {
  const result = registerSchema.safeParse({
    firstName: "Invalid",
    lastName: "Date",
    dateOfBirth: "2026-02-31",
    sex: "FEMALE",
    email: "invalid.date@example.com",
    password: "InvalidDatePassword123!",
    confirmPassword: "InvalidDatePassword123!"
  });

  assert.equal(result.success, false);
});

test("password change requires matching, different password", () => {
  assert.equal(
    changePasswordSchema.safeParse({
      currentPassword: "OldPassword123!",
      newPassword: "NewPassword123!",
      confirmPassword: "NewPassword123!"
    }).success,
    true
  );
  assert.equal(
    changePasswordSchema.safeParse({
      currentPassword: "SamePassword123!",
      newPassword: "SamePassword123!",
      confirmPassword: "SamePassword123!"
    }).success,
    false
  );
});

test("doctor encounter requires a patient, clinic and chief complaint", () => {
  assert.equal(
    createEncounterSchema.safeParse({
      patientId: 1,
      organizationId: 1,
      encounterType: "CONSULTATION",
      chiefComplaint: "Persistent headache"
    }).success,
    true
  );
  assert.equal(
    createEncounterSchema.safeParse({
      patientId: 1,
      organizationId: 1,
      encounterType: "CONSULTATION",
      chiefComplaint: ""
    }).success,
    false
  );
});

test("doctor allergy rejects unsupported categories", () => {
  assert.equal(
    createAllergySchema.safeParse({
      patientId: 1,
      substance: "Penicillin",
      category: "MEDICATION",
      severity: "SEVERE"
    }).success,
    true
  );
  assert.equal(
    createAllergySchema.safeParse({
      patientId: 1,
      substance: "Penicillin",
      category: "UNSUPPORTED"
    }).success,
    false
  );
});

test("doctor prescription requires at least one valid medication item", () => {
  const base = { patientId: 1, organizationId: 1 };
  assert.equal(
    createPrescriptionSchema.safeParse({
      ...base,
      items: [
        {
          medicationId: 1,
          frequencyText: "Twice daily",
          quantityPrescribed: 20,
          quantityUnit: "tablets"
        }
      ]
    }).success,
    true
  );
  assert.equal(createPrescriptionSchema.safeParse({ ...base, items: [] }).success, false);
});

test("doctor condition rejects a future onset date", () => {
  assert.equal(
    createConditionSchema.safeParse({
      patientId: 1,
      conditionName: "Hypertension",
      category: "DIAGNOSIS",
      severity: "MODERATE",
      onsetDate: "2999-01-01"
    }).success,
    false
  );
});

test("doctor prescription rejects past expiry dates", () => {
  const result = createPrescriptionSchema.safeParse({
    patientId: 1,
    organizationId: 1,
    validUntil: "2007-05-11T23:59:59.000Z",
    items: [
      {
        medicationId: 1,
        frequencyText: "Twice daily",
        quantityPrescribed: 20,
        quantityUnit: "tablets"
      }
    ]
  });

  assert.equal(result.success, false);
});

test("doctor prescription rejects quantities below one", () => {
  const base = {
    patientId: 1,
    organizationId: 1,
    medicationId: 1,
    frequencyText: "Twice daily",
    quantityUnit: "tablets"
  };

  for (const quantityPrescribed of [0, -1, 0.001]) {
    assert.equal(
      createPrescriptionSchema.safeParse({
        patientId: base.patientId,
        organizationId: base.organizationId,
        items: [
          {
            medicationId: base.medicationId,
            frequencyText: base.frequencyText,
            quantityPrescribed,
            quantityUnit: base.quantityUnit
          }
        ]
      }).success,
      false
    );
  }
});

test("doctor prescription accepts a future expiry date", () => {
  const validUntil = new Date(Date.now() + 7 * 86_400_000).toISOString();
  assert.equal(
    createPrescriptionSchema.safeParse({
      patientId: 1,
      organizationId: 1,
      validUntil,
      items: [
        {
          medicationId: 1,
          frequencyText: "Once daily",
          quantityPrescribed: 10,
          quantityUnit: "tablets"
        }
      ]
    }).success,
    true
  );
});
