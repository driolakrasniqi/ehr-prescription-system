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
    [input.actorUserId ?? null, input.actorRoleCode ?? null, input.action,
     input.entityType, input.entityId ?? null, input.result,
     input.ipAddress ?? null, input.userAgent ?? null,
     input.metadata ? JSON.stringify(input.metadata) : null]
  );
}
