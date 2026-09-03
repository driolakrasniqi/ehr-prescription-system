# Doctor Module Installation

Copy the `backend` and `frontend` folders from this package into the root of your project and allow the listed files to be merged or replaced.

No database schema changes are required. The module uses your existing `patients`, `encounters`, `conditions`, `allergies`, `medications`, `prescriptions`, and `prescription_items` tables.

## 1. Verify the backend

```powershell
cd backend
npm install
npm run typecheck
```

## 2. Update demonstration data

The updated demo seed adds a sample medication used by the prescription form.

```powershell
npm run seed:demo
```

Running the seed again safely skips existing demo records.

## 3. Verify the frontend

```powershell
cd ..\frontend
npm install
npm run lint
npm run build
```

## 4. Run the project

From the project root:

```powershell
npm run dev
```

Sign in with the demo doctor account:

```text
Email: demo.doctor@example.com
Password: DemoDoctor123!
```

The doctor is redirected to `/doctor/patients`.

## 5. Run all backend tests

Import `database/schema.test.sql` into `ehr_eprescription_test`, then run:

```powershell
cd backend
$env:DB_NAME = "ehr_eprescription_test"
npm test
```

The doctor workspace is protected by both authentication and the `DOCTOR` role.
