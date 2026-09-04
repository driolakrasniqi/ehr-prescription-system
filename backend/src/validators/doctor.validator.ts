import { z } from "zod";

const id = z.coerce.number().int().positive();
const optionalText = (maximum: number) => z.string().trim().max(maximum).optional().default("");
const today = () => new Date().toISOString().slice(0, 10);

export const patientIdSchema = id;

export const patientSearchSchema = z.object({
  search: z.string().trim().max(100).optional().default("")
});

export const createEncounterSchema = z
  .object({
    patientId: id,
    organizationId: id,
    encounterType: z.enum(["CONSULTATION", "FOLLOW_UP", "PREVENTIVE", "EMERGENCY", "OTHER"]),
    chiefComplaint: z.string().trim().min(2).max(1000),
    symptoms: optionalText(3000),
    examinationFindings: optionalText(3000),
    assessmentSummary: optionalText(3000),
    planSummary: optionalText(3000)
  })
  .strict();

export const createConditionSchema = z
  .object({
    patientId: id,
    encounterId: id.optional(),
    conditionName: z.string().trim().min(2).max(200),
    category: z.enum(["DIAGNOSIS", "PROBLEM", "CHRONIC_CONDITION"]).default("DIAGNOSIS"),
    severity: z.enum(["MILD", "MODERATE", "SEVERE", "UNKNOWN"]).default("UNKNOWN"),
    onsetDate: z.iso
      .date()
      .refine((value) => value <= today(), "Onset date cannot be in the future.")
      .optional(),
    notes: optionalText(2000)
  })
  .strict();

export const createAllergySchema = z
  .object({
    patientId: id,
    encounterId: id.optional(),
    substance: z.string().trim().min(2).max(200),
    category: z.enum(["MEDICATION", "FOOD", "ENVIRONMENT", "BIOLOGIC", "OTHER"]),
    severity: z.enum(["MILD", "MODERATE", "SEVERE", "UNKNOWN"]).default("UNKNOWN"),
    reactionDescription: optionalText(500),
    notes: optionalText(2000)
  })
  .strict();

const prescriptionItemSchema = z
  .object({
    medicationId: id,
    frequencyText: z.string().trim().min(2).max(200),
    quantityPrescribed: z.coerce
      .number()
      .min(1, "Quantity must be at least 1.")
      .max(100000, "Quantity is too large."),
    quantityUnit: z.string().trim().min(1).max(50),
    instructions: optionalText(2000)
  })
  .strict();

export const createPrescriptionSchema = z
  .object({
    patientId: id,
    encounterId: id.optional(),
    organizationId: id,
    clinicalReason: optionalText(500),
    notesToPharmacist: optionalText(2000),
    validUntil: z.iso
      .datetime({ offset: true })
      .refine(
        (value) => new Date(value).getTime() > Date.now(),
        "Valid-until date must be in the future."
      )
      .optional(),
    items: z.array(prescriptionItemSchema).min(1).max(20)
  })
  .strict();

export type CreateEncounterInput = z.infer<typeof createEncounterSchema>;
export type CreateConditionInput = z.infer<typeof createConditionSchema>;
export type CreateAllergyInput = z.infer<typeof createAllergySchema>;
export type CreatePrescriptionInput = z.infer<typeof createPrescriptionSchema>;

export const encounterIdSchema = id;
export const conditionIdSchema = id;
export const allergyIdSchema = id;
export const prescriptionIdSchema = id;

export const updateEncounterSchema = createEncounterSchema.omit({ patientId: true });
export const updateConditionSchema = createConditionSchema.omit({ patientId: true });
export const updateAllergySchema = createAllergySchema.omit({ patientId: true });
export const updatePrescriptionSchema = createPrescriptionSchema
  .omit({ patientId: true, validUntil: true })
  .extend({
    validUntil: z.iso.datetime({ offset: true }).optional()
  });

export type UpdateEncounterInput = z.infer<typeof updateEncounterSchema>;
export type UpdateConditionInput = z.infer<typeof updateConditionSchema>;
export type UpdateAllergyInput = z.infer<typeof updateAllergySchema>;
export type UpdatePrescriptionInput = z.infer<typeof updatePrescriptionSchema>;
