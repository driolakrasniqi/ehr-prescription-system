import type {
  ResultSetHeader,
  RowDataPacket
} from "mysql2/promise";

import {
  databasePool
} from "../config/database.js";
import { AppError } from "../utils/errors.js";
import type {
  CreateOrganizationInput,
  CreatePatientInput,
  CreateStaffInput,
  OrganizationStatus,
  UpdateOrganizationInput
} from "../validators/adminUser.validator.js";
import type { UpdateUserProfileInput } from "../validators/adminUser.validator.js";

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
  profile_number: string | null;
  phone: string | null;
  organization_name: string | null;
  profile_complete: number;
}

export interface RoleRecord
  extends RowDataPacket {
  id: number;
  code: UserRole;
  name: string;
}

export interface OrganizationRecord
  extends RowDataPacket {
  id: number;
  organizationCode: string;
  organizationType:
    | "CLINIC"
    | "PHARMACY"
    | "LABORATORY"
    | "OTHER";
  name: string;
  licenseNumber: string | null;
  phone: string | null;
  email: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  postalCode: string | null;
  countryCode: string;
  status: OrganizationStatus;
  activePractitionerCount: number;
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
          u.created_at,
          COALESCE(pa.patient_number, pr.practitioner_number) AS profile_number,
          COALESCE(pa.phone, pr.phone) AS phone,
          org.name AS organization_name,
          CASE
            WHEN r.code = 'PATIENT' THEN
              CASE WHEN pa.id IS NOT NULL AND pa.first_name <> '' AND pa.last_name <> ''
                     AND pa.date_of_birth IS NOT NULL AND pa.phone IS NOT NULL AND pa.phone <> ''
                   THEN 1 ELSE 0 END
            WHEN r.code IN ('DOCTOR','PHARMACIST') THEN
              CASE WHEN pr.id IS NOT NULL AND pr.first_name <> '' AND pr.last_name <> ''
                     AND pr.license_number <> '' AND pr.phone IS NOT NULL AND pr.phone <> ''
                     AND po.organization_id IS NOT NULL
                   THEN 1 ELSE 0 END
            ELSE CASE WHEN u.display_name IS NOT NULL AND u.display_name <> '' THEN 1 ELSE 0 END
          END AS profile_complete
        FROM users u
        JOIN roles r ON r.id = u.role_id
        LEFT JOIN patients pa ON pa.user_id = u.id
        LEFT JOIN practitioners pr ON pr.user_id = u.id
        LEFT JOIN practitioner_organizations po
          ON po.practitioner_id = pr.id
         AND po.is_primary = TRUE
         AND po.status = 'ACTIVE'
         AND (po.ended_on IS NULL OR po.ended_on >= UTC_DATE())
        LEFT JOIN organizations org ON org.id = po.organization_id
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

export async function getActiveOrganizations():
Promise<OrganizationRecord[]> {
  const [rows] =
    await databasePool.query<
      OrganizationRecord[]
    >(
      `
        SELECT
          id,
          organization_code
            AS organizationCode,
          organization_type
            AS organizationType,
          name,
          license_number AS licenseNumber,
          phone,
          email,
          address_line1 AS addressLine1,
          address_line2 AS addressLine2,
          city,
          postal_code AS postalCode,
          country_code AS countryCode,
          status,
          0 AS activePractitionerCount
        FROM organizations
        WHERE status = 'ACTIVE'
        ORDER BY
          organization_type,
          name
      `
    );

  return rows;
}

export async function getAllOrganizations(): Promise<OrganizationRecord[]> {
  const [rows] = await databasePool.query<OrganizationRecord[]>(
    `
      SELECT
        o.id,
        o.organization_code AS organizationCode,
        o.organization_type AS organizationType,
        o.name,
        o.license_number AS licenseNumber,
        o.phone,
        o.email,
        o.address_line1 AS addressLine1,
        o.address_line2 AS addressLine2,
        o.city,
        o.postal_code AS postalCode,
        o.country_code AS countryCode,
        o.status,
        COUNT(DISTINCT CASE
          WHEN po.status = 'ACTIVE'
           AND (po.ended_on IS NULL OR po.ended_on >= UTC_DATE())
          THEN po.practitioner_id
        END) AS activePractitionerCount
      FROM organizations o
      LEFT JOIN practitioner_organizations po
        ON po.organization_id = o.id
      GROUP BY o.id
      ORDER BY o.organization_type, o.name
    `
  );

  return rows;
}

export async function findOrganizationById(
  organizationId: number
): Promise<OrganizationRecord | null> {
  const [rows] = await databasePool.query<OrganizationRecord[]>(
    `SELECT o.id, o.organization_code AS organizationCode,
            o.organization_type AS organizationType, o.name,
            o.license_number AS licenseNumber, o.phone, o.email,
            o.address_line1 AS addressLine1, o.address_line2 AS addressLine2,
            o.city, o.postal_code AS postalCode, o.country_code AS countryCode,
            o.status,
            COUNT(DISTINCT CASE
              WHEN po.status = 'ACTIVE'
               AND (po.ended_on IS NULL OR po.ended_on >= UTC_DATE())
              THEN po.practitioner_id END) AS activePractitionerCount
       FROM organizations o
       LEFT JOIN practitioner_organizations po ON po.organization_id = o.id
      WHERE o.id = ?
      GROUP BY o.id
      LIMIT 1`,
    [organizationId]
  );
  return rows[0] ?? null;
}

export async function createOrganization(
  input: CreateOrganizationInput
): Promise<number> {
  const [result] = await databasePool.query<ResultSetHeader>(
    `
      INSERT INTO organizations (
        organization_code, organization_type, name, license_number,
        phone, email, address_line1, address_line2, city, postal_code,
        country_code, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      input.organizationCode,
      input.organizationType,
      input.name,
      input.licenseNumber || null,
      input.phone || null,
      input.email || null,
      input.addressLine1 || null,
      input.addressLine2 || null,
      input.city || null,
      input.postalCode || null,
      input.countryCode,
      input.status
    ]
  );

  return result.insertId;
}

export async function updateOrganization(
  organizationId: number,
  input: UpdateOrganizationInput
): Promise<boolean> {
  const [result] = await databasePool.query<ResultSetHeader>(
    `
      UPDATE organizations
      SET organization_code = ?, organization_type = ?, name = ?,
          license_number = ?, phone = ?, email = ?, address_line1 = ?,
          address_line2 = ?, city = ?, postal_code = ?, country_code = ?
      WHERE id = ?
    `,
    [
      input.organizationCode,
      input.organizationType,
      input.name,
      input.licenseNumber || null,
      input.phone || null,
      input.email || null,
      input.addressLine1 || null,
      input.addressLine2 || null,
      input.city || null,
      input.postalCode || null,
      input.countryCode,
      organizationId
    ]
  );

  return result.affectedRows > 0;
}

export async function updateOrganizationStatus(
  organizationId: number,
  status: OrganizationStatus
): Promise<boolean> {
  const [result] = await databasePool.query<ResultSetHeader>(
    `UPDATE organizations SET status = ? WHERE id = ?`,
    [status, organizationId]
  );

  return result.affectedRows > 0;
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

export async function createStaffAccount( 
  input: CreateStaffInput,
  passwordHash: string,
  practitionerNumber: string
): Promise<number> {
  const connection =
    await databasePool.getConnection();

  try {
    await connection
      .beginTransaction();

    const [roles] =
      await connection.query<
        (
          RowDataPacket & {
            id: number;
          }
        )[]
      >(
        `
          SELECT id
          FROM roles
          WHERE code = ?
            AND is_active = TRUE
          LIMIT 1
        `,
        [input.role]
      );

    const role = roles[0];

    if (!role) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        "The selected role is not available."
      );
    }

    /*
     * Doctors must be assigned to an active clinic.
     * Pharmacists must be assigned to an active pharmacy.
     */
    const [organizations] =
      await connection.query<
        RowDataPacket[]
      >(
        `
          SELECT
            id,
            name,
            organization_type
          FROM organizations
          WHERE id = ?
            AND status = 'ACTIVE'
            AND (
              (
                ? = 'DOCTOR'
                AND
                organization_type =
                  'CLINIC'
              )
              OR
              (
                ? = 'PHARMACIST'
                AND
                organization_type =
                  'PHARMACY'
              )
            )
          LIMIT 1
        `,
        [
          input.organizationId,
          input.role,
          input.role
        ]
      );

    if (!organizations[0]) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        input.role === "DOCTOR"
          ? "Select an active clinic for the doctor."
          : "Select an active pharmacy for the pharmacist."
      );
    }

    const displayName =
      `${input.firstName.trim()} ${input.lastName.trim()}`;

    const [userResult] =
      await connection.query<
        ResultSetHeader
      >(
        `
          INSERT INTO users (
            role_id,
            email,
            password_hash,
            display_name,
            status,
            password_changed_at
          )
          VALUES (
            ?,
            ?,
            ?,
            ?,
            'ACTIVE',
            UTC_TIMESTAMP(3)
          )
        `,
        [
          role.id,
          input.email
            .trim()
            .toLowerCase(),
          passwordHash,
          displayName
        ]
      );

    const [practitionerResult] =
      await connection.query<
        ResultSetHeader
      >(
        `
          INSERT INTO practitioners (
            user_id,
            practitioner_number,
            first_name,
            last_name,
            license_number,
            specialty,
            phone,
            professional_email
          )
          VALUES (
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?
          )
        `,
        [
          userResult.insertId,
          practitionerNumber,
          input.firstName.trim(),
          input.lastName.trim(),
          input.licenseNumber.trim(),
          input.specialty?.trim() ||
            null,
          input.phone?.trim() ||
            null,
          input.email
            .trim()
            .toLowerCase()
        ]
      );

    await connection.query(
      `
        INSERT INTO
          practitioner_organizations (
            practitioner_id,
            organization_id,
            professional_role,
            position_title,
            is_primary,
            started_on,
            status
          )
        VALUES (
          ?,
          ?,
          ?,
          ?,
          TRUE,
          UTC_DATE(),
          'ACTIVE'
        )
      `,
      [
        practitionerResult.insertId,
        input.organizationId,
        input.role,
        input.positionTitle?.trim() ||
          null
      ]
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

function optionalValue(value: string): string | null {
  const trimmed = value.trim();
  return trimmed || null;
}

export async function createPatientAccount(
  input: CreatePatientInput,
  passwordHash: string,
  patientNumber: string,
  currentAdminId: number
): Promise<number> {
  const connection = await databasePool.getConnection();
  try {
    await connection.beginTransaction();
    const [roles] = await connection.query<RoleIdRow[]>(
      `SELECT id FROM roles WHERE code = 'PATIENT' AND is_active = TRUE LIMIT 1`
    );
    const role = roles[0];
    if (!role) throw new AppError(400, "VALIDATION_ERROR", "The patient role is unavailable.");

    const displayName = `${input.firstName.trim()} ${input.lastName.trim()}`;
    const email = input.email.trim().toLowerCase();
    const [userResult] = await connection.query<ResultSetHeader>(
      `INSERT INTO users
        (role_id, email, password_hash, display_name, status, password_changed_at)
       VALUES (?, ?, ?, ?, 'ACTIVE', UTC_TIMESTAMP(3))`,
      [role.id, email, passwordHash, displayName]
    );

    await connection.query(
      `INSERT INTO patients
        (user_id, patient_number, first_name, last_name, date_of_birth, sex,
         blood_type, marital_status, occupation, smoking_status, phone, email,
         address_line1, address_line2, city, postal_code, country_code,
         status, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)`,
      [userResult.insertId, patientNumber, input.firstName.trim(), input.lastName.trim(),
       input.dateOfBirth, input.sex, input.bloodType, input.maritalStatus,
       optionalValue(input.occupation), input.smokingStatus, optionalValue(input.phone), email,
       optionalValue(input.addressLine1), optionalValue(input.addressLine2),
       optionalValue(input.city), optionalValue(input.postalCode), input.countryCode,
       currentAdminId]
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

export interface AccountDetailsRecord extends RowDataPacket {
  id: number;
  email: string;
  displayName: string | null;
  role: UserRole;
  status: UserStatus;
}

export interface PatientProfileRecord extends RowDataPacket {
  type: "PATIENT";
  patientNumber: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  sex: "FEMALE" | "MALE";
  bloodType: string;
  maritalStatus: string;
  smokingStatus: string;
  occupation: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  postalCode: string | null;
  countryCode: string;
}

export interface PractitionerProfileRecord extends RowDataPacket {
  type: "PRACTITIONER";
  practitionerNumber: string;
  firstName: string;
  lastName: string;
  licenseNumber: string;
  specialty: string | null;
  phone: string | null;
  organizationId: number;
  organizationName: string;
  positionTitle: string | null;
}

export async function getUserAccountDetails(userId: number): Promise<AccountDetailsRecord | null> {
  const [rows] = await databasePool.query<AccountDetailsRecord[]>(
    `SELECT u.id, u.email, u.display_name AS displayName,
            r.code AS role, u.status
       FROM users u
       JOIN roles r ON r.id = u.role_id
      WHERE u.id = ?
      LIMIT 1`,
    [userId]
  );
  return rows[0] ?? null;
}

export async function getPatientProfile(userId: number): Promise<PatientProfileRecord | null> {
  const [rows] = await databasePool.query<PatientProfileRecord[]>(
    `SELECT 'PATIENT' AS type, patient_number AS patientNumber,
            first_name AS firstName, last_name AS lastName,
            DATE_FORMAT(date_of_birth, '%Y-%m-%d') AS dateOfBirth,
            sex, blood_type AS bloodType, marital_status AS maritalStatus,
            smoking_status AS smokingStatus, occupation, phone,
            address_line1 AS addressLine1, address_line2 AS addressLine2,
            city, postal_code AS postalCode, country_code AS countryCode
       FROM patients
      WHERE user_id = ?
      LIMIT 1`,
    [userId]
  );
  return rows[0] ?? null;
}

export async function getPractitionerProfile(userId: number): Promise<PractitionerProfileRecord | null> {
  const [rows] = await databasePool.query<PractitionerProfileRecord[]>(
    `SELECT 'PRACTITIONER' AS type,
            p.practitioner_number AS practitionerNumber,
            p.first_name AS firstName, p.last_name AS lastName,
            p.license_number AS licenseNumber, p.specialty, p.phone,
            po.organization_id AS organizationId, o.name AS organizationName,
            po.position_title AS positionTitle
       FROM practitioners p
       LEFT JOIN practitioner_organizations po
         ON po.practitioner_id = p.id
        AND po.is_primary = TRUE
        AND po.status = 'ACTIVE'
        AND (po.ended_on IS NULL OR po.ended_on >= UTC_DATE())
       LEFT JOIN organizations o ON o.id = po.organization_id
      WHERE p.user_id = ?
      LIMIT 1`,
    [userId]
  );
  return rows[0] ?? null;
}

function nullable(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}

export async function updateUserProfile(
  userId: number,
  input: UpdateUserProfileInput,
  adminId: number
): Promise<void> {
  const connection = await databasePool.getConnection();
  try {
    await connection.beginTransaction();

    if (input.profileType === "ACCOUNT") {
      const [result] = await connection.query<ResultSetHeader>(
        `UPDATE users SET email = ?, display_name = ? WHERE id = ?`,
        [input.email.toLowerCase(), input.displayName, userId]
      );
      if (!result.affectedRows) throw new AppError(404, "NOT_FOUND", "User not found.");
    } else if (input.profileType === "PATIENT") {
      const displayName = `${input.firstName} ${input.lastName}`;
      const [patientResult] = await connection.query<ResultSetHeader>(
        `UPDATE patients SET first_name = ?, last_name = ?, date_of_birth = ?, sex = ?,
             blood_type = ?, marital_status = ?, smoking_status = ?, occupation = ?,
             phone = ?, email = ?, address_line1 = ?, address_line2 = ?, city = ?,
             postal_code = ?, country_code = ?, updated_by_user_id = ?
         WHERE user_id = ?`,
        [input.firstName, input.lastName, input.dateOfBirth, input.sex,
         input.bloodType, input.maritalStatus, input.smokingStatus, nullable(input.occupation),
         nullable(input.phone), input.email.toLowerCase(), nullable(input.addressLine1),
         nullable(input.addressLine2), nullable(input.city), nullable(input.postalCode),
         input.countryCode, adminId, userId]
      );
      if (!patientResult.affectedRows) throw new AppError(409, "PROFILE_REQUIRED", "Patient profile not found.");
      await connection.query(`UPDATE users SET email = ?, display_name = ? WHERE id = ?`,
        [input.email.toLowerCase(), displayName, userId]);
    } else {
      const expectedType = input.role === "DOCTOR" ? "CLINIC" : "PHARMACY";
      const [roleRows] = await connection.query<RoleIdRow[]>(
        `SELECT id FROM roles WHERE code = ? AND is_active = TRUE LIMIT 1`, [input.role]
      );
      if (!roleRows[0]) throw new AppError(400, "VALIDATION_ERROR", "Selected role is unavailable.");
      const [practitioners] = await connection.query<(RowDataPacket & { id: number })[]>(
        `SELECT id FROM practitioners WHERE user_id = ? LIMIT 1`, [userId]
      );
      const practitioner = practitioners[0];
      if (!practitioner) throw new AppError(409, "PROFILE_REQUIRED", "Practitioner profile not found.");

      const [assignments] = await connection.query<(RowDataPacket & {
        id: number;
        organizationId: number;
        professionalRole: "DOCTOR" | "PHARMACIST";
      })[]>(
        `SELECT id, organization_id AS organizationId,
                professional_role AS professionalRole
           FROM practitioner_organizations
          WHERE practitioner_id = ? AND status = 'ACTIVE' AND is_primary = TRUE
            AND (ended_on IS NULL OR ended_on >= UTC_DATE())
          LIMIT 1 FOR UPDATE`,
        [practitioner.id]
      );
      const currentAssignment = assignments[0] ?? null;
      const assignmentChanged = !currentAssignment ||
        currentAssignment.organizationId !== input.organizationId ||
        currentAssignment.professionalRole !== input.role;

      const [organizations] = await connection.query<(RowDataPacket & {
        organizationType: string;
        status: OrganizationStatus;
      })[]>(
        `SELECT organization_type AS organizationType, status
           FROM organizations WHERE id = ? LIMIT 1`,
        [input.organizationId]
      );
      const organization = organizations[0];
      if (!organization || organization.organizationType !== expectedType ||
          (assignmentChanged && organization.status !== "ACTIVE")) {
        throw new AppError(400, "VALIDATION_ERROR",
          input.role === "DOCTOR" ? "Select an active clinic for a new doctor assignment." : "Select an active pharmacy for a new pharmacist assignment.");
      }

      const displayName = `${input.firstName} ${input.lastName}`;
      await connection.query(
        `UPDATE practitioners SET first_name = ?, last_name = ?, license_number = ?,
             specialty = ?, phone = ?, professional_email = ? WHERE id = ?`,
        [input.firstName, input.lastName, input.licenseNumber, nullable(input.specialty),
         nullable(input.phone), input.email.toLowerCase(), practitioner.id]
      );
      if (assignmentChanged) {
        await connection.query(
          `UPDATE practitioner_organizations
              SET status = 'ENDED', ended_on = COALESCE(ended_on, UTC_DATE()), is_primary = FALSE
            WHERE practitioner_id = ? AND status = 'ACTIVE' AND is_primary = TRUE`,
          [practitioner.id]
        );
        await connection.query(
          `INSERT INTO practitioner_organizations
            (practitioner_id, organization_id, professional_role, position_title,
             is_primary, started_on, status)
           VALUES (?, ?, ?, ?, TRUE, UTC_DATE(), 'ACTIVE')
           ON DUPLICATE KEY UPDATE professional_role = VALUES(professional_role),
             position_title = VALUES(position_title), is_primary = TRUE,
             ended_on = NULL, status = 'ACTIVE'`,
          [practitioner.id, input.organizationId, input.role, nullable(input.positionTitle)]
        );
      } else {
        await connection.query(
          `UPDATE practitioner_organizations SET position_title = ? WHERE id = ?`,
          [nullable(input.positionTitle), currentAssignment.id]
        );
      }
      await connection.query(
        `UPDATE users SET email = ?, display_name = ?, role_id = ? WHERE id = ?`,
        [input.email.toLowerCase(), displayName, roleRows[0].id, userId]
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
