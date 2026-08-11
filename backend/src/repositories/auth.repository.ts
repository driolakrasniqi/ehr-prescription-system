import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { databasePool } from "../config/database.js";
import type { UserRole, UserStatus } from "../types/auth.types.js";

export interface UserAuthRecord extends RowDataPacket {
  id: number;
  email: string;
  password_hash: string;
  display_name: string | null;
  status: UserStatus;
  failed_login_count: number;
  locked_until: Date | null;
  role_code: UserRole;
}

export interface RefreshTokenRecord extends RowDataPacket {
  id: number;
  user_id: number;
  expires_at: Date;
  revoked_at: Date | null;
  replaced_by_token_id: number | null;
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
    r.code AS role_code
  FROM users u
  JOIN roles r ON r.id = u.role_id
`;

export async function findUserByEmail(email: string): Promise<UserAuthRecord | null> {
  const [rows] = await databasePool.query<UserAuthRecord[]>(
    `${USER_AUTH_SELECT} WHERE u.email = ? LIMIT 1`,
    [email]
  );

  return rows[0] ?? null;
}

export async function findUserById(id: number): Promise<UserAuthRecord | null> {
  const [rows] = await databasePool.query<UserAuthRecord[]>(
    `${USER_AUTH_SELECT} WHERE u.id = ? LIMIT 1`,
    [id]
  );

  return rows[0] ?? null;
}

/**
 * Records a failed login attempt: updates the failed-attempt counter
 * and, when the caller has decided to lock the account, the lock
 * expiry and status.
 */
export async function registerFailedLogin(
  userId: number,
  failedLoginCount: number,
  lockedUntil: Date | null,
  status: UserStatus
): Promise<void> {
  await databasePool.query(
    `UPDATE users
     SET failed_login_count = ?, locked_until = ?, status = ?
     WHERE id = ?`,
    [failedLoginCount, lockedUntil, status, userId]
  );
}

/**
 * Resets lockout state and records a successful login.
 */
export async function registerSuccessfulLogin(userId: number): Promise<void> {
  await databasePool.query(
    `UPDATE users
     SET failed_login_count = 0,
         locked_until = NULL,
         status = 'ACTIVE',
         last_login_at = UTC_TIMESTAMP(3)
     WHERE id = ?`,
    [userId]
  );
}

export async function insertRefreshToken(params: {
  userId: number;
  tokenHash: Buffer;
  expiresAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
}): Promise<number> {
  const [result] = await databasePool.query<ResultSetHeader>(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?)`,
    [params.userId, params.tokenHash, params.expiresAt, params.ipAddress, params.userAgent]
  );

  return result.insertId;
}

export async function findRefreshTokenByHash(tokenHash: Buffer): Promise<RefreshTokenRecord | null> {
  const [rows] = await databasePool.query<RefreshTokenRecord[]>(
    `SELECT id, user_id, expires_at, revoked_at, replaced_by_token_id
     FROM refresh_tokens
     WHERE token_hash = ?
     LIMIT 1`,
    [tokenHash]
  );

  return rows[0] ?? null;
}

export async function revokeRefreshTokenById(id: number): Promise<void> {
  await databasePool.query(
    `UPDATE refresh_tokens
     SET revoked_at = UTC_TIMESTAMP(3)
     WHERE id = ? AND revoked_at IS NULL`,
    [id]
  );
}

/**
 * Atomically rotates a refresh token: inserts the new token row and
 * marks the old one revoked + replaced-by, in a single transaction.
 */
export async function rotateRefreshToken(params: {
  oldTokenId: number;
  userId: number;
  newTokenHash: Buffer;
  newExpiresAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
}): Promise<number> {
  const connection = await databasePool.getConnection();

  try {
    await connection.beginTransaction();

    const [insertResult] = await connection.query<ResultSetHeader>(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?)`,
      [params.userId, params.newTokenHash, params.newExpiresAt, params.ipAddress, params.userAgent]
    );

    const newTokenId = insertResult.insertId;

    await connection.query(
      `UPDATE refresh_tokens
       SET revoked_at = UTC_TIMESTAMP(3), replaced_by_token_id = ?
       WHERE id = ?`,
      [newTokenId, params.oldTokenId]
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
