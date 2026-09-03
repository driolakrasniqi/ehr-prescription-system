import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { databasePool } from "../config/database.js";
import { AppError } from "../utils/errors.js";
import type {
  CreateAllergyInput,
  CreateConditionInput,
  CreateEncounterInput,
  CreatePrescriptionInput
} from "../validators/doctor.validator.js";

export interface DoctorContextRow extends RowDataPacket {
  practitionerId: number;
  firstName: string;
  lastName: string;
  organizationId: number;
  organizationName: string;
}

export interface PatientListRow extends RowDataPacket {
  id: number;
  patientNumber: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  sex: "FEMALE" | "MALE";
  bloodType: string;
  phone: string | null;
  email: string | null;
}

interface IdRow extends RowDataPacket {
  id: number;
}

export async function getDoctorContexts(userId: number): Promise<DoctorContextRow[]> {
  const [rows] = await databasePool.query<DoctorContextRow[]>(
    `SELECT p.id AS practitionerId, p.first_name AS firstName,
            p.last_name AS lastName, o.id AS organizationId,
            o.name AS organizationName
       FROM practitioners p
       JOIN practitioner_organizations po ON po.practitioner_id = p.id
       JOIN organizations o ON o.id = po.organization_id
      WHERE p.user_id = ? AND p.is_active = TRUE
        AND po.professional_role = 'DOCTOR' AND po.status = 'ACTIVE'
        AND (po.ended_on IS NULL OR po.ended_on >= UTC_DATE())
        AND o.organization_type = 'CLINIC' AND o.status = 'ACTIVE'
      ORDER BY po.is_primary DESC, o.name`,
    [userId]
  );
  return rows;
}

export async function listPatients(search: string): Promise<PatientListRow[]> {
  const term = `%${search}%`;
  const [rows] = await databasePool.query<PatientListRow[]>(
    `SELECT p.id, p.patient_number AS patientNumber,
            p.first_name AS firstName, p.last_name AS lastName,
            DATE_FORMAT(p.date_of_birth, '%Y-%m-%d') AS dateOfBirth,
            p.sex, p.blood_type AS bloodType, p.phone,
            COALESCE(u.email, p.email) AS email
       FROM patients p
       JOIN users u ON u.id = p.user_id
       JOIN roles r ON r.id = u.role_id
      WHERE p.status = 'ACTIVE'
        AND r.code = 'PATIENT'
        AND (? = '' OR p.patient_number LIKE ? OR p.first_name LIKE ?
             OR p.last_name LIKE ? OR CONCAT(p.first_name, ' ', p.last_name) LIKE ?)
      ORDER BY p.last_name, p.first_name
      LIMIT 100`,
    [search, term, term, term, term]
  );
  return rows;
}

export async function patientExists(patientId: number): Promise<boolean> {
  const [rows] = await databasePool.query<IdRow[]>(
    `SELECT p.id
       FROM patients p
       JOIN users u ON u.id = p.user_id
       JOIN roles r ON r.id = u.role_id
      WHERE p.id = ? AND p.status = 'ACTIVE' AND r.code = 'PATIENT'
      LIMIT 1`,
    [patientId]
  );
  return Boolean(rows[0]);
}

export async function encounterBelongsToPatientAndDoctor(
  encounterId: number,
  patientId: number,
  doctorId: number
): Promise<boolean> {
  const [rows] = await databasePool.query<IdRow[]>(
    `SELECT id FROM encounters
      WHERE id = ? AND patient_id = ? AND doctor_id = ?
        AND status <> 'ENTERED_IN_ERROR' LIMIT 1`,
    [encounterId, patientId, doctorId]
  );
  return Boolean(rows[0]);
}

