import { db } from "../db/connection";
import { auditLogs } from "../db/schema";

type AuditParams = {
  actorId?: string | null;
  actorEmail?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown>;
};

/** Fire-and-forget audit log write. Never throws. */
export function audit(params: AuditParams) {
  db.insert(auditLogs)
    .values({
      actorId: params.actorId ?? null,
      actorEmail: params.actorEmail ?? null,
      action: params.action,
      targetType: params.targetType ?? null,
      targetId: params.targetId ?? null,
      details: params.details ?? null,
    })
    .catch(console.error);
}
