import type { RowDataPacket } from "mysql2/promise";
import { databasePool } from "../config/database.js";
import type { UserRole } from "../types/auth.types.js";

export interface AuditInput {
  actorUserId?: number | null;
  actorRoleCode?: UserRole | null;
  action: string;
  entityType: string;
  entityId?: number | null;
  result: "SUCCESS" | "DENIED" | "FAILED";
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function writeAuditEvent(input: AuditInput): Promise<void> {
  await databasePool.query(
    `INSERT INTO audit_events
      (actor_user_id, actor_role_code, action, entity_type, entity_id, result,
       ip_address, user_agent, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.actorUserId ?? null,
      input.actorRoleCode ?? null,
      input.action,
      input.entityType,
      input.entityId ?? null,
      input.result,
      input.ipAddress ?? null,
      input.userAgent ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null
    ]
  );
}

export const TRACKED_ACCOUNT_ACTIONS = [
  "STAFF_ACCOUNT_CREATED",
  "ADMIN_ACCOUNT_CREATED",
  "PATIENT_ACCOUNT_CREATED",
  "USER_PROFILE_UPDATED",
  "USER_ROLE_CHANGED",
  "USER_STATUS_CHANGED",
  "ACCOUNT_UNLOCKED",
  "PASSWORD_RESET_BY_ADMIN",
  "USER_DELETED",
  "ORGANIZATION_CREATED",
  "ORGANIZATION_UPDATED",
  "ORGANIZATION_STATUS_CHANGED",
  "ORGANIZATION_DELETED"
] as const;

export const TRACKED_DOCTOR_ACTIONS = [
  "ENCOUNTER_CREATED",
  "ENCOUNTER_UPDATED",
  "ENCOUNTER_DELETED",
  "CONDITION_CREATED",
  "CONDITION_UPDATED",
  "CONDITION_DELETED",
  "ALLERGY_CREATED",
  "ALLERGY_UPDATED",
  "ALLERGY_DELETED",
  "PRESCRIPTION_ISSUED",
  "PRESCRIPTION_UPDATED",
  "PRESCRIPTION_DELETED"
] as const;

export const TRACKED_ACTIVITY_ACTIONS = [
  ...TRACKED_ACCOUNT_ACTIONS,
  ...TRACKED_DOCTOR_ACTIONS
] as const;

export interface ActivityEventRow extends RowDataPacket {
  id: number;
  action: string;
  entityType: string;
  entityId: number | null;
  metadata: unknown;
  eventAt: Date;
  actorUserId: number | null;
  actorName: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  targetName: string | null;
}

export async function listTrackedActivity(search: string): Promise<ActivityEventRow[]> {
  const term = `%${search}%`;
  const placeholders = TRACKED_ACTIVITY_ACTIONS.map(() => "?").join(",");
  const [rows] = await databasePool.query<ActivityEventRow[]>(
    `SELECT a.id, a.action, a.entity_type AS entityType, a.entity_id AS entityId,
            a.metadata_json AS metadata, a.event_at AS eventAt,
            a.actor_user_id AS actorUserId,
            actor.display_name AS actorName, actor.email AS actorEmail,
            a.actor_role_code AS actorRole,
            CASE
              WHEN a.entity_type = 'USER' THEN COALESCE(target.display_name, target.email)
              WHEN a.entity_type = 'ORGANIZATION' THEN org.name
              ELSE NULLIF(TRIM(CONCAT(IFNULL(clinical_patient.first_name, ''), ' ', IFNULL(clinical_patient.last_name, ''))), '')
            END AS targetName
       FROM audit_events a
       LEFT JOIN users actor ON actor.id = a.actor_user_id
       LEFT JOIN users target ON a.entity_type = 'USER' AND target.id = a.entity_id
       LEFT JOIN organizations org ON a.entity_type = 'ORGANIZATION' AND org.id = a.entity_id
       LEFT JOIN patients clinical_patient
         ON clinical_patient.id = CAST(JSON_UNQUOTE(JSON_EXTRACT(a.metadata_json, '$.patientId')) AS UNSIGNED)
      WHERE a.result = 'SUCCESS'
        AND a.action IN (${placeholders})
        AND (? = ''
             OR actor.display_name LIKE ?
             OR actor.email LIKE ?
             OR target.display_name LIKE ?
             OR target.email LIKE ?
             OR org.name LIKE ?
             OR clinical_patient.first_name LIKE ?
             OR clinical_patient.last_name LIKE ?
             OR CONCAT(clinical_patient.first_name, ' ', clinical_patient.last_name) LIKE ?
             OR a.action LIKE ?)
      ORDER BY a.event_at DESC, a.id DESC
      LIMIT 200`,
    [...TRACKED_ACTIVITY_ACTIONS, search, term, term, term, term, term, term, term, term, term]
  );
  return rows;
}
