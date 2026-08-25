import { AppError } from "../utils/errors.js";
import type {
  ResultSetHeader,
  RowDataPacket
} from "mysql2/promise";

import {
  databasePool
} from "../config/database.js";

import type {
  UserRole,
  UserStatus
} from "../types/auth.types.js";

export interface UserAuthRecord
  extends RowDataPacket {
  id: number;
  email: string;
  password_hash: string;
  display_name: string | null;
  status: UserStatus;
  failed_login_count: number;
  locked_until: Date | null;
  password_changed_at: Date | null;
  token_version: number;
  role_code: UserRole;
}

export interface RefreshTokenRecord
  extends RowDataPacket {
  id: number;
  user_id: number;
  expires_at: Date;
  revoked_at: Date | null;
  replaced_by_token_id: number | null;
}

interface RoleIdRow
  extends RowDataPacket {
  id: number;
}

export interface CreatePatientAccountInput {
  email: string;
  passwordHash: string;
  displayName: string;
  patientNumber: string;

  firstName: string;
  lastName: string;
  dateOfBirth: string;

  sex:
    | "FEMALE"
    | "MALE";

  phone: string | null;
}

const USER_AUTH_SELECT = `
  SELECT
    u.id,
    u.email,
    u.password_hash,
    u.display_name,
    u.status,
    u.failed_login_count,
    u.locked_until,
    u.password_changed_at,
    u.token_version,
    r.code AS role_code
  FROM users u
  JOIN roles r
    ON r.id = u.role_id
`;

export async function findUserByEmail(
  email: string
): Promise<UserAuthRecord | null> {
  const [rows] =
    await databasePool.query<
      UserAuthRecord[]
    >(
      `
        ${USER_AUTH_SELECT}
        WHERE u.email = ?
        LIMIT 1
      `,
      [email]
    );

  return rows[0] ?? null;
}

export async function findUserById(
  id: number
): Promise<UserAuthRecord | null> {
  const [rows] =
    await databasePool.query<
      UserAuthRecord[]
    >(
      `
        ${USER_AUTH_SELECT}
        WHERE u.id = ?
        LIMIT 1
      `,
      [id]
    );

  return rows[0] ?? null;
}

/**
 * Records a failed login attempt.
 */
export async function registerFailedLogin(
  userId: number,
  failedLoginCount: number,
  lockedUntil: Date | null,
  status: UserStatus
): Promise<void> {
  await databasePool.query(
    `
      UPDATE users
      SET
        failed_login_count = ?,
        locked_until = ?,
        status = ?
      WHERE id = ?
    `,
    [
      failedLoginCount,
      lockedUntil,
      status,
      userId
    ]
  );
}

/**
 * Resets lockout state and records
 * a successful login.
 */
export async function registerSuccessfulLogin(
  userId: number
): Promise<void> {
  await databasePool.query(
    `
      UPDATE users
      SET
        failed_login_count = 0,
        locked_until = NULL,
        status = 'ACTIVE',
        last_login_at = UTC_TIMESTAMP(3)
      WHERE id = ?
    `,
    [userId]
  );
}

export async function incrementTokenVersion(
  userId: number
): Promise<void> {
  await databasePool.query(
    `
      UPDATE users
      SET token_version = token_version + 1
      WHERE id = ?
    `,
    [userId]
  );
}

export async function insertRefreshToken(
  params: {
    userId: number;
    tokenHash: Buffer;
    expiresAt: Date;
    ipAddress: string | null;
    userAgent: string | null;
  }
): Promise<number> {
  const [result] =
    await databasePool.query<
      ResultSetHeader
    >(
      `
        INSERT INTO refresh_tokens (
          user_id,
          token_hash,
          expires_at,
          ip_address,
          user_agent
        )
        VALUES (?, ?, ?, ?, ?)
      `,
      [
        params.userId,
        params.tokenHash,
        params.expiresAt,
        params.ipAddress,
        params.userAgent
      ]
    );

  return result.insertId;
}

export async function findRefreshTokenByHash(
  tokenHash: Buffer
): Promise<RefreshTokenRecord | null> {
  const [rows] =
    await databasePool.query<
      RefreshTokenRecord[]
    >(
      `
        SELECT
          id,
          user_id,
          expires_at,
          revoked_at,
          replaced_by_token_id
        FROM refresh_tokens
        WHERE token_hash = ?
        LIMIT 1
      `,
      [tokenHash]
    );

  return rows[0] ?? null;
}

