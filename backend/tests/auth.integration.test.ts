import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";

process.env.NODE_ENV = "test";
process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS = "1000";

type JsonObject = Record<string, any>;

let server: Server;
let baseUrl: string;
let databasePool: typeof import("../src/config/database.js").databasePool;

const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const email = (name: string) => `${name}.${runId}@example.com`;

async function request(
  path: string,
  options: {
    method?: string;
    body?: JsonObject;
    token?: string;
    cookie?: string;
  } = {}
) {
  const headers: Record<string, string> = {};
  if (options.body) headers["content-type"] = "application/json";
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  if (options.cookie) headers.cookie = options.cookie;

  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const setCookie = response.headers.get("set-cookie");
  const body = (await response.json()) as JsonObject;

  return {
    status: response.status,
    body,
    cookie: setCookie?.split(";", 1)[0] ?? null
  };
}

async function registerPatient(patientEmail: string, password = "PatientPass123!") {
  return request("/api/v1/auth/register", {
    method: "POST",
    body: {
      firstName: "Integration",
      lastName: "Patient",
      dateOfBirth: "1990-01-01",
      sex: "MALE",
      phone: "+38344000000",
      email: patientEmail,
      password,
      confirmPassword: password,
      role: "ADMIN"
    }
  });
}

async function login(userEmail: string, password: string) {
  return request("/api/v1/auth/login", {
    method: "POST",
    body: { email: userEmail, password }
  });
}

before(async () => {
  const envModule = await import("../src/config/env.js");
  assert.match(
    envModule.env.DB_NAME,
    /test/i,
    "Integration tests must use a dedicated database whose name contains 'test'."
  );

  const appModule = await import("../src/app.js");
  const databaseModule = await import("../src/config/database.js");
  databasePool = databaseModule.databasePool;

  server = appModule.app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });

  const address = server.address();
  assert(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (!databasePool) {
    if (server?.listening) {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
    }
    return;
  }
  const [rows] = await databasePool.query<any[]>("SELECT id FROM users WHERE email LIKE ?", [
    `%.${runId}@example.com`
  ]);
  const ids = rows.map((row) => Number(row.id));

  if (ids.length > 0) {
    const placeholders = ids.map(() => "?").join(",");
    await databasePool.query(`DELETE FROM refresh_tokens WHERE user_id IN (${placeholders})`, ids);
    await databasePool.query(`DELETE FROM patients WHERE user_id IN (${placeholders})`, ids);
    await databasePool.query(
      `DELETE FROM audit_events WHERE actor_user_id IN (${placeholders})`,
      ids
    );
    await databasePool.query(`DELETE FROM users WHERE id IN (${placeholders})`, ids);
  }

  await databasePool.end();
  if (server?.listening) {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});

test("patient registration creates an ACTIVE PATIENT and patient profile", async () => {
  const patientEmail = email("register");
  const result = await registerPatient(patientEmail);

  assert.equal(result.status, 201);
  assert.equal(result.body.data.user.email, patientEmail);
  assert.equal(result.body.data.user.role, "PATIENT");
  assert.equal(result.body.data.user.status, "ACTIVE");

  const [rows] = await databasePool.query<any[]>(
    `SELECT r.code AS role_code, p.id AS patient_id
     FROM users u
     JOIN roles r ON r.id = u.role_id
     LEFT JOIN patients p ON p.user_id = u.id
     WHERE u.email = ?`,
    [patientEmail]
  );
  assert.equal(rows[0].role_code, "PATIENT");
  assert.ok(rows[0].patient_id);
});

test("duplicate patient email is rejected", async () => {
  const patientEmail = email("duplicate");
  assert.equal((await registerPatient(patientEmail)).status, 201);
  const duplicate = await registerPatient(patientEmail);
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.error.code, "CONFLICT");
});

test("unknown email and incorrect password return the same error", async () => {
  const patientEmail = email("credentials");
  await registerPatient(patientEmail);

  const unknown = await login(email("unknown"), "WrongPassword123!");
  const wrong = await login(patientEmail, "WrongPassword123!");

  assert.equal(unknown.status, 401);
  assert.equal(wrong.status, 401);
  assert.equal(unknown.body.error.code, "INVALID_CREDENTIALS");
  assert.equal(wrong.body.error.code, "INVALID_CREDENTIALS");
  assert.equal(unknown.body.error.message, wrong.body.error.message);
});

