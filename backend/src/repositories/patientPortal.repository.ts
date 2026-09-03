import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { databasePool } from "../config/database.js";
import type { UpdateOwnPatientProfileInput } from "../validators/patientPortal.validator.js";

interface PatientRow extends RowDataPacket {
  id: number;
  patientNumber: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  sex: "FEMALE" | "MALE";
  bloodType: string;
}

export interface PatientProfileRow extends RowDataPacket {
  id: number;
  patientNumber: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  sex: "FEMALE" | "MALE";
  bloodType: "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-" | "UNKNOWN";
  maritalStatus: "SINGLE" | "MARRIED" | "DIVORCED" | "WIDOWED" | "OTHER" | "UNKNOWN";
  occupation: string | null;
  smokingStatus: "NEVER" | "FORMER" | "CURRENT" | "UNKNOWN";
  phone: string | null;
  email: string;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  postalCode: string | null;
  countryCode: string;
  status: "ACTIVE" | "INACTIVE" | "DECEASED" | "MERGED";
  createdAt: Date;
  updatedAt: Date;
}

export async function getPatientProfile(userId: number): Promise<PatientProfileRow | null> {
  const [rows] = await databasePool.query<PatientProfileRow[]>(
    `SELECT p.id, p.patient_number AS patientNumber,
            p.first_name AS firstName, p.last_name AS lastName,
            DATE_FORMAT(p.date_of_birth, '%Y-%m-%d') AS dateOfBirth,
            p.sex, p.blood_type AS bloodType, p.marital_status AS maritalStatus,
            p.occupation, p.smoking_status AS smokingStatus, p.phone,
            u.email, p.address_line1 AS addressLine1,
            p.address_line2 AS addressLine2, p.city,
            p.postal_code AS postalCode, p.country_code AS countryCode,
            p.status, p.created_at AS createdAt, p.updated_at AS updatedAt
       FROM patients p
       JOIN users u ON u.id = p.user_id
      WHERE p.user_id = ?
      LIMIT 1`,
    [userId]
  );
  return rows[0] ?? null;
}

function nullable(value: string): string | null {
  return value || null;
}

export async function updateOwnPatientProfile(
  userId: number,
  input: UpdateOwnPatientProfileInput
): Promise<boolean> {
  const [result] = await databasePool.query<ResultSetHeader>(
    `UPDATE patients
        SET phone = ?, occupation = ?, marital_status = ?, smoking_status = ?,
            address_line1 = ?, address_line2 = ?, city = ?, postal_code = ?,
            country_code = ?, updated_by_user_id = ?
      WHERE user_id = ? AND status = 'ACTIVE'`,
    [
      nullable(input.phone),
      nullable(input.occupation),
      input.maritalStatus,
      input.smokingStatus,
      nullable(input.addressLine1),
      nullable(input.addressLine2),
      nullable(input.city),
      nullable(input.postalCode),
      input.countryCode,
      userId,
      userId
    ]
  );
  return result.affectedRows > 0;
}

interface SummaryRow extends RowDataPacket {
  activePrescriptions: number;
  upcomingAppointments: number;
  activeAllergies: number;
  activeConditions: number;
}

interface PrescriptionRow extends RowDataPacket {
  id: number;
  prescriptionNumber: string;
  status: string;
  issuedAt: Date | null;
  validUntil: Date | null;
  doctorName: string;
  organizationName: string;
  clinicalReason: string | null;
}

interface PrescriptionItemRow extends RowDataPacket {
  prescriptionId: number;
  id: number;
  medicationName: string;
  strength: string;
  dosageForm: string;
  frequencyText: string;
  quantityPrescribed: number;
  quantityUnit: string;
  instructions: string | null;
}

