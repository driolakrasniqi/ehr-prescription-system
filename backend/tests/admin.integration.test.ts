import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import type { Server } from "node:http";
import bcrypt from "bcryptjs";

process.env.NODE_ENV = "test";
process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS = "1000";

type JsonObject = Record<string, any>;

let server: Server;
let baseUrl: string;
let databasePool: typeof import("../src/config/database.js").databasePool;
let adminToken: string;
let adminId: number;
let organizationId: number;

const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const adminEmail = `admin.${runId}@example.com`;
const patientEmail = `patient.${runId}@example.com`;
const adminPassword = "AdminPassword123!";
const patientPassword = "PatientPassword123!";

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
  return {
    status: response.status,
    body: (await response.json()) as JsonObject,
    cookie: setCookie?.split(";", 1)[0] ?? null
  };
}

async function login(email: string, password: string) {
  return request("/api/v1/auth/login", {
    method: "POST",
    body: { email, password }
  });
}

async function createStaff(
  role: "DOCTOR" | "PHARMACIST",
  marker: string
) {
  const markerCode = Array.from(marker)
    .reduce(
      (hash, character) =>
        (
          hash * 31 +
          character.charCodeAt(0)
        ) >>> 0,
      0
    )
    .toString(36)
    .toUpperCase();

  const uniqueCode =
    `${markerCode}-${runId.slice(-12)}`;

  return request(
    "/api/v1/admin/staff",
    {
      method: "POST",
      token: adminToken,
      body: {
        email:
          `${marker}.${runId}@example.com`,

        password:
          "StaffPassword123!",

        firstName:
          role === "DOCTOR"
            ? "Doctor"
            : "Pharmacist",

        lastName:
          "Integration",

        role,

        practitionerNumber:
          `PR-${uniqueCode}`,

        licenseNumber:
          `LIC-${uniqueCode}`,

        specialty:
          role === "DOCTOR"
            ? "General Medicine"
            : "Community Pharmacy",

        phone:
          "+38344111222",

        organizationId,

        positionTitle:
          role
      }
    }
  );
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

  const passwordHash = await bcrypt.hash(adminPassword, 12);
  const [adminResult] = await databasePool.query<any>(
    `INSERT INTO users (role_id, email, password_hash, display_name, status, password_changed_at)
     SELECT id, ?, ?, 'Integration Administrator', 'ACTIVE', UTC_TIMESTAMP(3)
     FROM roles WHERE code = 'ADMIN'`,
    [adminEmail, passwordHash]
  );
  adminId = Number(adminResult.insertId);

  const [organizationResult] = await databasePool.query<any>(
    `INSERT INTO organizations
       (organization_code, organization_type, name, license_number, status)
     VALUES (?, 'CLINIC', 'Integration Clinic', ?, 'ACTIVE')`,
    [`ORG-${runId}`, `ORG-LIC-${runId}`]
  );
  organizationId = Number(organizationResult.insertId);

  server = appModule.app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  assert(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;

  const adminSession = await login(adminEmail, adminPassword);
  assert.equal(adminSession.status, 200);
  adminToken = adminSession.body.data.accessToken;

  const registration = await request("/api/v1/auth/register", {
    method: "POST",
    body: {
      firstName: "Role",
      lastName: "Patient",
      dateOfBirth: "1990-01-01",
      sex: "FEMALE",
      email: patientEmail,
      password: patientPassword,
      confirmPassword: patientPassword
    }
  });
  assert.equal(registration.status, 201);
});

after(async () => {
  const [rows] = await databasePool.query<any[]>(
    "SELECT id FROM users WHERE email LIKE ?",
    [`%.${runId}@example.com`]
  );
  const ids = rows.map((row) => Number(row.id));

  if (ids.length > 0) {
    const placeholders = ids.map(() => "?").join(",");
    await databasePool.query(
      `DELETE FROM refresh_tokens WHERE user_id IN (${placeholders})`, ids
    );
    await databasePool.query(
      `DELETE FROM practitioner_organizations WHERE practitioner_id IN
       (SELECT id FROM practitioners WHERE user_id IN (${placeholders}))`, ids
    );
    await databasePool.query(
      `DELETE FROM practitioners WHERE user_id IN (${placeholders})`, ids
    );
    await databasePool.query(
      `DELETE FROM patients WHERE user_id IN (${placeholders})`, ids
    );
    await databasePool.query(
      `DELETE FROM audit_events WHERE actor_user_id IN (${placeholders})`, ids
    );
    await databasePool.query(`DELETE FROM users WHERE id IN (${placeholders})`, ids);
  }

  await databasePool.query("DELETE FROM organizations WHERE id = ?", [organizationId]);
  await databasePool.end();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
});

