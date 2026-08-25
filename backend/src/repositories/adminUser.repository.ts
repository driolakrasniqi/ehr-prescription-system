import type {
  ResultSetHeader,
  RowDataPacket
} from "mysql2/promise";

import {
  databasePool
} from "../config/database.js";
import { AppError } from "../utils/errors.js";
import type { CreateStaffInput } from "../validators/adminUser.validator.js";

import type {
  UserRole,
  UserStatus,
  ManageableUserStatus
} from "../types/auth.types.js";

export interface AdminUserRecord
  extends RowDataPacket {
  id: number;
  email: string;
  display_name: string | null;
  status: UserStatus;
  failed_login_count: number;
  locked_until: Date | null;
  role_id: number;
  role_code: UserRole;
  role_name: string;
  created_at: Date;
}

export interface RoleRecord
  extends RowDataPacket {
  id: number;
  code: UserRole;
  name: string;
}

interface RoleIdRow
  extends RowDataPacket {
  id: number;
}

export async function getAllUsers():
Promise<AdminUserRecord[]> {
  const [rows] =
    await databasePool.query<
      AdminUserRecord[]
    >(
      `
        SELECT
          u.id,
          u.email,
          u.display_name,
          u.status,
          u.failed_login_count,
          u.locked_until,
          u.role_id,
          r.code AS role_code,
          r.name AS role_name,
          u.created_at
        FROM users u
        JOIN roles r ON r.id = u.role_id
        ORDER BY u.created_at DESC
      `
    );

  return rows;
}

export async function getActiveRoles():
Promise<RoleRecord[]> {
  const [rows] =
    await databasePool.query<
      RoleRecord[]
    >(
      `
        SELECT
          id,
          code,
          name
        FROM roles
        WHERE is_active = TRUE
        ORDER BY id
      `
    );

  return rows;
}

export async function findRoleByCode(
  role: UserRole
): Promise<RoleIdRow | null> {
  const [rows] =
    await databasePool.query<
      RoleIdRow[]
    >(
      `
        SELECT id
        FROM roles
        WHERE code = ?
          AND is_active = TRUE
        LIMIT 1
      `,
      [role]
    );

  return rows[0] ?? null;
}

export async function updateUserRole(
  userId: number,
  roleId: number
): Promise<boolean> {
  const [result] =
    await databasePool.query<
      ResultSetHeader
    >(
      `
        UPDATE users
        SET role_id = ?
        WHERE id = ?
      `,
      [
        roleId,
        userId
      ]
    );

  return result.affectedRows > 0;
}

export async function countActiveAdminsExcluding(userId: number): Promise<number> {
  const [rows] = await databasePool.query<(RowDataPacket & { total: number })[]>(
    `SELECT COUNT(*) AS total FROM users u JOIN roles r ON r.id = u.role_id
     WHERE r.code = 'ADMIN' AND u.status = 'ACTIVE' AND u.id <> ?`, [userId]
  );
  return rows[0]?.total ?? 0;
}

export async function hasRequiredProfile(
  userId: number,
  role: UserRole
): Promise<boolean> {
  if (role === "ADMIN") {
    return true;
  }

  if (role === "PATIENT") {
    const [rows] =
      await databasePool.query<
        RowDataPacket[]
      >(
        `
          SELECT id
          FROM patients
          WHERE user_id = ?
          LIMIT 1
        `,
        [userId]
      );

    return Boolean(rows[0]);
  }

  const [rows] =
    await databasePool.query<
      RowDataPacket[]
    >(
      `
        SELECT p.id
        FROM practitioners p
        JOIN practitioner_organizations po
          ON po.practitioner_id = p.id
        WHERE p.user_id = ?
          AND p.is_active = TRUE
          AND po.professional_role = ?
          AND po.status = 'ACTIVE'
          AND (
            po.ended_on IS NULL
            OR po.ended_on >= UTC_DATE()
          )
        LIMIT 1
      `,
      [
        userId,
        role
      ]
    );

  return Boolean(rows[0]);
}

export async function updateUserStatus(userId: number, status: ManageableUserStatus): Promise<boolean> {
  const [result] = await databasePool.query<ResultSetHeader>(
    `UPDATE users SET status = ?,
       failed_login_count = IF(? = 'ACTIVE', 0, failed_login_count),
       locked_until = IF(? = 'ACTIVE', NULL, locked_until)
     WHERE id = ?`, [status, status, status, userId]
  );
  return result.affectedRows > 0;
}

export async function unlockUser(userId: number): Promise<boolean> {
  const [result] = await databasePool.query<ResultSetHeader>(
    `
      UPDATE users
      SET
        status = 'ACTIVE',
        failed_login_count = 0,
        locked_until = NULL
      WHERE id = ?
        AND status = 'LOCKED'
    `,
    [userId]
  );

  return result.affectedRows > 0;
}

export async function createStaffAccount(input: CreateStaffInput, passwordHash: string): Promise<number> {
  const connection = await databasePool.getConnection();
  try {
    await connection.beginTransaction();
    const [roles] = await connection.query<(RowDataPacket & { id: number })[]>(
      `SELECT id FROM roles WHERE code = ? AND is_active = TRUE LIMIT 1`, [input.role]
    );
    const [organizations] = await connection.query<RowDataPacket[]>(
      `SELECT id FROM organizations WHERE id = ? AND status = 'ACTIVE' LIMIT 1`, [input.organizationId]
    );
    if (!roles[0] || !organizations[0]) {
      throw new AppError(400, "VALIDATION_ERROR", "Role or active organization was not found.");
    }
    const [userResult] = await connection.query<ResultSetHeader>(
      `INSERT INTO users (role_id, email, password_hash, display_name, status, password_changed_at)
       VALUES (?, ?, ?, ?, 'ACTIVE', UTC_TIMESTAMP(3))`,
      [roles[0].id, input.email.toLowerCase(), passwordHash, `${input.firstName} ${input.lastName}`]
    );
    const [practitionerResult] = await connection.query<ResultSetHeader>(
      `INSERT INTO practitioners
       (user_id, practitioner_number, first_name, last_name, license_number, specialty, phone, professional_email)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [userResult.insertId, input.practitionerNumber, input.firstName, input.lastName,
       input.licenseNumber, input.specialty ?? null, input.phone ?? null, input.email.toLowerCase()]
    );
    await connection.query(
      `INSERT INTO practitioner_organizations
       (practitioner_id, organization_id, professional_role, position_title, is_primary, started_on)
       VALUES (?, ?, ?, ?, TRUE, UTC_DATE())`,
      [practitionerResult.insertId, input.organizationId, input.role, input.positionTitle ?? null]
    );
    await connection.commit();
    return userResult.insertId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
