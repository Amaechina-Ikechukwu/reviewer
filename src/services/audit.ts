import { randomUUID } from "node:crypto";
import { COLLECTIONS } from "../v2/firebase";
import { data } from "../v2/data";

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
  const id = randomUUID();
  data.insert(COLLECTIONS.auditLogs, id, {
    actorId: params.actorId ?? null,
    actorEmail: params.actorEmail ?? null,
    action: params.action,
    targetType: params.targetType ?? null,
    targetId: params.targetId ?? null,
    details: params.details ?? null,
  }).catch(console.error);
}
