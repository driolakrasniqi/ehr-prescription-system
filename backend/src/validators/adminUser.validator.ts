import {
  z
} from "zod";

export const userIdSchema =
  z.coerce
    .number()
    .int()
    .positive();

export const updateUserRoleSchema =
  z.object({
    role: z.enum([
      "ADMIN",
      "DOCTOR",
      "PHARMACIST",
      "PATIENT"
    ])
  });

export const updateUserStatusSchema = z.object({
  status: z.enum(["PENDING", "ACTIVE", "DISABLED"])
});

export const createStaffSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(128),
  firstName: z.string().trim().min(2).max(100),
  lastName: z.string().trim().min(2).max(100),
  role: z.enum(["DOCTOR", "PHARMACIST"]),
  practitionerNumber: z.string().trim().min(1).max(50),
  licenseNumber: z.string().trim().min(1).max(100),
  specialty: z.string().trim().max(150).optional(),
  phone: z.string().trim().max(50).optional(),
  organizationId: z.coerce.number().int().positive(),
  positionTitle: z.string().trim().max(150).optional()
});

export type CreateStaffInput = z.infer<typeof createStaffSchema>;

export type UpdateUserRoleInput =
  z.infer<
    typeof updateUserRoleSchema
  >;
