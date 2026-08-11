import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  PORT: z.coerce
    .number()
    .int()
    .positive()
    .default(5000),

  DB_HOST: z.string().min(1),

  DB_PORT: z.coerce
    .number()
    .int()
    .positive()
    .default(3306),

  DB_NAME: z.string().min(1),

  DB_USER: z.string().min(1),

  DB_PASSWORD: z.string().min(1),

  FRONTEND_URL: z.string().url(),

  JWT_ACCESS_SECRET: z
    .string()
    .min(32),

  ACCESS_TOKEN_TTL_MINUTES: z.coerce
    .number()
    .int()
    .positive()
    .default(15),

  REFRESH_TOKEN_TTL_DAYS: z.coerce
    .number()
    .int()
    .positive()
    .default(7),

  REFRESH_COOKIE_NAME: z
    .string()
    .min(1)
    .default("ehr_refresh_token"),

  BCRYPT_SALT_ROUNDS: z.coerce
    .number()
    .int()
    .min(10)
    .max(15)
    .default(12),

  LOGIN_RATE_LIMIT_WINDOW_MINUTES: z.coerce
    .number()
    .int()
    .positive()
    .default(15),

  LOGIN_RATE_LIMIT_MAX_ATTEMPTS: z.coerce
    .number()
    .int()
    .positive()
    .default(10)
});

const result = environmentSchema.safeParse(process.env);

if (!result.success) {
  console.error("Invalid environment configuration:");
  console.error(result.error.flatten().fieldErrors);

  process.exit(1);
}

export const env = result.data;