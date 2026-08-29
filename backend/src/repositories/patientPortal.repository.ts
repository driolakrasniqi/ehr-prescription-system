import type { RowDataPacket } from "mysql2/promise";
import { databasePool } from "../config/database.js";

interface PatientRow extends RowDataPacket {
  id: number;
  patientNumber: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  sex: "FEMALE" | "MALE";
  bloodType: string;
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
}

interface PrescriptionItemRow extends RowDataPacket {
  prescriptionId: number;
  id: number;
  medicationName: string;
  strength: string;
  dosageForm: string;
  frequencyText: string;
  instructions: string | null;
}

interface EncounterRow extends RowDataPacket {
  id: number;
  encounterNumber: string;
  startedAt: Date;
  encounterType: string;
  chiefComplaint: string | null;
  status: string;
  doctorName: string;
  organizationName: string;
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
         WHERE patient_id = ? AND clinical_status = 'ACTIVE') AS activeAllergies,
       (SELECT COUNT(*) FROM conditions
         WHERE patient_id = ? AND clinical_status IN ('ACTIVE','RECURRENCE','RELAPSE')) AS activeConditions`,
    [patient.id, patient.id, patient.id, patient.id]
  );

  const [prescriptions] = await databasePool.query<PrescriptionRow[]>(
    `SELECT rx.id, rx.prescription_number AS prescriptionNumber, rx.status,
            rx.issued_at AS issuedAt, rx.valid_until AS validUntil,
            CONCAT(d.first_name, ' ', d.last_name) AS doctorName,
            o.name AS organizationName
       FROM prescriptions rx
       JOIN practitioners d ON d.id = rx.doctor_id
       JOIN organizations o ON o.id = rx.organization_id
      WHERE rx.patient_id = ? AND rx.status <> 'DRAFT'
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
              frequency_text AS frequencyText, instructions
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
    upcomingAppointments: appointments
  };
}