test("unauthenticated admin request returns 401", async () => {
  const result = await request("/api/v1/admin/users");
  assert.equal(result.status, 401);
  assert.equal(result.body.error.code, "UNAUTHENTICATED");
});

test("patient request to an admin endpoint returns 403", async () => {
  const patientSession = await login(patientEmail, patientPassword);
  const result = await request("/api/v1/admin/users", {
    token: patientSession.body.data.accessToken
  });
  assert.equal(result.status, 403);
  assert.equal(result.body.error.code, "FORBIDDEN");
});

test("administrator can list users and roles", async () => {
  const users = await request("/api/v1/admin/users", { token: adminToken });
  const roles = await request("/api/v1/admin/roles", { token: adminToken });
  assert.equal(users.status, 200);
  assert.ok(Array.isArray(users.body.data.users));
  assert.equal(roles.status, 200);
  assert.deepEqual(
    new Set(roles.body.data.roles.map((role: any) => role.code)),
    new Set(["ADMIN", "DOCTOR", "PHARMACIST", "PATIENT"])
  );
});

test("administrator creates complete doctor and pharmacist staff accounts", async () => {
  const doctor = await createStaff("DOCTOR", "doctor-create");
  const pharmacist = await createStaff("PHARMACIST", "pharmacist-create");
  assert.equal(doctor.status, 201);
  assert.equal(pharmacist.status, 201);

  const [rows] = await databasePool.query<any[]>(
    `SELECT u.email, r.code AS role_code, p.id AS practitioner_id,
            po.organization_id, po.professional_role
     FROM users u
     JOIN roles r ON r.id = u.role_id
     JOIN practitioners p ON p.user_id = u.id
     JOIN practitioner_organizations po ON po.practitioner_id = p.id
     WHERE u.id IN (?, ?)`,
    [doctor.body.data.userId, pharmacist.body.data.userId]
  );
  assert.equal(rows.length, 2);
  assert.deepEqual(new Set(rows.map((row) => row.role_code)), new Set(["DOCTOR", "PHARMACIST"]));
  assert.ok(rows.every((row) => Number(row.organization_id) === organizationId));
});

test("duplicate staff identity is rejected without creating another user", async () => {
  const first = await createStaff("DOCTOR", "duplicate-staff");
  assert.equal(first.status, 201);

  const duplicate = await createStaff("DOCTOR", "duplicate-staff");
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.error.code, "CONFLICT");

  const [rows] = await databasePool.query<any[]>(
    "SELECT COUNT(*) AS total FROM users WHERE email = ?",
    [`duplicate-staff.${runId}@example.com`]
  );
  assert.equal(Number(rows[0].total), 1);
});

test("staff transaction rolls back when the organization is invalid", async () => {
  const targetEmail = `rollback-staff.${runId}@example.com`;
  const result = await request("/api/v1/admin/staff", {
    method: "POST",
    token: adminToken,
    body: {
      email: targetEmail,
      password: "RollbackPassword123!",
      firstName: "Rollback",
      lastName: "Staff",
      role: "DOCTOR",
      practitionerNumber: `ROLLBACK-PR-${runId}`,
      licenseNumber: `ROLLBACK-LIC-${runId}`,
      organizationId: 4294967295
    }
  });
  assert.equal(result.status, 400);

  const [rows] = await databasePool.query<any[]>(
    "SELECT COUNT(*) AS total FROM users WHERE email = ?",
    [targetEmail]
  );
  assert.equal(Number(rows[0].total), 0);
});