export async function getPatientDetails(patientId: number) {
  const [patientRows] = await databasePool.query<PatientListRow[]>(
    `SELECT p.id, p.patient_number AS patientNumber,
            p.first_name AS firstName, p.last_name AS lastName,
            DATE_FORMAT(p.date_of_birth, '%Y-%m-%d') AS dateOfBirth,
            p.sex, p.blood_type AS bloodType, p.phone,
            COALESCE(u.email, p.email) AS email
       FROM patients p
       JOIN users u ON u.id = p.user_id
       JOIN roles r ON r.id = u.role_id
      WHERE p.id = ? AND p.status = 'ACTIVE' AND r.code = 'PATIENT'
      LIMIT 1`,
    [patientId]
  );
  if (!patientRows[0]) return null;

  const [encounters] = await databasePool.query<RowDataPacket[]>(
    `SELECT e.id, e.doctor_id AS doctorId,
            e.encounter_number AS encounterNumber,
            e.encounter_type AS encounterType, e.started_at AS startedAt,
            e.chief_complaint AS chiefComplaint,
            e.assessment_summary AS assessmentSummary,
            e.plan_summary AS planSummary, e.status,
            CONCAT(d.first_name, ' ', d.last_name) AS doctorName,
            o.name AS organizationName
       FROM encounters e JOIN practitioners d ON d.id = e.doctor_id
       JOIN organizations o ON o.id = e.organization_id
      WHERE e.patient_id = ? AND e.status <> 'ENTERED_IN_ERROR'
      ORDER BY e.started_at DESC LIMIT 20`,
    [patientId]
  );
  const [conditions] = await databasePool.query<RowDataPacket[]>(
    `SELECT id, condition_name AS conditionName, category, clinical_status AS clinicalStatus,
            severity, DATE_FORMAT(onset_date, '%Y-%m-%d') AS onsetDate, notes
       FROM conditions WHERE patient_id = ? AND verification_status <> 'ENTERED_IN_ERROR'
      ORDER BY diagnosed_at DESC LIMIT 30`,
    [patientId]
  );
  const [allergies] = await databasePool.query<RowDataPacket[]>(
    `SELECT id, substance, category, severity,
            reaction_description AS reactionDescription,
            clinical_status AS clinicalStatus, notes
       FROM allergies WHERE patient_id = ? AND verification_status <> 'ENTERED_IN_ERROR'
      ORDER BY created_at DESC LIMIT 30`,
    [patientId]
  );
  const [prescriptions] = await databasePool.query<RowDataPacket[]>(
    `SELECT id, prescription_number AS prescriptionNumber, status,
            issued_at AS issuedAt, valid_until AS validUntil, clinical_reason AS clinicalReason
       FROM prescriptions WHERE patient_id = ? AND status <> 'ENTERED_IN_ERROR'
      ORDER BY COALESCE(issued_at, created_at) DESC LIMIT 20`,
    [patientId]
  );

  return { patient: patientRows[0], encounters, conditions, allergies, prescriptions };
}

export async function listActiveMedications() {
  const [rows] = await databasePool.query<RowDataPacket[]>(
    `SELECT id, medication_code AS medicationCode, generic_name AS genericName,
            brand_name AS brandName, strength, dosage_form AS dosageForm,
            default_route AS defaultRoute
       FROM medications WHERE is_active = TRUE
      ORDER BY generic_name, strength LIMIT 500`
  );
  return rows;
}

function nullable(value: string | undefined): string | null {
  return value?.trim() || null;
}

export async function createEncounter(
  input: CreateEncounterInput,
  doctorId: number,
  encounterNumber: string
): Promise<number> {
  const [result] = await databasePool.query<ResultSetHeader>(
    `INSERT INTO encounters
      (encounter_number, patient_id, doctor_id, organization_id,
       encounter_type, started_at, ended_at, chief_complaint, symptoms,
       examination_findings, assessment_summary, plan_summary, status)
     VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), ?, ?, ?, ?, ?, 'COMPLETED')`,
    [
      encounterNumber,
      input.patientId,
      doctorId,
      input.organizationId,
      input.encounterType,
      input.chiefComplaint,
      nullable(input.symptoms),
      nullable(input.examinationFindings),
      nullable(input.assessmentSummary),
      nullable(input.planSummary)
    ]
  );
  return result.insertId;
}

