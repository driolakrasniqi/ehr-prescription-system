import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";

import { databasePool } from "../config/database.js";
import * as authRepository from "../repositories/auth.repository.js";
import * as adminService from "../services/adminUser.service.js";
import {
  createOrganizationSchema,
  createPatientSchema,
  createStaffSchema,
  type CreateOrganizationInput
} from "../validators/adminUser.validator.js";

const ADMIN_EMAIL = "admin@ehr.local";

const DEMO_DOCTOR_EMAIL = "demo.doctor@example.com";
const DEMO_PHARMACIST_EMAIL = "demo.pharmacist@example.com";
const DEMO_PATIENT_EMAIL = "demo.patient@example.com";

const DEMO_DOCTOR_PASSWORD = process.env.DEMO_DOCTOR_PASSWORD ?? "DemoDoctor123!";

const DEMO_PHARMACIST_PASSWORD = process.env.DEMO_PHARMACIST_PASSWORD ?? "DemoPharmacist123!";

const DEMO_PATIENT_PASSWORD = process.env.DEMO_PATIENT_PASSWORD ?? "DemoPatient123!";

const seedMeta = {
  ipAddress: null,
  userAgent: "demo-seed"
};

interface OrganizationSeedRow extends RowDataPacket {
  id: number;
  organization_type: string;
  status: string;
}

interface DemoPatientRow extends RowDataPacket {
  id: number;
}

interface DemoDoctorRow extends RowDataPacket {
  id: number;
}

interface DemoEncounterRow extends RowDataPacket {
  id: number;
}

interface DemoMedicationRow extends RowDataPacket {
  id: number;
}

async function ensureDemoMedication(): Promise<number> {
  const medicationCode = "DEMO-PARA-500";
  const [rows] = await databasePool.query<DemoMedicationRow[]>(
    `SELECT id FROM medications WHERE medication_code = ? LIMIT 1`,
    [medicationCode]
  );
  if (rows[0]) {
    console.log(`Skipped medication (already exists): ${medicationCode}`);
    return rows[0].id;
  }
  const [result] = await databasePool.query<ResultSetHeader>(
    `INSERT INTO medications
      (medication_code, generic_name, brand_name, active_ingredient_text,
       strength, dosage_form, default_route, prescription_only, is_active)
     VALUES (?, 'Paracetamol', NULL, 'Paracetamol', '500 mg', 'Tablet',
             'Oral', TRUE, TRUE)`,
    [medicationCode]
  );
  console.log(`Created medication: ${medicationCode}`);
  return result.insertId;
}

async function ensureOrganization(
  input: CreateOrganizationInput,
  adminUserId: number
): Promise<number> {
  const [rows] = await databasePool.query<OrganizationSeedRow[]>(
    `
        SELECT
          id,
          organization_type,
          status
        FROM organizations
        WHERE organization_code = ?
        LIMIT 1
      `,
    [input.organizationCode]
  );

  const existing = rows[0];

  if (existing) {
    if (existing.organization_type !== input.organizationType || existing.status !== "ACTIVE") {
      throw new Error(
        `Organization '${input.organizationCode}' already exists, but its type or status does not match the demo configuration.`
      );
    }

    console.log(`Skipped organization (already exists): ${input.name}`);

    return existing.id;
  }

  const organizationId = await adminService.createOrganization(input, adminUserId, seedMeta);

  console.log(`Created organization: ${input.name}`);

  return organizationId;
}

async function ensureDoctor(adminUserId: number, clinicId: number): Promise<boolean> {
  const existing = await authRepository.findUserByEmail(DEMO_DOCTOR_EMAIL);

  if (existing) {
    if (existing.role_code !== "DOCTOR") {
      throw new Error(
        `${DEMO_DOCTOR_EMAIL} already exists with role ${existing.role_code}, not DOCTOR.`
      );
    }

    console.log(`Skipped doctor (already exists): ${DEMO_DOCTOR_EMAIL}`);

    return false;
  }

  const input = createStaffSchema.parse({
    email: DEMO_DOCTOR_EMAIL,
    password: DEMO_DOCTOR_PASSWORD,
    firstName: "Elira",
    lastName: "Berisha",
    role: "DOCTOR",
    licenseNumber: "DEMO-DOC-LIC-001",
    specialty: "General Medicine",
    phone: "+38344111001",
    organizationId: clinicId,
    positionTitle: "General Practitioner"
  });

  await adminService.createStaff(input, adminUserId, seedMeta);

  console.log(`Created doctor: ${DEMO_DOCTOR_EMAIL}`);

  return true;
}

