/**
 * Idempotent seed script that creates the initial administrator
 * account when it does not already exist.
 *
 * Doctor and pharmacist accounts must be created through the
 * admin staff endpoint so that their practitioner and organization
 * records are created in the same transaction.
 *
 * Patient accounts must be created through public patient
 * registration so that the patient profile is also created.
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
  "\nTip: set SEED_ADMIN_PASSWORD before running the seed script."
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