test("account locks after five failed login attempts", async () => {
  const patientEmail = email("lockout");
  await registerPatient(patientEmail);

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const result = await login(patientEmail, "WrongPassword123!");
    assert.equal(result.status, 401);
    assert.equal(result.body.error.code, "INVALID_CREDENTIALS");
  }

  const fifth = await login(patientEmail, "WrongPassword123!");
  assert.equal(fifth.status, 401);
  assert.equal(fifth.body.error.code, "ACCOUNT_LOCKED");

  const [rows] = await databasePool.query<any[]>(
    "SELECT status, failed_login_count, locked_until FROM users WHERE email = ?",
    [patientEmail]
  );
  assert.equal(rows[0].status, "LOCKED");
  assert.equal(rows[0].failed_login_count, 5);
  assert.ok(rows[0].locked_until);

  const correctWhileLocked = await login(patientEmail, "PatientPass123!");
  assert.equal(correctWhileLocked.status, 401);
  assert.equal(correctWhileLocked.body.error.code, "ACCOUNT_LOCKED");
});

test("an expired account lock is cleared by a successful login", async () => {
  const patientEmail = email("expired-lock");
  await registerPatient(patientEmail);
  await databasePool.query(
    `UPDATE users
     SET status = 'LOCKED', failed_login_count = 5,
         locked_until = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 MINUTE)
     WHERE email = ?`,
    [patientEmail]
  );

  const result = await login(patientEmail, "PatientPass123!");
  assert.equal(result.status, 200);

  const [rows] = await databasePool.query<any[]>(
    "SELECT status, failed_login_count, locked_until FROM users WHERE email = ?",
    [patientEmail]
  );
  assert.equal(rows[0].status, "ACTIVE");
  assert.equal(rows[0].failed_login_count, 0);
  assert.equal(rows[0].locked_until, null);
});

test("successful login resets the failed-login counter", async () => {
  const patientEmail = email("reset-counter");
  await registerPatient(patientEmail);
  await login(patientEmail, "WrongPassword123!");

  const successful = await login(patientEmail, "PatientPass123!");
  assert.equal(successful.status, 200);

  const [rows] = await databasePool.query<any[]>(
    "SELECT status, failed_login_count, locked_until FROM users WHERE email = ?",
    [patientEmail]
  );
  assert.equal(rows[0].status, "ACTIVE");
  assert.equal(rows[0].failed_login_count, 0);
  assert.equal(rows[0].locked_until, null);
});

test("disabled and pending accounts cannot log in", async () => {
  const disabledEmail = email("disabled");
  const pendingEmail = email("pending");
  await registerPatient(disabledEmail);
  await registerPatient(pendingEmail);
  await databasePool.query("UPDATE users SET status = 'DISABLED' WHERE email = ?", [disabledEmail]);
  await databasePool.query("UPDATE users SET status = 'PENDING' WHERE email = ?", [pendingEmail]);

  const disabled = await login(disabledEmail, "PatientPass123!");
  const pending = await login(pendingEmail, "PatientPass123!");
  assert.equal(disabled.status, 401);
  assert.equal(disabled.body.error.code, "ACCOUNT_DISABLED");
  assert.equal(pending.status, 401);
  assert.equal(pending.body.error.code, "ACCOUNT_NOT_ACTIVE");
});

test("/me rejects missing and malformed access tokens", async () => {
  const missing = await request("/api/v1/auth/me");
  const malformed = await request("/api/v1/auth/me", { token: "not-a-jwt" });
  assert.equal(missing.status, 401);
  assert.equal(malformed.status, 401);
  assert.equal(missing.body.error.code, "UNAUTHENTICATED");
  assert.equal(malformed.body.error.code, "UNAUTHENTICATED");
});

test("/me rejects an expired access token", async () => {
  const envModule = await import("../src/config/env.js");
  const expiredToken = jwt.sign(
    { sub: "1", role: "PATIENT", version: 0, type: "access" },
    envModule.env.JWT_ACCESS_SECRET,
    { expiresIn: -1 }
  );
  const result = await request("/api/v1/auth/me", { token: expiredToken });
  assert.equal(result.status, 401);
  assert.equal(result.body.error.code, "UNAUTHENTICATED");
});

test("refresh rotates the refresh token and rejects reuse of the old token", async () => {
  const patientEmail = email("rotation");
  await registerPatient(patientEmail);
  const session = await login(patientEmail, "PatientPass123!");
  assert.equal(session.status, 200);
  assert.ok(session.cookie);

  const refreshed = await request("/api/v1/auth/refresh", {
    method: "POST",
    cookie: session.cookie!
  });
  assert.equal(refreshed.status, 200);
  assert.ok(refreshed.body.data.accessToken);
  assert.ok(refreshed.cookie);
  assert.notEqual(refreshed.cookie, session.cookie);

  const reused = await request("/api/v1/auth/refresh", {
    method: "POST",
    cookie: session.cookie!
  });
  assert.equal(reused.status, 401);
  assert.equal(reused.body.error.code, "UNAUTHENTICATED");
});

test("logout revokes the current refresh token", async () => {
  const patientEmail = email("logout");
  await registerPatient(patientEmail);
  const session = await login(patientEmail, "PatientPass123!");

  const logout = await request("/api/v1/auth/logout", {
    method: "POST",
    cookie: session.cookie!
  });
  assert.equal(logout.status, 200);

  const refresh = await request("/api/v1/auth/refresh", {
    method: "POST",
    cookie: session.cookie!
  });
  assert.equal(refresh.status, 401);
});