async function ensurePharmacist(adminUserId: number, pharmacyId: number): Promise<boolean> {
  const existing = await authRepository.findUserByEmail(DEMO_PHARMACIST_EMAIL);

  if (existing) {
    if (existing.role_code !== "PHARMACIST") {
      throw new Error(
        `${DEMO_PHARMACIST_EMAIL} already exists with role ${existing.role_code}, not PHARMACIST.`
      );
    }

    console.log(`Skipped pharmacist (already exists): ${DEMO_PHARMACIST_EMAIL}`);

    return false;
  }

  const input = createStaffSchema.parse({
    email: DEMO_PHARMACIST_EMAIL,
    password: DEMO_PHARMACIST_PASSWORD,
    firstName: "Arben",
    lastName: "Krasniqi",
    role: "PHARMACIST",
    licenseNumber: "DEMO-PHARM-LIC-001",
    specialty: "Community Pharmacy",
    phone: "+38344111002",
    organizationId: pharmacyId,
    positionTitle: "Pharmacist"
  });

  await adminService.createStaff(input, adminUserId, seedMeta);

  console.log(`Created pharmacist: ${DEMO_PHARMACIST_EMAIL}`);

  return true;
}

async function ensurePatient(adminUserId: number): Promise<boolean> {
  const existing = await authRepository.findUserByEmail(DEMO_PATIENT_EMAIL);

  if (existing) {
    if (existing.role_code !== "PATIENT") {
      throw new Error(
        `${DEMO_PATIENT_EMAIL} already exists with role ${existing.role_code}, not PATIENT.`
      );
    }

    console.log(`Skipped patient (already exists): ${DEMO_PATIENT_EMAIL}`);

    return false;
  }

  const input = createPatientSchema.parse({
    email: DEMO_PATIENT_EMAIL,
    password: DEMO_PATIENT_PASSWORD,
    firstName: "Mira",
    lastName: "Gashi",
    dateOfBirth: "1992-05-14",
    sex: "FEMALE",
    bloodType: "A+",
    maritalStatus: "SINGLE",
    smokingStatus: "NEVER",
    occupation: "Teacher",
    phone: "+38344111003",
    addressLine1: "Demo Street 10",
    addressLine2: "",
    city: "Prishtina",
    postalCode: "10000",
    countryCode: "XK"
  });

  await adminService.createPatient(input, adminUserId, seedMeta);

  console.log(`Created patient: ${DEMO_PATIENT_EMAIL}`);

  return true;
}

