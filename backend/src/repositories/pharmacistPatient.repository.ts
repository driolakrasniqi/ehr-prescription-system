import type { RowDataPacket } from "mysql2/promise";
import { databasePool } from "../config/database.js";

export interface PharmacistPatientListRow extends RowDataPacket {
  id: number;
  patientNumber: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  sex: "FEMALE" | "MALE";
  bloodType: string;
  prescriptionCount: number;
}

interface IdRow extends RowDataPacket {
  id: number;
}

export async function pharmacistIsActive(userId: number): Promise<boolean> {
  const [rows] = await databasePool.query<IdRow[]>(
    `SELECT p.id
       FROM practitioners p
       JOIN practitioner_organizations po ON po.practitioner_id = p.id
       JOIN organizations o ON o.id = po.organization_id
      WHERE p.user_id = ? AND p.is_active = TRUE
        AND po.professional_role = 'PHARMACIST' AND po.status = 'ACTIVE'
        AND (po.ended_on IS NULL OR po.ended_on >= UTC_DATE())
        AND o.organization_type = 'PHARMACY' AND o.status = 'ACTIVE'
      LIMIT 1`,
    [userId]
  );
  return Boolean(rows[0]);
}

export async function listPatients(search: string): Promise<PharmacistPatientListRow[]> {
  const term = `%${search}%`;
  const [rows] = await databasePool.query<PharmacistPatientListRow[]>(
    `SELECT p.id, p.patient_number AS patientNumber,
            p.first_name AS firstName, p.last_name AS lastName,
            DATE_FORMAT(p.date_of_birth, '%Y-%m-%d') AS dateOfBirth,
            p.sex, p.blood_type AS bloodType,
            (SELECT COUNT(*) FROM prescriptions rx
              WHERE rx.patient_id = p.id AND rx.status <> 'ENTERED_IN_ERROR') AS prescriptionCount
       FROM patients p
       JOIN users u ON u.id = p.user_id
       JOIN roles r ON r.id = u.role_id
      WHERE p.status = 'ACTIVE' AND r.code = 'PATIENT'
        AND (? = '' OR p.patient_number LIKE ? OR p.first_name LIKE ?
             OR p.last_name LIKE ? OR CONCAT(p.first_name, ' ', p.last_name) LIKE ?
             OR CAST(p.id AS CHAR) = ?)
      ORDER BY p.last_name, p.first_name
      LIMIT 100`,
    [search, term, term, term, term, search]
  );
  return rows;
}

export async function getPatientRecord(patientId: number) {
  const [patientRows] = await databasePool.query<RowDataPacket[]>(
    `SELECT p.id, p.patient_number AS patientNumber,
            p.first_name AS firstName, p.last_name AS lastName,
            DATE_FORMAT(p.date_of_birth, '%Y-%m-%d') AS dateOfBirth,
            p.sex, p.blood_type AS bloodType
       FROM patients p
       JOIN users u ON u.id = p.user_id
       JOIN roles r ON r.id = u.role_id
      WHERE p.id = ? AND p.status = 'ACTIVE' AND r.code = 'PATIENT'
      LIMIT 1`,
    [patientId]
  );
  const patient = patientRows[0];
  if (!patient) return null;

  return {
    patient,
    prescriptions: await listPrescriptionsForPatient(patientId),
    allergies: await listAllergiesForPatient(patientId),
    diagnoses: await listDiagnosesForPatient(patientId)
  };
}

export async function getOwnPatientRecord(userId: number) {
  const [patientRows] = await databasePool.query<RowDataPacket[]>(
    `SELECT p.id, p.patient_number AS patientNumber,
            p.first_name AS firstName, p.last_name AS lastName,
            DATE_FORMAT(p.date_of_birth, '%Y-%m-%d') AS dateOfBirth,
            p.sex, p.blood_type AS bloodType
       FROM patients p
      WHERE p.user_id = ? AND p.status = 'ACTIVE'
      LIMIT 1`,
    [userId]
  );
  const patient = patientRows[0];
  if (!patient) return null;

  return {
    patient,
    prescriptions: await listPrescriptionsForPatient(patient.id),
    allergies: await listAllergiesForPatient(patient.id),
    diagnoses: await listDiagnosesForPatient(patient.id)
  };
}

async function listPrescriptionsForPatient(patientId: number) {
  const [prescriptions] = await databasePool.query<RowDataPacket[]>(
    `SELECT rx.id, rx.prescription_number AS prescriptionNumber, rx.status,
            rx.issued_at AS issuedAt, rx.valid_until AS validUntil,
            rx.clinical_reason AS clinicalReason,
            rx.notes_to_pharmacist AS notesToPharmacist,
            CONCAT(d.first_name, ' ', d.last_name) AS doctorName,
            o.name AS clinicName
       FROM prescriptions rx
       JOIN practitioners d ON d.id = rx.doctor_id
       JOIN organizations o ON o.id = rx.organization_id
      WHERE rx.patient_id = ? AND rx.status <> 'ENTERED_IN_ERROR'
      ORDER BY COALESCE(rx.issued_at, rx.created_at) DESC
      LIMIT 50`,
    [patientId]
  );
  if (!prescriptions.length) {
    return [];
  }

  const ids = prescriptions.map((prescription) => Number(prescription.id));
  const placeholders = ids.map(() => "?").join(",");
  const [items] = await databasePool.query<RowDataPacket[]>(
    `SELECT id, prescription_id AS prescriptionId, line_number AS lineNumber,
            medication_name_snapshot AS medicationName,
            strength_snapshot AS strength, dosage_form_snapshot AS dosageForm,
            dose_value AS doseValue, dose_unit AS doseUnit, route,
            frequency_text AS frequencyText,
            quantity_prescribed AS quantityPrescribed,
            quantity_unit AS quantityUnit, instructions
       FROM prescription_items
      WHERE prescription_id IN (${placeholders})
      ORDER BY prescription_id, line_number`,
    ids
  );

  return prescriptions.map((prescription) => ({
    ...prescription,
    items: items.filter((item) => Number(item.prescriptionId) === Number(prescription.id))
  }));
}

async function listDiagnosesForPatient(patientId: number) {
  const [diagnoses] = await databasePool.query<RowDataPacket[]>(
    `SELECT c.id, c.condition_name AS conditionName, c.category, c.severity,
            CONCAT(d.first_name, ' ', d.last_name) AS doctorName
       FROM conditions c
       LEFT JOIN practitioners d ON d.id = c.recorded_by_practitioner_id
      WHERE c.patient_id = ?
        AND c.clinical_status IN ('ACTIVE', 'RECURRENCE', 'RELAPSE')
        AND c.verification_status <> 'ENTERED_IN_ERROR'
      ORDER BY c.diagnosed_at DESC
      LIMIT 30`,
    [patientId]
  );
  return diagnoses;
}

async function listAllergiesForPatient(patientId: number) {
  const [allergies] = await databasePool.query<RowDataPacket[]>(
    `SELECT a.id, a.substance, a.category, a.severity,
            a.reaction_description AS reactionDescription,
            a.notes,
            CONCAT(d.first_name, ' ', d.last_name) AS doctorName
       FROM allergies a
       LEFT JOIN practitioners d ON d.id = a.recorded_by_practitioner_id
      WHERE a.patient_id = ? AND a.verification_status <> 'ENTERED_IN_ERROR'
      ORDER BY a.created_at DESC
      LIMIT 30`,
    [patientId]
  );
  return allergies;
}
