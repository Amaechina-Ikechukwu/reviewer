import { desc, eq } from "drizzle-orm";
import { db } from "../db/connection";
import { auditLogs, users } from "../db/schema";
import type { AuthenticatedRequest } from "../middleware/auth";
import { json } from "../utils/json";

export const auditLogRoutes = {
  async list(request: Request) {
    const actor = (request as AuthenticatedRequest).user;
    if (actor.role !== "teacher") return json({ error: "Only teachers can view audit logs." }, 403);

    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get("limit") || 100), 500);
    const offset = Number(url.searchParams.get("offset") || 0);

    const rows = await db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset);

    return json(rows);
  },
};
