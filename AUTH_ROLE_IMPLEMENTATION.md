# Authentication and role finalization

## Added endpoints

- `POST /api/v1/auth/change-password` — authenticated user changes password; all sessions are revoked.
- `POST /api/v1/auth/logout-all` — authenticated user revokes every refresh-token session.
- `POST /api/v1/admin/staff` — administrator creates a doctor/pharmacist, practitioner profile, and organization assignment transactionally.
- `PATCH /api/v1/admin/users/:userId/status` — administrator sets `PENDING`, `ACTIVE`, or `DISABLED`.
- `POST /api/v1/admin/users/:userId/unlock` — administrator clears lockout state.

Existing `PATCH /api/v1/admin/users/:userId/role` now protects self-demotion and the final administrator, checks role-profile compatibility, revokes sessions, and audits the change.

## Important behavior

- Protected requests verify the signed access token and then load the current role/status from MySQL. Disabled or non-active users are rejected immediately.
- Refresh rotation locks the old database row with `FOR UPDATE`, preventing concurrent reuse.
- Reuse of a revoked refresh token revokes every session for that user.
- Public registration always creates a patient and patient profile; it never accepts a role.
- Staff creation accepts only `DOCTOR` or `PHARMACIST`.

## Staff request example

```json
{
  "email": "doctor@example.com",
  "password": "TemporaryPass123!",
  "firstName": "John",
  "lastName": "Doe",
  "role": "DOCTOR",
  "practitionerNumber": "PR-0001",
  "licenseNumber": "LIC-0001",
  "specialty": "General Practice",
  "phone": "+38344111222",
  "organizationId": 1,
  "positionTitle": "General Practitioner"
}
```

An active organization must exist before this request is made.

## Status request example

```json
{ "status": "DISABLED" }
```

`LOCKED` is intentionally not admin-assignable; failed-login protection owns that state.

## Change-password request

```json
{
  "currentPassword": "CurrentPassword123!",
  "newPassword": "NewPassword456!",
  "confirmPassword": "NewPassword456!"
}
```

## Validation

Run locally after copying your real `.env` into `backend/`:

```bash
npm install
npm run typecheck
npm run build
npm run dev
```

Then test login, `/me`, refresh, logout, logout-all, password change, staff creation, role changes, status changes, lockout/unlock, final-admin protection, profile prerequisites, and audit rows in Postman.

Clinical resource authorization (assigned-patient checks, patient ownership, and prescription-scoped pharmacist access) belongs in the future clinical/prescription routes and must not be replaced by role checks alone.