test("logout-all invalidates old access and refresh tokens", async () => {
  const patientEmail = email("logout-all");
  await registerPatient(patientEmail);
  const session = await login(patientEmail, "PatientPass123!");
  const accessToken = session.body.data.accessToken as string;

  assert.equal((await request("/api/v1/auth/me", { token: accessToken })).status, 200);
  assert.equal(
    (await request("/api/v1/auth/logout-all", { method: "POST", token: accessToken })).status,
    200
  );

  const oldAccess = await request("/api/v1/auth/me", { token: accessToken });
  assert.equal(oldAccess.status, 401);
  assert.equal(oldAccess.body.error.code, "SESSION_INVALIDATED");

  const oldRefresh = await request("/api/v1/auth/refresh", {
    method: "POST",
    cookie: session.cookie!
  });
  assert.equal(oldRefresh.status, 401);
});

test("password change validates current password and invalidates old sessions", async () => {
  const patientEmail = email("password-change");
  const oldPassword = "PatientPass123!";
  const newPassword = "NewPatientPass123!";
  await registerPatient(patientEmail, oldPassword);
  const session = await login(patientEmail, oldPassword);
  const accessToken = session.body.data.accessToken as string;

  const wrongCurrent = await request("/api/v1/auth/change-password", {
    method: "POST",
    token: accessToken,
    body: {
      currentPassword: "WrongPassword123!",
      newPassword,
      confirmPassword: newPassword
    }
  });
  assert.equal(wrongCurrent.status, 401);
  assert.equal(wrongCurrent.body.error.code, "INVALID_CREDENTIALS");

  const changed = await request("/api/v1/auth/change-password", {
    method: "POST",
    token: accessToken,
    body: { currentPassword: oldPassword, newPassword, confirmPassword: newPassword }
  });
  assert.equal(changed.status, 200);

  const oldAccess = await request("/api/v1/auth/me", { token: accessToken });
  assert.equal(oldAccess.status, 401);
  assert.equal(oldAccess.body.error.code, "SESSION_INVALIDATED");
  assert.equal((await login(patientEmail, oldPassword)).status, 401);
  assert.equal((await login(patientEmail, newPassword)).status, 200);
});

test("patient can view and update only their own safe profile fields", async () => {
  const patientEmail = email("self-profile");
  await registerPatient(patientEmail);
  const session = await login(patientEmail, "PatientPass123!");
  const token = session.body.data.accessToken as string;

  const profile = await request("/api/v1/patient/profile", { token });
  assert.equal(profile.status, 200, JSON.stringify(profile.body));
  assert.equal(profile.body.data.profile.email, patientEmail);
  assert.equal(profile.body.data.profile.firstName, "Integration");
  assert.ok(profile.body.data.profile.patientNumber);

  const updated = await request("/api/v1/patient/profile", {
    method: "PATCH",
    token,
    body: {
      phone: "+38344123456",
      occupation: "Teacher",
      maritalStatus: "MARRIED",
      smokingStatus: "NEVER",
      addressLine1: "Example Street 1",
      addressLine2: "",
      city: "Prishtina",
      postalCode: "10000",
      countryCode: "XK"
    }
  });
  assert.equal(updated.status, 200, JSON.stringify(updated.body));
  assert.equal(updated.body.data.profile.phone, "+38344123456");
  assert.equal(updated.body.data.profile.city, "Prishtina");

  const [rows] = await databasePool.query<any[]>(
    `SELECT p.phone, p.city, p.marital_status, p.updated_by_user_id, u.id AS user_id
       FROM patients p JOIN users u ON u.id = p.user_id WHERE u.email = ?`,
    [patientEmail]
  );
  assert.equal(rows[0].phone, "+38344123456");
  assert.equal(rows[0].city, "Prishtina");
  assert.equal(rows[0].marital_status, "MARRIED");
  assert.equal(Number(rows[0].updated_by_user_id), Number(rows[0].user_id));
});

test("patient cannot update protected identity fields", async () => {
  const patientEmail = email("protected-profile");
  await registerPatient(patientEmail);
  const session = await login(patientEmail, "PatientPass123!");

  const result = await request("/api/v1/patient/profile", {
    method: "PATCH",
    token: session.body.data.accessToken,
    body: {
      firstName: "Changed",
      phone: "",
      occupation: "",
      maritalStatus: "UNKNOWN",
      smokingStatus: "UNKNOWN",
      addressLine1: "",
      addressLine2: "",
      city: "",
      postalCode: "",
      countryCode: "XK"
    }
  });
  assert.equal(result.status, 400, JSON.stringify(result.body));
  assert.equal(result.body.error.code, "VALIDATION_ERROR");
});
