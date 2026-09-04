import type { RowDataPacket } from "mysql2/promise";
import { databasePool } from "../config/database.js";

export interface PharmacistContextRow extends RowDataPacket {
  practitionerId: number;
  firstName: string;
  lastName: string;
  licenseNumber: string;
  phone: string | null;
  practitionerNumber: string;
  organizationId: number;
  organizationName: string;
}

export async function getPharmacistContexts(userId: number): Promise<PharmacistContextRow[]> {
  const [rows] = await databasePool.query<PharmacistContextRow[]>(
    `SELECT p.id AS practitionerId, p.first_name AS firstName,
            p.last_name AS lastName, p.license_number AS licenseNumber,
            p.phone, p.practitioner_number AS practitionerNumber,
            o.id AS organizationId, o.name AS organizationName
       FROM practitioners p
       JOIN practitioner_organizations po ON po.practitioner_id = p.id
       JOIN organizations o ON o.id = po.organization_id
      WHERE p.user_id = ? AND p.is_active = TRUE
        AND po.professional_role = 'PHARMACIST' AND po.status = 'ACTIVE'
        AND (po.ended_on IS NULL OR po.ended_on >= UTC_DATE())
        AND o.organization_type = 'PHARMACY' AND o.status = 'ACTIVE'
      ORDER BY po.is_primary DESC, o.name`,
    [userId]
  );
  return rows;
}

export async function getPharmacistOverview() {
  const [summaryRows] = await databasePool.query<RowDataPacket[]>(
    `SELECT
       (SELECT COUNT(DISTINCT patient_id) FROM prescriptions
         WHERE status <> 'ENTERED_IN_ERROR') AS patientCount,
       (SELECT COUNT(*) FROM prescriptions
         WHERE status <> 'ENTERED_IN_ERROR') AS prescriptionCount`
  );
  const [recentPrescriptions] = await databasePool.query<RowDataPacket[]>(
    `SELECT rx.id, rx.prescription_number AS prescriptionNumber,
            DATE_FORMAT(COALESCE(rx.issued_at, rx.created_at), '%Y-%m-%dT%H:%i:%s') AS issuedAt,
            rx.patient_id AS patientId,
            CONCAT(p.first_name, ' ', p.last_name) AS patientName,
            item.medication_name_snapshot AS medicationName,
            CONCAT(CAST(item.quantity_prescribed AS UNSIGNED), ' ', item.quantity_unit) AS quantity
       FROM prescriptions rx
       JOIN patients p ON p.id = rx.patient_id
       LEFT JOIN prescription_items item
         ON item.prescription_id = rx.id AND item.line_number = 1
      WHERE rx.status <> 'ENTERED_IN_ERROR'
      ORDER BY COALESCE(rx.issued_at, rx.created_at) DESC
      LIMIT 8`
  );
  const summary = summaryRows[0];
  return {
    patientCount: Number(summary?.patientCount ?? 0),
    prescriptionCount: Number(summary?.prescriptionCount ?? 0),
    recentPrescriptions
  };
}