interface EncounterRow extends RowDataPacket {
  id: number;
  encounterNumber: string;
  startedAt: Date;
  encounterType: string;
  chiefComplaint: string | null;
  symptoms: string | null;
  examinationFindings: string | null;
  assessmentSummary: string | null;
  planSummary: string | null;
  status: string;
  doctorName: string;
  organizationName: string;
}

interface AllergyRow extends RowDataPacket {
  id: number;
  substance: string;
  category: string;
  severity: string;
  reactionDescription: string | null;
  notes: string | null;
  recordedAt: Date;
  doctorName: string;
}

interface ConditionRow extends RowDataPacket {
  id: number;
  conditionName: string;
  category: string;
  severity: string;
  onsetDate: string | null;
  notes: string | null;
  diagnosedAt: Date;
  doctorName: string;
}

interface AppointmentRow extends RowDataPacket {
  id: number;
  appointmentNumber: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  appointmentType: string;
  status: string;
  reason: string | null;
  practitionerName: string;
  organizationName: string;
}

export async function getPatientDashboard(userId: number) {
  const [patientRows] = await databasePool.query<PatientRow[]>(
    `SELECT id, patient_number AS patientNumber, first_name AS firstName,
            last_name AS lastName, DATE_FORMAT(date_of_birth, '%Y-%m-%d') AS dateOfBirth,
            sex, blood_type AS bloodType
       FROM patients
      WHERE user_id = ? AND status = 'ACTIVE'
      LIMIT 1`,
    [userId]
  );
  const patient = patientRows[0];
  if (!patient) return null;

  const [summaryRows] = await databasePool.query<SummaryRow[]>(
    `SELECT
       (SELECT COUNT(*) FROM prescriptions
         WHERE patient_id = ? AND status IN ('ISSUED','PARTIALLY_DISPENSED')
           AND (valid_until IS NULL OR valid_until >= UTC_TIMESTAMP(3))) AS activePrescriptions,
       (SELECT COUNT(*) FROM appointments
         WHERE patient_id = ? AND scheduled_start >= UTC_TIMESTAMP(3)
           AND status IN ('BOOKED','CONFIRMED')) AS upcomingAppointments,
       (SELECT COUNT(*) FROM allergies
         WHERE patient_id = ? AND clinical_status = 'ACTIVE'
           AND verification_status <> 'ENTERED_IN_ERROR') AS activeAllergies,
       (SELECT COUNT(*) FROM conditions
         WHERE patient_id = ? AND clinical_status IN ('ACTIVE','RECURRENCE','RELAPSE')
           AND verification_status <> 'ENTERED_IN_ERROR') AS activeConditions`,
    [patient.id, patient.id, patient.id, patient.id]
  );

  const [prescriptions] = await databasePool.query<PrescriptionRow[]>(
    `SELECT rx.id, rx.prescription_number AS prescriptionNumber, rx.status,
            rx.issued_at AS issuedAt, rx.valid_until AS validUntil,
            rx.clinical_reason AS clinicalReason,
            CONCAT(d.first_name, ' ', d.last_name) AS doctorName,
            o.name AS organizationName
       FROM prescriptions rx
       JOIN practitioners d ON d.id = rx.doctor_id
       JOIN organizations o ON o.id = rx.organization_id
      WHERE rx.patient_id = ?
        AND rx.status IN ('ISSUED','PARTIALLY_DISPENSED','FULLY_DISPENSED','CANCELLED','EXPIRED')
      ORDER BY COALESCE(rx.issued_at, rx.created_at) DESC
      LIMIT 5`,
    [patient.id]
  );

  let items: PrescriptionItemRow[] = [];
  if (prescriptions.length) {
    const ids = prescriptions.map((prescription) => prescription.id);
    const placeholders = ids.map(() => "?").join(",");
    const [itemRows] = await databasePool.query<PrescriptionItemRow[]>(
      `SELECT prescription_id AS prescriptionId, id,
              medication_name_snapshot AS medicationName,
              strength_snapshot AS strength, dosage_form_snapshot AS dosageForm,
              frequency_text AS frequencyText,
              quantity_prescribed AS quantityPrescribed,
              quantity_unit AS quantityUnit, instructions
         FROM prescription_items
        WHERE prescription_id IN (${placeholders})
        ORDER BY prescription_id, line_number`,
      ids
    );
    items = itemRows;
  }

  const [encounters] = await databasePool.query<EncounterRow[]>(
    `SELECT e.id, e.encounter_number AS encounterNumber, e.started_at AS startedAt,
            e.encounter_type AS encounterType, e.chief_complaint AS chiefComplaint,
            e.symptoms, e.examination_findings AS examinationFindings,
            e.assessment_summary AS assessmentSummary, e.plan_summary AS planSummary,
            e.status, CONCAT(d.first_name, ' ', d.last_name) AS doctorName,
            o.name AS organizationName
       FROM encounters e
       JOIN practitioners d ON d.id = e.doctor_id
       JOIN organizations o ON o.id = e.organization_id
      WHERE e.patient_id = ? AND e.status <> 'ENTERED_IN_ERROR'
      ORDER BY e.started_at DESC
      LIMIT 5`,
    [patient.id]
  );

  const [allergies] = await databasePool.query<AllergyRow[]>(
    `SELECT a.id, a.substance, a.category, a.severity,
            a.reaction_description AS reactionDescription, a.notes,
            a.created_at AS recordedAt,
            CONCAT(p.first_name, ' ', p.last_name) AS doctorName
       FROM allergies a
       JOIN practitioners p ON p.id = a.recorded_by_practitioner_id
      WHERE a.patient_id = ? AND a.clinical_status = 'ACTIVE'
        AND a.verification_status <> 'ENTERED_IN_ERROR'
      ORDER BY a.created_at DESC`,
    [patient.id]
  );

  const [conditions] = await databasePool.query<ConditionRow[]>(
    `SELECT c.id, c.condition_name AS conditionName, c.category, c.severity,
            DATE_FORMAT(c.onset_date, '%Y-%m-%d') AS onsetDate,
            c.notes, c.diagnosed_at AS diagnosedAt,
            CONCAT(p.first_name, ' ', p.last_name) AS doctorName
       FROM conditions c
       JOIN practitioners p ON p.id = c.recorded_by_practitioner_id
      WHERE c.patient_id = ?
        AND c.clinical_status IN ('ACTIVE','RECURRENCE','RELAPSE')
        AND c.verification_status <> 'ENTERED_IN_ERROR'
      ORDER BY c.diagnosed_at DESC`,
    [patient.id]
  );

  const [appointments] = await databasePool.query<AppointmentRow[]>(
    `SELECT a.id, a.appointment_number AS appointmentNumber,
            a.scheduled_start AS scheduledStart, a.scheduled_end AS scheduledEnd,
            a.appointment_type AS appointmentType, a.status, a.reason,
            CONCAT(p.first_name, ' ', p.last_name) AS practitionerName,
            o.name AS organizationName
       FROM appointments a
       JOIN practitioners p ON p.id = a.practitioner_id
       JOIN organizations o ON o.id = a.organization_id
      WHERE a.patient_id = ? AND a.scheduled_start >= UTC_TIMESTAMP(3)
        AND a.status IN ('BOOKED','CONFIRMED')
      ORDER BY a.scheduled_start
      LIMIT 4`,
    [patient.id]
  );

  return {
    patient,
    summary: summaryRows[0] ?? {
      activePrescriptions: 0,
      upcomingAppointments: 0,
      activeAllergies: 0,
      activeConditions: 0
    },
    recentPrescriptions: prescriptions.map((prescription) => ({
      ...prescription,
      items: items.filter((item) => item.prescriptionId === prescription.id)
    })),
    recentEncounters: encounters,
    upcomingAppointments: appointments,
    activeAllergies: allergies,
    activeConditions: conditions
  };
}
