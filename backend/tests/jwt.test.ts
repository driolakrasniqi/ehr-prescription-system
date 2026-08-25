import test from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
process.env.DB_HOST = "127.0.0.1";
process.env.DB_NAME = "test";
process.env.DB_USER = "test";
process.env.DB_PASSWORD = "test";
process.env.FRONTEND_URL = "http://localhost:5174";
process.env.JWT_ACCESS_SECRET = "test-secret-that-is-at-least-thirty-two-characters-long";

test(
  "access token round-trip preserves subject, role and version",
  async () => {
    const {
      signAccessToken,
      verifyAccessToken
    } = await import("../src/utils/jwt.js");

    const decoded = verifyAccessToken(
      signAccessToken(42, "DOCTOR", 0)
    );

    assert.equal(decoded.sub, "42");
    assert.equal(decoded.role, "DOCTOR");
    assert.equal(decoded.version, 0);
    assert.equal(decoded.type, "access");
  }
);