test("doctor and pharmacist cannot access admin routes", async () => {
  const doctorCreated = await createStaff("DOCTOR", "doctor-forbidden");
  const pharmacistCreated = await createStaff("PHARMACIST", "pharmacist-forbidden");

  assert.equal(doctorCreated.status, 201, JSON.stringify(doctorCreated.body));
  assert.equal(pharmacistCreated.status, 201, JSON.stringify(pharmacistCreated.body));

  const doctorSession = await login(
    `doctor-forbidden.${runId}@example.com`,
    "StaffPassword123!"
  );

  const pharmacistSession = await login(
    `pharmacist-forbidden.${runId}@example.com`,
    "StaffPassword123!"
  );

  assert.equal(doctorSession.status, 200, JSON.stringify(doctorSession.body));
  assert.equal(pharmacistSession.status, 200, JSON.stringify(pharmacistSession.body));

  const doctorResult = await request("/api/v1/admin/users", {
    token: doctorSession.body.data.accessToken
  });

  const pharmacistResult = await request("/api/v1/admin/users", {
    token: pharmacistSession.body.data.accessToken
  });

  assert.equal(doctorResult.status, 403);
  assert.equal(doctorResult.body.error.code, "FORBIDDEN");
  assert.equal(pharmacistResult.status, 403);
  assert.equal(pharmacistResult.body.error.code, "FORBIDDEN");
});

test("staff creation rejects ADMIN and PATIENT roles", async () => {
  for (const role of ["ADMIN", "PATIENT"]) {
    const result = await request("/api/v1/admin/staff", {
      method: "POST",
      token: adminToken,
      body: {
        email: `${role.toLowerCase()}.${runId}@example.com`,
        password: "InvalidRole123!",
        firstName: "Invalid",
        lastName: "Role",
        role,
        practitionerNumber: `${role}-PR-${runId}`,
        licenseNumber: `${role}-LIC-${runId}`,
        organizationId
      }
    });
    assert.equal(result.status, 400);
    assert.equal(result.body.error.code, "VALIDATION_ERROR");
  }
});

test("administrator cannot demote or deactivate themselves", async () => {
  const demote = await request(`/api/v1/admin/users/${adminId}/role`, {
    method: "PATCH",
    token: adminToken,
    body: { role: "PATIENT" }
  });
  assert.equal(demote.status, 403);
  assert.equal(demote.body.error.code, "SELF_ROLE_CHANGE_NOT_ALLOWED");

  const disable = await request(`/api/v1/admin/users/${adminId}/status`, {
    method: "PATCH",
    token: adminToken,
    body: { status: "DISABLED" }
  });
  assert.equal(disable.status, 403);
  assert.equal(disable.body.error.code, "SELF_STATUS_CHANGE_NOT_ALLOWED");
});

test("role cannot be assigned without its required profile", async () => {
  const [rows] = await databasePool.query<any[]>(
    "SELECT id FROM users WHERE email = ?",
    [patientEmail]
  );
  const result = await request(`/api/v1/admin/users/${rows[0].id}/role`, {
    method: "PATCH",
    token: adminToken,
    body: { role: "DOCTOR" }
  });
  assert.equal(result.status, 409);
  assert.equal(result.body.error.code, "PROFILE_REQUIRED");
});

test(
  "role change revokes the target user's refresh sessions",
  async () => {
    const created =
      await createStaff(
        "DOCTOR",
        "role-refresh"
      );

    assert.equal(
      created.status,
      201,
      JSON.stringify(created.body)
    );

    const targetEmail =
      `role-refresh.${runId}@example.com`;

    const session =
      await login(
        targetEmail,
        "StaffPassword123!"
      );

    assert.equal(
      session.status,
      200,
      JSON.stringify(session.body)
    );

    assert.ok(
      session.cookie,
      "Login must return a refresh-token cookie."
    );

    const roleChanged =
      await request(
        `/api/v1/admin/users/${created.body.data.userId}/role`,
        {
          method: "PATCH",
          token: adminToken,
          body: {
            role: "ADMIN"
          }
        }
      );

    assert.equal(
      roleChanged.status,
      200,
      JSON.stringify(roleChanged.body)
    );

    const refreshResult =
      await request(
        "/api/v1/auth/refresh",
        {
          method: "POST",
          cookie: session.cookie
        }
      );

    assert.equal(
      refreshResult.status,
      401
    );

    assert.equal(
      refreshResult.body.error.code,
      "UNAUTHENTICATED"
    );
  }
);

