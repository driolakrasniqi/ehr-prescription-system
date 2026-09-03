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
let clinicOrganizationId: number;
let pharmacyOrganizationId: number;

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

async function createStaff(role: "DOCTOR" | "PHARMACIST", marker: string) {
  const markerCode = Array.from(marker)
    .reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) >>> 0, 0)
    .toString(36)
    .toUpperCase();

  const uniqueCode = `${markerCode}-${runId.slice(-12)}`;

  return request("/api/v1/admin/staff", {
    method: "POST",
    token: adminToken,
    body: {
      email: `${marker}.${runId}@example.com`,

      password: "StaffPassword123!",

      firstName: role === "DOCTOR" ? "Doctor" : "Pharmacist",

      lastName: "Integration",

      role,

      licenseNumber: `LIC-${uniqueCode}`,

      specialty: role === "DOCTOR" ? "General Medicine" : "Community Pharmacy",

      phone: "+38344111222",

      organizationId: role === "DOCTOR" ? clinicOrganizationId : pharmacyOrganizationId,

      positionTitle: role
    }
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

  const passwordHash = await bcrypt.hash(adminPassword, 12);
  const [adminResult] = await databasePool.query<any>(
    `INSERT INTO users (role_id, email, password_hash, display_name, status, password_changed_at)
     SELECT id, ?, ?, 'Integration Administrator', 'ACTIVE', UTC_TIMESTAMP(3)
     FROM roles WHERE code = 'ADMIN'`,
    [adminEmail, passwordHash]
  );
  adminId = Number(adminResult.insertId);

  const [clinicResult] = await databasePool.query<any>(
    `INSERT INTO organizations
       (
         organization_code,
         organization_type,
         name,
         license_number,
         status
       )
     VALUES (
       ?,
       'CLINIC',
       'Integration Clinic',
       ?,
       'ACTIVE'
     )`,
    [`CLINIC-${runId}`, `CLINIC-LIC-${runId}`]
  );

  clinicOrganizationId = Number(clinicResult.insertId);

  const [pharmacyResult] = await databasePool.query<any>(
    `INSERT INTO organizations
       (
         organization_code,
         organization_type,
         name,
         license_number,
         status
       )
     VALUES (
       ?,
       'PHARMACY',
       'Integration Pharmacy',
       ?,
       'ACTIVE'
     )`,
    [`PHARMACY-${runId}`, `PHARMACY-LIC-${runId}`]
  );

  pharmacyOrganizationId = Number(pharmacyResult.insertId);

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
    await databasePool.query(
      `DELETE FROM practitioner_organizations WHERE practitioner_id IN
       (SELECT id FROM practitioners WHERE user_id IN (${placeholders}))`,
      ids
    );
    await databasePool.query(`DELETE FROM practitioners WHERE user_id IN (${placeholders})`, ids);
    await databasePool.query(`DELETE FROM patients WHERE user_id IN (${placeholders})`, ids);
    await databasePool.query(
      `DELETE FROM audit_events WHERE actor_user_id IN (${placeholders})`,
      ids
    );
    await databasePool.query(`DELETE FROM users WHERE id IN (${placeholders})`, ids);
  }

  await databasePool.query(
    `
    DELETE FROM organizations
    WHERE id IN (?, ?)
  `,
    [clinicOrganizationId, pharmacyOrganizationId]
  );
  await databasePool.end();
  if (server?.listening) {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
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

  const doctorRow = rows.find((row) => row.role_code === "DOCTOR");
  const pharmacistRow = rows.find((row) => row.role_code === "PHARMACIST");

  assert.ok(doctorRow);
  assert.ok(pharmacistRow);
  assert.equal(Number(doctorRow.organization_id), clinicOrganizationId);
  assert.equal(doctorRow.professional_role, "DOCTOR");
  assert.equal(Number(pharmacistRow.organization_id), pharmacyOrganizationId);
  assert.equal(pharmacistRow.professional_role, "PHARMACIST");
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

  const doctorSession = await login(`doctor-forbidden.${runId}@example.com`, "StaffPassword123!");

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

  const doctorPatientProfile = await request("/api/v1/patient/profile", {
    token: doctorSession.body.data.accessToken
  });
  const pharmacistPatientProfile = await request("/api/v1/patient/profile", {
    token: pharmacistSession.body.data.accessToken
  });
  assert.equal(doctorPatientProfile.status, 403);
  assert.equal(pharmacistPatientProfile.status, 403);

  const doctorWorkspace = await request("/api/v1/doctor/workspace", {
    token: doctorSession.body.data.accessToken
  });
  const doctorPatients = await request("/api/v1/doctor/patients", {
    token: doctorSession.body.data.accessToken
  });
  const patientSession = await login(patientEmail, patientPassword);
  const patientDoctorAccess = await request("/api/v1/doctor/patients", {
    token: patientSession.body.data.accessToken
  });

  assert.equal(doctorWorkspace.status, 200, JSON.stringify(doctorWorkspace.body));
  assert.equal(doctorPatients.status, 200, JSON.stringify(doctorPatients.body));
  assert.equal(patientDoctorAccess.status, 403);
  assert.equal(patientDoctorAccess.body.error.code, "FORBIDDEN");
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
        licenseNumber: `${role}-LIC-${runId}`,
        organizationId: clinicOrganizationId
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

test("patient account cannot be converted into a professional account", async () => {
  const [rows] = await databasePool.query<any[]>("SELECT id FROM users WHERE email = ?", [
    patientEmail
  ]);
  const result = await request(`/api/v1/admin/users/${rows[0].id}/role`, {
    method: "PATCH",
    token: adminToken,
    body: { role: "DOCTOR" }
  });
  assert.equal(result.status, 409);
  assert.equal(result.body.error.code, "ROLE_TRANSITION_REQUIRES_PROFILE_WORKFLOW");
});

test("professional account cannot be converted directly into an administrator", async () => {
  const created = await createStaff("DOCTOR", "role-refresh");

  assert.equal(created.status, 201, JSON.stringify(created.body));

  const targetEmail = `role-refresh.${runId}@example.com`;

  const session = await login(targetEmail, "StaffPassword123!");

  assert.equal(session.status, 200, JSON.stringify(session.body));

  assert.ok(session.cookie, "Login must return a refresh-token cookie.");

  const roleChanged = await request(`/api/v1/admin/users/${created.body.data.userId}/role`, {
    method: "PATCH",
    token: adminToken,
    body: {
      role: "ADMIN"
    }
  });

  assert.equal(roleChanged.status, 409, JSON.stringify(roleChanged.body));
  assert.equal(roleChanged.body.error.code, "ROLE_TRANSITION_REQUIRES_PROFILE_WORKFLOW");

  const refreshResult = await request("/api/v1/auth/refresh", {
    method: "POST",
    cookie: session.cookie
  });

  assert.equal(refreshResult.status, 200, JSON.stringify(refreshResult.body));
});

test("patient account cannot be promoted directly to administrator", async () => {
  const targetEmail = `role-access.${runId}@example.com`;

  const registration = await request("/api/v1/auth/register", {
    method: "POST",
    body: {
      firstName: "Role",
      lastName: "Access",
      dateOfBirth: "1990-01-01",
      sex: "FEMALE",
      email: targetEmail,
      password: "RoleAccessPassword123!",
      confirmPassword: "RoleAccessPassword123!"
    }
  });

  assert.equal(registration.status, 201, JSON.stringify(registration.body));

  const session = await login(targetEmail, "RoleAccessPassword123!");

  assert.equal(session.status, 200, JSON.stringify(session.body));

  const oldAccessToken = session.body.data.accessToken as string;

  const roleChanged = await request(`/api/v1/admin/users/${registration.body.data.user.id}/role`, {
    method: "PATCH",
    token: adminToken,
    body: {
      role: "ADMIN"
    }
  });

  assert.equal(roleChanged.status, 409, JSON.stringify(roleChanged.body));
  assert.equal(roleChanged.body.error.code, "ROLE_TRANSITION_REQUIRES_PROFILE_WORKFLOW");

  const oldSession = await request("/api/v1/auth/me", {
    token: oldAccessToken
  });

  assert.equal(oldSession.status, 200, JSON.stringify(oldSession.body));
});

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
  const [rows] = await databasePool.query<any[]>("SELECT id FROM users WHERE email = ?", [
    targetEmail
  ]);

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
  const [rows] = await databasePool.query<any[]>("SELECT id FROM users WHERE email = ?", [
    targetEmail
  ]);
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
    (await request(`/api/v1/admin/users/${userId}/unlock`, { method: "POST", token: adminToken }))
      .status,
    409
  );

  await databasePool.query("UPDATE users SET status = 'PENDING' WHERE id = ?", [userId]);
  assert.equal(
    (await request(`/api/v1/admin/users/${userId}/unlock`, { method: "POST", token: adminToken }))
      .status,
    409
  );
});

