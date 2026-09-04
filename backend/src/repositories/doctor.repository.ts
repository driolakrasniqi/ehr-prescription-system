import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { databasePool } from "../config/database.js";
import { AppError } from "../utils/errors.js";
import type {
  CreateAllergyInput,
  CreateConditionInput,
  CreateEncounterInput,
  CreatePrescriptionInput,
  UpdateAllergyInput,
  UpdateConditionInput,
  UpdateEncounterInput,
  UpdatePrescriptionInput
} from "../validators/doctor.validator.js";

export interface DoctorContextRow extends RowDataPacket {
  practitionerId: number;
  firstName: string;
  lastName: string;
  licenseNumber: string;
  specialty: string | null;
  phone: string | null;
  practitionerNumber: string;
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
            p.last_name AS lastName, p.license_number AS licenseNumber,
            p.specialty, p.phone, p.practitioner_number AS practitionerNumber,
            o.id AS organizationId, o.name AS organizationName
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

export async function listDoctorVisits(practitionerId: number, limit = 200) {
  const safeLimit = Math.max(1, Math.min(500, Math.trunc(limit) || 200));
  const [visits] = await databasePool.query<RowDataPacket[]>(
    `SELECT e.id, e.encounter_number AS encounterNumber,
            DATE_FORMAT(e.started_at, '%Y-%m-%dT%H:%i:%s') AS startedAt,
            e.encounter_type AS encounterType,
            e.chief_complaint AS chiefComplaint, e.status,
            CONCAT(p.first_name, ' ', p.last_name) AS patientName,
            o.name AS organizationName,
            p.id AS patientId
       FROM encounters e
       JOIN patients p ON p.id = e.patient_id
       JOIN organizations o ON o.id = e.organization_id
      WHERE e.doctor_id = ? AND e.status <> 'ENTERED_IN_ERROR'
      ORDER BY e.started_at DESC
      LIMIT ${safeLimit}`,
    [practitionerId]
  );
  return visits;
}

export async function getDoctorOverview(practitionerId: number) {
  const [summaryRows] = await databasePool.query<RowDataPacket[]>(
    `SELECT
       (SELECT COUNT(DISTINCT patient_id) FROM encounters
         WHERE doctor_id = ? AND status <> 'ENTERED_IN_ERROR') AS patientCount,
       (SELECT COUNT(*) FROM encounters
         WHERE doctor_id = ? AND status <> 'ENTERED_IN_ERROR') AS visitCount,
       (SELECT COUNT(*) FROM prescriptions
         WHERE doctor_id = ? AND status <> 'ENTERED_IN_ERROR') AS prescriptionCount`,
    [practitionerId, practitionerId, practitionerId]
  );
  const visits = await listDoctorVisits(practitionerId, 8);
  const summary = summaryRows[0];
  return {
    patientCount: Number(summary?.patientCount ?? 0),
    visitCount: Number(summary?.visitCount ?? 0),
    prescriptionCount: Number(summary?.prescriptionCount ?? 0),
    recentVisits: visits
  };
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
             OR p.last_name LIKE ? OR CONCAT(p.first_name, ' ', p.last_name) LIKE ?
             OR CAST(p.id AS CHAR) = ?)
      ORDER BY p.last_name, p.first_name
      LIMIT 100`,
    [search, term, term, term, term, search]
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
            e.symptoms, e.examination_findings AS examinationFindings,
            e.assessment_summary AS assessmentSummary,
            e.plan_summary AS planSummary, e.status,
            e.organization_id AS organizationId,
            CONCAT(d.first_name, ' ', d.last_name) AS doctorName,
            o.name AS organizationName
       FROM encounters e JOIN practitioners d ON d.id = e.doctor_id
       JOIN organizations o ON o.id = e.organization_id
      WHERE e.patient_id = ? AND e.status <> 'ENTERED_IN_ERROR'
      ORDER BY e.started_at DESC LIMIT 20`,
    [patientId]
  );
  const [conditions] = await databasePool.query<RowDataPacket[]>(
    `SELECT c.id, c.recorded_by_practitioner_id AS doctorId,
            c.condition_name AS conditionName, c.category,
            c.clinical_status AS clinicalStatus, c.severity,
            DATE_FORMAT(c.onset_date, '%Y-%m-%d') AS onsetDate, c.notes,
            c.encounter_id AS encounterId,
            CONCAT(d.first_name, ' ', d.last_name) AS doctorName
       FROM conditions c
       JOIN practitioners d ON d.id = c.recorded_by_practitioner_id
      WHERE c.patient_id = ? AND c.verification_status <> 'ENTERED_IN_ERROR'
      ORDER BY c.diagnosed_at DESC LIMIT 30`,
    [patientId]
  );
  const [allergies] = await databasePool.query<RowDataPacket[]>(
    `SELECT a.id, a.recorded_by_practitioner_id AS doctorId,
            a.substance, a.category, a.severity,
            a.reaction_description AS reactionDescription,
            a.clinical_status AS clinicalStatus, a.notes,
            a.encounter_id AS encounterId,
            CONCAT(d.first_name, ' ', d.last_name) AS doctorName
       FROM allergies a
       JOIN practitioners d ON d.id = a.recorded_by_practitioner_id
      WHERE a.patient_id = ? AND a.verification_status <> 'ENTERED_IN_ERROR'
      ORDER BY a.created_at DESC LIMIT 30`,
    [patientId]
  );
  const [prescriptions] = await databasePool.query<RowDataPacket[]>(
    `SELECT rx.id, rx.doctor_id AS doctorId, rx.organization_id AS organizationId,
            rx.prescription_number AS prescriptionNumber, rx.status,
            rx.issued_at AS issuedAt, rx.valid_until AS validUntil,
            DATE_FORMAT(rx.valid_until, '%Y-%m-%d') AS validUntilDate,
            rx.clinical_reason AS clinicalReason,
            rx.notes_to_pharmacist AS notesToPharmacist,
            rx.encounter_id AS encounterId,
            CONCAT(d.first_name, ' ', d.last_name) AS doctorName,
            o.name AS clinicName
       FROM prescriptions rx
       JOIN practitioners d ON d.id = rx.doctor_id
       JOIN organizations o ON o.id = rx.organization_id
      WHERE rx.patient_id = ? AND rx.status <> 'ENTERED_IN_ERROR'
      ORDER BY COALESCE(rx.issued_at, rx.created_at) DESC LIMIT 20`,
    [patientId]
  );

  let prescriptionItems: RowDataPacket[] = [];
  if (prescriptions.length) {
    const ids = prescriptions.map((prescription) => Number(prescription.id));
    const placeholders = ids.map(() => "?").join(",");
    const [itemRows] = await databasePool.query<RowDataPacket[]>(
      `SELECT id, prescription_id AS prescriptionId, line_number AS lineNumber,
              medication_id AS medicationId,
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
    prescriptionItems = itemRows;
  }

  return {
    patient: patientRows[0],
    encounters,
    conditions,
    allergies,
    prescriptions: prescriptions.map((prescription) => {
      const items = prescriptionItems.filter(
        (item) => Number(item.prescriptionId) === Number(prescription.id)
      );
      const first = items[0];
      return {
        ...prescription,
        medicationId: first?.medicationId ?? null,
        medicationName: first?.medicationName ?? null,
        frequencyText: first?.frequencyText ?? null,
        quantityPrescribed: first?.quantityPrescribed ?? null,
        quantityUnit: first?.quantityUnit ?? null,
        instructions: first?.instructions ?? null,
        items
      };
    })
  };
}

export async function listDoctorTherapies(doctorId: number) {
  const [rows] = await databasePool.query<RowDataPacket[]>(
    `SELECT item.medication_id AS medicationId,
            item.medication_name_snapshot AS medicationName,
            item.strength_snapshot AS strength,
            item.dosage_form_snapshot AS dosageForm,
            item.frequency_text AS frequencyText,
            item.quantity_prescribed AS quantityPrescribed,
            item.quantity_unit AS quantityUnit,
            item.instructions,
            COUNT(*) AS usedCount
       FROM prescription_items item
       JOIN prescriptions rx ON rx.id = item.prescription_id
      WHERE rx.doctor_id = ? AND rx.status <> 'ENTERED_IN_ERROR'
      GROUP BY item.medication_id, item.medication_name_snapshot, item.strength_snapshot,
               item.dosage_form_snapshot, item.frequency_text, item.quantity_prescribed,
               item.quantity_unit, item.instructions
      ORDER BY usedCount DESC, medicationName
      LIMIT 20`,
    [doctorId]
  );
  return rows.map((row) => ({
    medicationId: Number(row.medicationId),
    medicationName: String(row.medicationName),
    strength: row.strength ? String(row.strength) : null,
    dosageForm: row.dosageForm ? String(row.dosageForm) : null,
    frequencyText: String(row.frequencyText),
    quantityPrescribed: Number(row.quantityPrescribed),
    quantityUnit: String(row.quantityUnit),
    instructions: row.instructions ? String(row.instructions) : null,
    usedCount: Number(row.usedCount)
  }));
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

interface OwnedRecordRow extends RowDataPacket {
  id: number;
  patientId: number;
  doctorId: number;
  status?: string;
}

export async function findEncounterOwner(encounterId: number): Promise<OwnedRecordRow | null> {
  const [rows] = await databasePool.query<OwnedRecordRow[]>(
    `SELECT id, patient_id AS patientId, doctor_id AS doctorId FROM encounters WHERE id = ? LIMIT 1`,
    [encounterId]
  );
  return rows[0] ?? null;
}

export async function findConditionOwner(conditionId: number): Promise<OwnedRecordRow | null> {
  const [rows] = await databasePool.query<OwnedRecordRow[]>(
    `SELECT id, patient_id AS patientId, recorded_by_practitioner_id AS doctorId
       FROM conditions WHERE id = ? LIMIT 1`,
    [conditionId]
  );
  return rows[0] ?? null;
}

export async function findAllergyOwner(allergyId: number): Promise<OwnedRecordRow | null> {
  const [rows] = await databasePool.query<OwnedRecordRow[]>(
    `SELECT id, patient_id AS patientId, recorded_by_practitioner_id AS doctorId
       FROM allergies WHERE id = ? LIMIT 1`,
    [allergyId]
  );
  return rows[0] ?? null;
}

export async function findPrescriptionOwner(prescriptionId: number): Promise<OwnedRecordRow | null> {
  const [rows] = await databasePool.query<OwnedRecordRow[]>(
    `SELECT id, patient_id AS patientId, doctor_id AS doctorId, status
       FROM prescriptions WHERE id = ? LIMIT 1`,
    [prescriptionId]
  );
  return rows[0] ?? null;
}

export async function updateEncounter(encounterId: number, input: UpdateEncounterInput): Promise<void> {
  await databasePool.query(
    `UPDATE encounters
        SET organization_id = ?, encounter_type = ?, chief_complaint = ?,
            symptoms = ?, examination_findings = ?, assessment_summary = ?, plan_summary = ?
      WHERE id = ?`,
    [
      input.organizationId,
      input.encounterType,
      input.chiefComplaint,
      nullable(input.symptoms),
      nullable(input.examinationFindings),
      nullable(input.assessmentSummary),
      nullable(input.planSummary),
      encounterId
    ]
  );
}

export async function deleteEncounter(encounterId: number): Promise<void> {
  await databasePool.query(`DELETE FROM encounters WHERE id = ?`, [encounterId]);
}

export async function updateCondition(conditionId: number, input: UpdateConditionInput): Promise<void> {
  await databasePool.query(
    `UPDATE conditions
        SET encounter_id = ?, condition_name = ?, category = ?, severity = ?, onset_date = ?, notes = ?
      WHERE id = ?`,
    [
      input.encounterId ?? null,
      input.conditionName,
      input.category,
      input.severity,
      input.onsetDate ?? null,
      nullable(input.notes),
      conditionId
    ]
  );
}

export async function deleteCondition(conditionId: number): Promise<void> {
  await databasePool.query(`DELETE FROM conditions WHERE id = ?`, [conditionId]);
}

export async function updateAllergy(allergyId: number, input: UpdateAllergyInput): Promise<void> {
  await databasePool.query(
    `UPDATE allergies
        SET encounter_id = ?, substance = ?, category = ?, severity = ?,
            reaction_description = ?, notes = ?
      WHERE id = ?`,
    [
      input.encounterId ?? null,
      input.substance,
      input.category,
      input.severity,
      nullable(input.reactionDescription),
      nullable(input.notes),
      allergyId
    ]
  );
}

export async function deleteAllergy(allergyId: number): Promise<void> {
  await databasePool.query(`DELETE FROM allergies WHERE id = ?`, [allergyId]);
}

export async function updatePrescription(
  prescriptionId: number,
  input: UpdatePrescriptionInput
): Promise<void> {
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
    await connection.query(
      `UPDATE prescriptions
          SET encounter_id = ?, organization_id = ?, clinical_reason = ?,
              notes_to_pharmacist = ?,
              valid_until = COALESCE(?, valid_until)
        WHERE id = ?`,
      [
        input.encounterId ?? null,
        input.organizationId,
        nullable(input.clinicalReason),
        nullable(input.notesToPharmacist),
        input.validUntil ? new Date(input.validUntil) : null,
        prescriptionId
      ]
    );
    await connection.query(`DELETE FROM prescription_items WHERE prescription_id = ?`, [
      prescriptionId
    ]);
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
          prescriptionId,
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
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function deletePrescription(prescriptionId: number): Promise<void> {
  const connection = await databasePool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(`DELETE FROM prescription_items WHERE prescription_id = ?`, [
      prescriptionId
    ]);
    await connection.query(`DELETE FROM prescriptions WHERE id = ?`, [prescriptionId]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

