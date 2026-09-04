import { z } from "zod";

const id = z.coerce.number().int().positive();

export const pharmacistPatientSearchSchema = z.object({
  search: z.string().trim().max(100).optional().default("")
});

export const pharmacistPatientIdSchema = id;