test("administrator creates a complete patient account", async () => {
  const email = `admin-created-patient.${runId}@example.com`;
  const result = await request("/api/v1/admin/patients", {
    method: "POST",
    token: adminToken,
    body: {
      email,
      password: "PatientCreated123!",
      firstName: "Admin",
      lastName: "Created",
      dateOfBirth: "1991-04-12",
      sex: "FEMALE",
      bloodType: "A+",
      maritalStatus: "SINGLE",
      smokingStatus: "NEVER",
      phone: "+38344123456",
      city: "Prishtina",
      countryCode: "XK"
    }
  });

  assert.equal(result.status, 201, JSON.stringify(result.body));

  const [rows] = await databasePool.query<any[]>(
    `SELECT u.email, r.code AS role_code, p.patient_number, p.phone
       FROM users u
       JOIN roles r ON r.id = u.role_id
       JOIN patients p ON p.user_id = u.id
      WHERE u.id = ?`,
    [result.body.data.userId]
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].email, email);
  assert.equal(rows[0].role_code, "PATIENT");
  assert.match(rows[0].patient_number, /^PAT-/);
  assert.equal(rows[0].phone, "+38344123456");
});

test("suspending a clinic preserves its doctor and ordinary edits preserve assignment history", async () => {
  const marker = "suspended-clinic-edit";
  const created = await createStaff("DOCTOR", marker);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const userId = Number(created.body.data.userId);

  const [beforeRows] = await databasePool.query<any[]>(
    `SELECT COUNT(*) AS total
       FROM practitioner_organizations po
       JOIN practitioners p ON p.id = po.practitioner_id
      WHERE p.user_id = ?`,
    [userId]
  );

  const suspended = await request(`/api/v1/admin/organizations/${clinicOrganizationId}/status`, {
    method: "PATCH",
    token: adminToken,
    body: { status: "SUSPENDED" }
  });
  assert.equal(suspended.status, 200, JSON.stringify(suspended.body));

  const updated = await request(`/api/v1/admin/users/${userId}/profile`, {
    method: "PATCH",
    token: adminToken,
    body: {
      profileType: "PRACTITIONER",
      role: "DOCTOR",
      email: `${marker}.${runId}@example.com`,
      firstName: "Doctor",
      lastName: "Integration",
      licenseNumber: `UPDATED-${runId.slice(-12)}`,
      specialty: "General Medicine",
      phone: "+38344999888",
      organizationId: clinicOrganizationId,
      positionTitle: "Doctor"
    }
  });
  assert.equal(updated.status, 200, JSON.stringify(updated.body));

  const [afterRows] = await databasePool.query<any[]>(
    `SELECT u.status AS user_status, p.is_active, COUNT(po.id) AS total
       FROM users u
       JOIN practitioners p ON p.user_id = u.id
       JOIN practitioner_organizations po ON po.practitioner_id = p.id
      WHERE u.id = ?
      GROUP BY u.id, p.id`,
    [userId]
  );
  assert.equal(afterRows[0].user_status, "ACTIVE");
  assert.equal(Number(afterRows[0].is_active), 1);
  assert.equal(Number(afterRows[0].total), Number(beforeRows[0].total));

  const reactivated = await request(`/api/v1/admin/organizations/${clinicOrganizationId}/status`, {
    method: "PATCH",
    token: adminToken,
    body: { status: "ACTIVE" }
  });
  assert.equal(reactivated.status, 200, JSON.stringify(reactivated.body));
});