export async function revokeRefreshTokenById(
  id: number
): Promise<void> {
  await databasePool.query(
    `
      UPDATE refresh_tokens
      SET revoked_at = UTC_TIMESTAMP(3)
      WHERE id = ?
        AND revoked_at IS NULL
    `,
    [id]
  );
}

/**
 * Atomically rotates a refresh token.
 */
export async function rotateRefreshToken(
  params: {
    oldTokenId: number;
    userId: number;
    newTokenHash: Buffer;
    newExpiresAt: Date;
    ipAddress: string | null;
    userAgent: string | null;
  }
): Promise<number> {
  const connection =
    await databasePool.getConnection();

  try {
    await connection.beginTransaction();

    const [lockedRows] = await connection.query<RefreshTokenRecord[]>(
      `SELECT id, user_id, expires_at, revoked_at, replaced_by_token_id
       FROM refresh_tokens WHERE id = ? FOR UPDATE`,
      [params.oldTokenId]
    );
    const lockedToken = lockedRows[0];
    if (!lockedToken || lockedToken.revoked_at !== null || lockedToken.user_id !== params.userId) {
      throw new AppError(401, "UNAUTHENTICATED", "The refresh token has already been used or revoked.");
    }

    const [insertResult] =
      await connection.query<
        ResultSetHeader
      >(
        `
          INSERT INTO refresh_tokens (
            user_id,
            token_hash,
            expires_at,
            ip_address,
            user_agent
          )
          VALUES (?, ?, ?, ?, ?)
        `,
        [
          params.userId,
          params.newTokenHash,
          params.newExpiresAt,
          params.ipAddress,
          params.userAgent
        ]
      );

    const newTokenId =
      insertResult.insertId;

    await connection.query(
      `
        UPDATE refresh_tokens
        SET
          revoked_at = UTC_TIMESTAMP(3),
          replaced_by_token_id = ?
        WHERE id = ?
      `,
      [
        newTokenId,
        params.oldTokenId
      ]
    );

    await connection.commit();

    return newTokenId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function createPatientAccount(
  input: CreatePatientAccountInput
): Promise<number> {
  const connection =
    await databasePool.getConnection();

  try {
    await connection.beginTransaction();

    /*
     * Get the PATIENT role.
     * The frontend never chooses the role.
     */
    const [roleRows] =
      await connection.query<
        RoleIdRow[]
      >(
        `
          SELECT id
          FROM roles
          WHERE code = 'PATIENT'
            AND is_active = TRUE
          LIMIT 1
        `
      );

    const patientRole =
      roleRows[0];

    if (!patientRole) {
      throw new Error(
        "The PATIENT role is not configured."
      );
    }

    /*
     * First create the authentication account.
     */
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
          patientRole.id,
          input.email,
          input.passwordHash,
          input.displayName
        ]
      );

    const userId =
      userResult.insertId;

    /*
     * Then create the patient's
     * healthcare profile.
     *
     * IMPORTANT:
     * The database column is "sex",
     * not "gender".
     */
    await connection.query<
      ResultSetHeader
    >(
      `
        INSERT INTO patients (
          user_id,
          patient_number,
          first_name,
          last_name,
          date_of_birth,
          sex,
          phone,
          email,
          status,
          created_by_user_id
        )
        VALUES (
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          'ACTIVE',
          ?
        )
      `,
      [
        userId,
        input.patientNumber,
        input.firstName,
        input.lastName,
        input.dateOfBirth,
        input.sex,
        input.phone,
        input.email,
        userId
      ]
    );

    await connection.commit();

    return userId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function revokeAllRefreshTokensForUser(userId: number): Promise<void> {
  await databasePool.query(
    `UPDATE refresh_tokens SET revoked_at = UTC_TIMESTAMP(3) WHERE user_id = ? AND revoked_at IS NULL`,
    [userId]
  );
}

export async function updatePassword(
  userId: number,
  passwordHash: string
): Promise<void> {
  await databasePool.query(
    `
      UPDATE users
      SET
        password_hash = ?,
        password_changed_at = UTC_TIMESTAMP(3),
        token_version = token_version + 1
      WHERE id = ?
    `,
    [passwordHash, userId]
  );
}