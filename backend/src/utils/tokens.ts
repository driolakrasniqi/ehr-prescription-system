import crypto from "node:crypto";

const REFRESH_TOKEN_BYTES = 48;

/**
 * Generates a cryptographically random opaque refresh token (not a
 * JWT). The raw value is only ever sent to the client in the
 * HttpOnly cookie — it is never persisted in the database directly.
 */
export function generateRefreshToken(): string {
  return crypto.randomBytes(REFRESH_TOKEN_BYTES).toString("base64url");
}

/**
 * Hashes a raw refresh token with SHA-256 for storage/lookup.
 * Returns a 32-byte Buffer matching refresh_tokens.token_hash BINARY(32).
 */
export function hashRefreshToken(token: string): Buffer {
  return crypto.createHash("sha256").update(token, "utf8").digest();
}