async function ensureDemoEncounter(clinicId: number): Promise<number> {
  const encounterNumber = "DEMO-ENC-001";

  const [existingRows] = await databasePool.query<DemoEncounterRow[]>(
    `SELECT id
         FROM encounters
        WHERE encounter_number = ?
        LIMIT 1`,
    [encounterNumber]
  );

  const existingEncounter = existingRows[0];

  if (existingEncounter) {
    console.log(`Skipped encounter (already exists): ${encounterNumber}`);

    return existingEncounter.id;
  }

  const [patientRows] = await databasePool.query<DemoPatientRow[]>(
    `SELECT p.id
         FROM patients p
         JOIN users u
           ON u.id = p.user_id
        WHERE u.email = ?
          AND p.status = 'ACTIVE'
        LIMIT 1`,
    [DEMO_PATIENT_EMAIL]
  );

  const patient = patientRows[0];

  if (!patient) {
    throw new Error(`The demo patient profile for '${DEMO_PATIENT_EMAIL}' was not found.`);
  }

  const [doctorRows] = await databasePool.query<DemoDoctorRow[]>(
    `SELECT p.id
         FROM practitioners p
         JOIN users u
           ON u.id = p.user_id
        WHERE u.email = ?
          AND p.is_active = TRUE
        LIMIT 1`,
    [DEMO_DOCTOR_EMAIL]
  );

  const doctor = doctorRows[0];

  if (!doctor) {
    throw new Error(`The demo doctor profile for '${DEMO_DOCTOR_EMAIL}' was not found.`);
  }

  const [result] = await databasePool.query<ResultSetHeader>(
    `INSERT INTO encounters (
         encounter_number,
         patient_id,
         doctor_id,
         organization_id,
         appointment_id,
         encounter_type,
         started_at,
         ended_at,
         chief_complaint,
         symptoms,
         examination_findings,
         assessment_summary,
         plan_summary,
         status
       )
       VALUES (
         ?,
         ?,
         ?,
         ?,
         NULL,
         'CONSULTATION',
         DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 7 DAY),
         DATE_ADD(
           DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 7 DAY),
           INTERVAL 30 MINUTE
         ),
         'Routine health consultation',
         'Patient attended a scheduled routine consultation.',
         'General examination completed.',
         'No urgent clinical concerns identified.',
         'Continue routine follow-up as needed.',
         'COMPLETED'
       )`,
    [encounterNumber, patient.id, doctor.id, clinicId]
  );

  console.log(`Created encounter: ${encounterNumber}`);

  return result.insertId;
}

function printCredential(role: string, email: string, password: string, created: boolean): void {
  const passwordText = created ? password : "(existing account — password unchanged)";

  console.log(`${role.padEnd(12)} ${email.padEnd(32)} ${passwordText}`);
}

async function seedDemo(): Promise<void> {
  const admin = await authRepository.findUserByEmail(ADMIN_EMAIL);

  if (!admin || admin.role_code !== "ADMIN" || admin.status !== "ACTIVE") {
    throw new Error(
      `An active administrator '${ADMIN_EMAIL}' is required. Run 'npm run seed' first.`
    );
  }

  const clinic = createOrganizationSchema.parse({
    organizationCode: "DEMO-CLINIC",
    organizationType: "CLINIC",
    name: "Cliniq Demo Clinic",
    licenseNumber: "DEMO-CLINIC-LIC-001",
    phone: "+38338111001",
    email: "clinic.demo@example.com",
    addressLine1: "Health Street 1",
    addressLine2: "",
    city: "Prishtina",
    postalCode: "10000",
    countryCode: "XK",
    status: "ACTIVE"
  });

  const pharmacy = createOrganizationSchema.parse({
    organizationCode: "DEMO-PHARMACY",
    organizationType: "PHARMACY",
    name: "Cliniq Demo Pharmacy",
    licenseNumber: "DEMO-PHARM-LIC-001",
    phone: "+38338111002",
    email: "pharmacy.demo@example.com",
    addressLine1: "Health Street 2",
    addressLine2: "",
    city: "Prishtina",
    postalCode: "10000",
    countryCode: "XK",
    status: "ACTIVE"
  });

  const clinicId = await ensureOrganization(clinic, admin.id);

  const pharmacyId = await ensureOrganization(pharmacy, admin.id);

  const doctorCreated = await ensureDoctor(admin.id, clinicId);

  const pharmacistCreated = await ensurePharmacist(admin.id, pharmacyId);

  const patientCreated = await ensurePatient(admin.id);

  await ensureDemoEncounter(clinicId);
  await ensureDemoMedication();

  console.log("\n=== Demo credentials ===");

  printCredential("DOCTOR", DEMO_DOCTOR_EMAIL, DEMO_DOCTOR_PASSWORD, doctorCreated);

  printCredential("PHARMACIST", DEMO_PHARMACIST_EMAIL, DEMO_PHARMACIST_PASSWORD, pharmacistCreated);

  printCredential("PATIENT", DEMO_PATIENT_EMAIL, DEMO_PATIENT_PASSWORD, patientCreated);

  console.log(
    "\nAdministrator credentials use the password selected when 'npm run seed' was executed."
  );
}

seedDemo()
  .then(async () => {
    await databasePool.end();
  })
  .catch(async (error: unknown) => {
    console.error("Demo seeding failed:", error);

    await databasePool.end();
    process.exit(1);
  });
