/**
 * Idempotent seed script: creates one synthetic user per role
 * (ADMIN, DOCTOR, PHARMACIST, PATIENT) if it does not already exist.
 *
 * - Passwords are never hard-coded and never written into SQL.
 *   Each password is either read from an environment variable
 *   (SEED_<ROLE>_PASSWORD) or generated randomly at runtime, then
 *   hashed with bcryptjs before being inserted.
 * - Re-running this script is safe: existing users (matched by
 *   email) are left untouched, not duplicated or overwritten.
 * - Only a `users` row is created here — this does not create
 *   `practitioners`/`patients` profile rows, since those belong to
 *   later thesis modules.
 *
 * Usage:
 *   npm run seed
 *   SEED_ADMIN_PASSWORD=... SEED_DOCTOR_PASSWORD=... npm run seed
 */
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { databasePool } from "../config/database.js";
import { env } from "../config/env.js";
import type { UserRole } from "../types/auth.types.js";

interface SeedUserDefinition {
  roleCode: UserRole;
  email: string;
  displayName: string;
  passwordEnvVar: string;
}

const SEED_USERS: SeedUserDefinition[] = [
  {
    roleCode: "ADMIN",
    email: "admin@ehr.local",
    displayName: "System Administrator",
    passwordEnvVar: "SEED_ADMIN_PASSWORD"
  },
  {
    roleCode: "DOCTOR",
    email: "doctor@ehr.local",
    displayName: "Dr. Jane Doe",
    passwordEnvVar: "SEED_DOCTOR_PASSWORD"
  },
  {
    roleCode: "PHARMACIST",
    email: "pharmacist@ehr.local",
    displayName: "Alex Pharmacist",
    passwordEnvVar: "SEED_PHARMACIST_PASSWORD"
  },
  {
    roleCode: "PATIENT",
    email: "patient@ehr.local",
    displayName: "Sam Patient",
    passwordEnvVar: "SEED_PATIENT_PASSWORD"
  }
];

interface RoleRow extends RowDataPacket {
  id: number;
}

interface ExistingUserRow extends RowDataPacket {
  id: number;
}

function generateRandomPassword(): string {
  return crypto.randomBytes(12).toString("base64url");
}

async function seed(): Promise<void> {
  const printedCredentials: Array<{ role: string; email: string; password: string | null }> = [];

  for (const definition of SEED_USERS) {
    const [roleRows] = await databasePool.query<RoleRow[]>(
      `SELECT id FROM roles WHERE code = ? LIMIT 1`,
      [definition.roleCode]
    );

    const role = roleRows[0];

    if (!role) {
      throw new Error(
        `Role '${definition.roleCode}' was not found in the roles table. Has database/schema.sql been applied?`
      );
    }

    const [existingRows] = await databasePool.query<ExistingUserRow[]>(
      `SELECT id FROM users WHERE email = ? LIMIT 1`,
      [definition.email]
    );

    if (existingRows[0]) {
      console.log(`Skipped (already exists): ${definition.roleCode} <${definition.email}>`);
      printedCredentials.push({ role: definition.roleCode, email: definition.email, password: null });
      continue;
    }

    const password = process.env[definition.passwordEnvVar] ?? generateRandomPassword();
    const passwordHash = await bcrypt.hash(password, env.BCRYPT_SALT_ROUNDS);

    await databasePool.query<ResultSetHeader>(
      `INSERT INTO users (role_id, email, password_hash, display_name, status)
       VALUES (?, ?, ?, ?, 'ACTIVE')`,
      [role.id, definition.email, passwordHash, definition.displayName]
    );

    console.log(`Created: ${definition.roleCode} <${definition.email}>`);
    printedCredentials.push({ role: definition.roleCode, email: definition.email, password });
  }

  console.log("\n=== Seed credentials (shown once — passwords are not stored anywhere) ===");

  for (const credential of printedCredentials) {
    const passwordDisplay = credential.password ?? "(already existed — password unchanged, not shown)";
    console.log(`${credential.role.padEnd(11)} ${credential.email.padEnd(24)} ${passwordDisplay}`);
  }

  console.log(
    "\nTip: set SEED_ADMIN_PASSWORD / SEED_DOCTOR_PASSWORD / SEED_PHARMACIST_PASSWORD / SEED_PATIENT_PASSWORD " +
      "before running to choose your own passwords instead of random ones."
  );
}

seed()
  .then(async () => {
    await databasePool.end();
  })
  .catch(async (error: unknown) => {
    console.error("Seeding failed:", error);
    await databasePool.end();
    process.exit(1);
  });