export async function createCondition(
  input: CreateConditionInput,
  doctorId: number
): Promise<number> {
  const [result] = await databasePool.query<ResultSetHeader>(
    `INSERT INTO conditions
      (patient_id, encounter_id, recorded_by_practitioner_id, condition_name,
       category, clinical_status, verification_status, severity, onset_date, notes)
     VALUES (?, ?, ?, ?, ?, 'ACTIVE', 'CONFIRMED', ?, ?, ?)`,
    [
      input.patientId,
      input.encounterId ?? null,
      doctorId,
      input.conditionName,
      input.category,
      input.severity,
      input.onsetDate ?? null,
      nullable(input.notes)
    ]
  );
  return result.insertId;
}

export async function createAllergy(input: CreateAllergyInput, doctorId: number): Promise<number> {
  const [result] = await databasePool.query<ResultSetHeader>(
    `INSERT INTO allergies
      (patient_id, encounter_id, recorded_by_practitioner_id, substance,
       allergy_type, category, criticality, severity, reaction_description,
       clinical_status, verification_status, notes)
     VALUES (?, ?, ?, ?, 'ALLERGY', ?, 'UNABLE_TO_ASSESS', ?, ?, 'ACTIVE', 'CONFIRMED', ?)`,
    [
      input.patientId,
      input.encounterId ?? null,
      doctorId,
      input.substance,
      input.category,
      input.severity,
      nullable(input.reactionDescription),
      nullable(input.notes)
    ]
  );
  return result.insertId;
}

interface MedicationRow extends RowDataPacket {
  id: number;
  genericName: string;
  brandName: string | null;
  strength: string;
  dosageForm: string;
}

export async function createPrescription(
  input: CreatePrescriptionInput,
  doctorId: number,
  prescriptionNumber: string
): Promise<number> {
  const connection = await databasePool.getConnection();
  try {
    await connection.beginTransaction();
    const medicationIds = [...new Set(input.items.map((item) => item.medicationId))];
    const placeholders = medicationIds.map(() => "?").join(",");
    const [medications] = await connection.query<MedicationRow[]>(
      `SELECT id, generic_name AS genericName, brand_name AS brandName,
              strength, dosage_form AS dosageForm
         FROM medications WHERE is_active = TRUE AND id IN (${placeholders})`,
      medicationIds
    );
    if (medications.length !== medicationIds.length) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        "One or more selected medications are unavailable."
      );
    }

    const [prescriptionResult] = await connection.query<ResultSetHeader>(
      `INSERT INTO prescriptions
        (prescription_number, patient_id, doctor_id, encounter_id, organization_id,
         status, clinical_reason, notes_to_pharmacist, valid_until,
         signature_method, signed_at, issued_at)
       VALUES (?, ?, ?, ?, ?, 'ISSUED', ?, ?,
               COALESCE(?, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 30 DAY)),
               'ACCOUNT_CONFIRMATION', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
      [
        prescriptionNumber,
        input.patientId,
        doctorId,
        input.encounterId ?? null,
        input.organizationId,
        nullable(input.clinicalReason),
        nullable(input.notesToPharmacist),
        input.validUntil ? new Date(input.validUntil) : null
      ]
    );

    for (const [index, item] of input.items.entries()) {
      const medication = medications.find((entry) => entry.id === item.medicationId)!;
      const displayName = medication.brandName
        ? `${medication.genericName} (${medication.brandName})`
        : medication.genericName;
      await connection.query(
        `INSERT INTO prescription_items
          (prescription_id, line_number, medication_id, medication_name_snapshot,
           strength_snapshot, dosage_form_snapshot, frequency_text,
           quantity_prescribed, quantity_unit, instructions)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          prescriptionResult.insertId,
          index + 1,
          item.medicationId,
          displayName,
          medication.strength,
          medication.dosageForm,
          item.frequencyText,
          item.quantityPrescribed,
          item.quantityUnit,
          nullable(item.instructions)
        ]
      );
    }

    await connection.commit();
    return prescriptionResult.insertId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