test(
  "role change invalidates the target user's access token",
  async () => {
    const targetEmail =
      `role-access.${runId}@example.com`;

    const registration =
      await request(
        "/api/v1/auth/register",
        {
          method: "POST",
          body: {
            firstName: "Role",
            lastName: "Access",
            dateOfBirth: "1990-01-01",
            sex: "FEMALE",
            email: targetEmail,
            password:
              "RoleAccessPassword123!",
            confirmPassword:
              "RoleAccessPassword123!"
          }
        }
      );

    assert.equal(
      registration.status,
      201,
      JSON.stringify(registration.body)
    );

    const session =
      await login(
        targetEmail,
        "RoleAccessPassword123!"
      );

    assert.equal(
      session.status,
      200,
      JSON.stringify(session.body)
    );

    const oldAccessToken =
      session.body.data.accessToken as string;

    const roleChanged =
      await request(
        `/api/v1/admin/users/${registration.body.data.user.id}/role`,
        {
          method: "PATCH",
          token: adminToken,
          body: {
            role: "ADMIN"
          }
        }
      );

    assert.equal(
      roleChanged.status,
      200,
      JSON.stringify(roleChanged.body)
    );

    const oldSession =
      await request(
        "/api/v1/auth/me",
        {
          token: oldAccessToken
        }
      );

    assert.equal(
      oldSession.status,
      401
    );

    assert.equal(
      oldSession.body.error.code,
      "SESSION_INVALIDATED"
    );
  }
);



test("disabled account cannot use an access token", async () => {
  const targetEmail = `disabled-target.${runId}@example.com`;
  await request("/api/v1/auth/register", {
    method: "POST",
    body: {
      firstName: "Disabled",
      lastName: "Target",
      dateOfBirth: "1990-01-01",
      sex: "MALE",
      email: targetEmail,
      password: patientPassword,
      confirmPassword: patientPassword
    }
  });
  const targetSession = await login(targetEmail, patientPassword);
  const [rows] = await databasePool.query<any[]>("SELECT id FROM users WHERE email = ?", [targetEmail]);

  const disabled = await request(`/api/v1/admin/users/${rows[0].id}/status`, {
    method: "PATCH",
    token: adminToken,
    body: { status: "DISABLED" }
  });
  assert.equal(disabled.status, 200);
  assert.equal(
    (await request("/api/v1/auth/me", { token: targetSession.body.data.accessToken })).status,
    401
  );
});

test("unlock succeeds only for a LOCKED account", async () => {
  const targetEmail = `unlock.${runId}@example.com`;
  await request("/api/v1/auth/register", {
    method: "POST",
    body: {
      firstName: "Unlock",
      lastName: "Target",
      dateOfBirth: "1990-01-01",
      sex: "FEMALE",
      email: targetEmail,
      password: patientPassword,
      confirmPassword: patientPassword
    }
  });
  const [rows] = await databasePool.query<any[]>("SELECT id FROM users WHERE email = ?", [targetEmail]);
  const userId = Number(rows[0].id);
  await databasePool.query(
    "UPDATE users SET status = 'LOCKED', failed_login_count = 5, locked_until = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 15 MINUTE) WHERE id = ?",
    [userId]
  );

  const unlocked = await request(`/api/v1/admin/users/${userId}/unlock`, {
    method: "POST",
    token: adminToken
  });
  assert.equal(unlocked.status, 200);

  const secondUnlock = await request(`/api/v1/admin/users/${userId}/unlock`, {
    method: "POST",
    token: adminToken
  });
  assert.equal(secondUnlock.status, 409);
  assert.equal(secondUnlock.body.error.code, "ACCOUNT_NOT_LOCKED");

  await databasePool.query("UPDATE users SET status = 'DISABLED' WHERE id = ?", [userId]);
  assert.equal(
    (await request(`/api/v1/admin/users/${userId}/unlock`, { method: "POST", token: adminToken })).status,
    409
  );

  await databasePool.query("UPDATE users SET status = 'PENDING' WHERE id = ?", [userId]);
  assert.equal(
    (await request(`/api/v1/admin/users/${userId}/unlock`, { method: "POST", token: adminToken })).status,
    409
  );
});