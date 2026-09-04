import { z } from "zod";
import { dateOfBirthSchema } from "./auth.validator.js";

export const userIdSchema = z.coerce.number().int().positive();

export const organizationIdSchema = z.coerce.number().int().positive();

export const organizationStatusSchema = z.enum(["PENDING", "ACTIVE", "SUSPENDED", "CLOSED"]);

const organizationFields = {
  organizationCode: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .transform((value) => value.toUpperCase()),
  organizationType: z.enum(["CLINIC", "PHARMACY"]),
  name: z.string().trim().min(2).max(200),
  licenseNumber: z.string().trim().max(100).optional().default(""),
  phone: z.string().trim().max(50).optional().default(""),
  email: z
    .union([z.literal(""), z.string().trim().email().max(254)])
    .optional()
    .default(""),
  addressLine1: z.string().trim().max(250).optional().default(""),
  addressLine2: z.string().trim().max(250).optional().default(""),
  city: z.string().trim().max(100).optional().default(""),
  postalCode: z.string().trim().max(20).optional().default(""),
  countryCode: z
    .string()
    .trim()
    .length(2)
    .default("XK")
    .transform((value) => value.toUpperCase())
};

export const createOrganizationSchema = z.object({
  ...organizationFields,
  status: organizationStatusSchema.default("ACTIVE")
});

export const updateOrganizationSchema = z.object(organizationFields);

export const updateOrganizationStatusSchema = z.object({
  status: organizationStatusSchema
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
export type OrganizationStatus = z.infer<typeof organizationStatusSchema>;

export const updateUserRoleSchema = z.object({
  role: z.enum(["ADMIN", "DOCTOR", "PHARMACIST", "PATIENT"])
});

export const updateUserStatusSchema = z.object({
  status: z.enum(["PENDING", "ACTIVE", "DISABLED"])
});

export const resetUserPasswordSchema = z
  .object({
    newPassword: z
      .string()
      .min(12, "New password must contain at least 12 characters.")
      .max(128, "New password is too long."),
    confirmPassword: z.string().min(1, "Please confirm the new password.")
  })
  .superRefine((data, context) => {
    if (data.newPassword !== data.confirmPassword) {
      context.addIssue({
        code: "custom",
        path: ["confirmPassword"],
        message: "Passwords do not match."
      });
    }
  });

export type ResetUserPasswordInput = z.infer<typeof resetUserPasswordSchema>;

export const createStaffSchema = z.object({
  email: z.string().trim().email().max(254),

  password: z.string().min(12).max(128),

  firstName: z.string().trim().min(2).max(100),

  lastName: z.string().trim().min(2).max(100),

  role: z.enum(["DOCTOR", "PHARMACIST"]),

  licenseNumber: z.string().trim().min(1).max(100),

  specialty: z.string().trim().max(150).optional(),

  phone: z.string().trim().max(50).optional(),

  organizationId: z.coerce.number().int().positive(),

  positionTitle: z.string().trim().max(150).optional()
});

export type CreateStaffInput = z.infer<typeof createStaffSchema>;

export const createAdminSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(128),
  firstName: z.string().trim().min(2).max(100),
  lastName: z.string().trim().min(2).max(100)
});

export type CreateAdminInput = z.infer<typeof createAdminSchema>;

export const createPatientSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(128),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  dateOfBirth: dateOfBirthSchema,
  sex: z.enum(["FEMALE", "MALE"]),
  bloodType: z
    .enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "UNKNOWN"])
    .default("UNKNOWN"),
  maritalStatus: z
    .enum(["SINGLE", "MARRIED", "DIVORCED", "WIDOWED", "OTHER", "UNKNOWN"])
    .default("UNKNOWN"),
  smokingStatus: z.enum(["NEVER", "FORMER", "CURRENT", "UNKNOWN"]).default("UNKNOWN"),
  occupation: z.string().trim().max(150).optional().default(""),
  phone: z.string().trim().max(50).optional().default(""),
  addressLine1: z.string().trim().max(250).optional().default(""),
  addressLine2: z.string().trim().max(250).optional().default(""),
  city: z.string().trim().max(100).optional().default(""),
  postalCode: z.string().trim().max(20).optional().default(""),
  countryCode: z
    .string()
    .trim()
    .length(2)
    .default("XK")
    .transform((value) => value.toUpperCase())
});

export type CreatePatientInput = z.infer<typeof createPatientSchema>;

export type UpdateUserRoleInput = z.infer<typeof updateUserRoleSchema>;

const optionalText = (maximum: number) => z.string().trim().max(maximum).optional().default("");

const accountFields = {
  email: z.string().trim().email().max(254),
  displayName: z.string().trim().min(1).max(200)
};

export const updateAccountProfileSchema = z.object({
  profileType: z.literal("ACCOUNT"),
  ...accountFields
});

export const updatePatientProfileSchema = z.object({
  profileType: z.literal("PATIENT"),
  email: accountFields.email,
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  dateOfBirth: dateOfBirthSchema,
  sex: z.enum(["FEMALE", "MALE"]),
  bloodType: z.enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "UNKNOWN"]),
  maritalStatus: z.enum(["SINGLE", "MARRIED", "DIVORCED", "WIDOWED", "OTHER", "UNKNOWN"]),
  smokingStatus: z.enum(["NEVER", "FORMER", "CURRENT", "UNKNOWN"]),
  occupation: optionalText(150),
  phone: optionalText(50),
  addressLine1: optionalText(250),
  addressLine2: optionalText(250),
  city: optionalText(100),
  postalCode: optionalText(20),
  countryCode: z
    .string()
    .trim()
    .length(2)
    .transform((value) => value.toUpperCase())
});

export const updatePractitionerProfileSchema = z.object({
  profileType: z.literal("PRACTITIONER"),
  role: z.enum(["DOCTOR", "PHARMACIST"]),
  email: accountFields.email,
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  licenseNumber: z.string().trim().min(1).max(100),
  specialty: optionalText(150),
  phone: optionalText(50),
  organizationId: z.coerce.number().int().positive(),
  positionTitle: optionalText(150)
});

export const updateUserProfileSchema = z.discriminatedUnion("profileType", [
  updateAccountProfileSchema,
  updatePatientProfileSchema,
  updatePractitionerProfileSchema
]);

export type UpdateUserProfileInput = z.infer<typeof updateUserProfileSchema>;

export const activitySearchSchema = z.object({
  search: z.string().trim().max(100).optional().default("")
});

export const reportPeriodSchema = z.object({
  period: z.enum(["30d", "90d", "12m", "all"]).optional().default("all")
});
