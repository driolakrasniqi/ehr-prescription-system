import test from "node:test";
import assert from "node:assert/strict";
import { changePasswordSchema, registerSchema } from "../src/validators/auth.validator.js";
import { createStaffSchema, updateUserStatusSchema } from "../src/validators/adminUser.validator.js";

test("public registration accepts valid patient data", () => {
  const result = registerSchema.safeParse({ firstName: "Mia", lastName: "Test",
    dateOfBirth: "2014-03-28", sex: "FEMALE", email: "mia@example.com",
    password: "StrongPass123!", confirmPassword: "StrongPass123!" });
  assert.equal(result.success, true);
});

test("registration rejects mismatched passwords", () => {
  const result = registerSchema.safeParse({ firstName: "Mia", lastName: "Test",
    dateOfBirth: "2014-03-28", sex: "FEMALE", email: "mia@example.com",
    password: "StrongPass123!", confirmPassword: "DifferentPass123!" });
  assert.equal(result.success, false);
});

test("staff creation rejects ADMIN role", () => {
  const result = createStaffSchema.safeParse({ email: "admin@example.com", password: "StrongPass123!",
    firstName: "System", lastName: "Admin", role: "ADMIN", practitionerNumber: "P-1",
    licenseNumber: "L-1", organizationId: 1 });
  assert.equal(result.success, false);
});

test("admin status input rejects LOCKED", () => {
  assert.equal(updateUserStatusSchema.safeParse({ status: "LOCKED" }).success, false);
});

test(
  "registration rejects an impossible calendar date",
  () => {
    const result =
      registerSchema.safeParse({
        firstName: "Invalid",
        lastName: "Date",
        dateOfBirth: "2026-02-31",
        sex: "FEMALE",
        email:
          "invalid.date@example.com",
        password:
          "InvalidDatePassword123!",
        confirmPassword:
          "InvalidDatePassword123!"
      });

    assert.equal(
      result.success,
      false
    );
  }
);

test("password change requires matching, different password", () => {
  assert.equal(changePasswordSchema.safeParse({ currentPassword: "OldPassword123!",
    newPassword: "NewPassword123!", confirmPassword: "NewPassword123!" }).success, true);
  assert.equal(changePasswordSchema.safeParse({ currentPassword: "SamePassword123!",
    newPassword: "SamePassword123!", confirmPassword: "SamePassword123!" }).success, false);
});
