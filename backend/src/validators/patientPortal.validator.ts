import { z } from "zod";

const optionalText = (maximum: number) => z.string().trim().max(maximum).optional().default("");

export const updateOwnPatientProfileSchema = z
  .object({
    phone: optionalText(50),
    occupation: optionalText(150),
    maritalStatus: z.enum(["SINGLE", "MARRIED", "DIVORCED", "WIDOWED", "OTHER", "UNKNOWN"]),
    smokingStatus: z.enum(["NEVER", "FORMER", "CURRENT", "UNKNOWN"]),
    addressLine1: optionalText(250),
    addressLine2: optionalText(250),
    city: optionalText(100),
    postalCode: optionalText(20),
    countryCode: z
      .string()
      .trim()
      .length(2)
      .transform((value) => value.toUpperCase())
  })
  .strict();

export type UpdateOwnPatientProfileInput = z.infer<typeof updateOwnPatientProfileSchema>;
