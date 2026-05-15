import type { AuthenticatedRequest } from "../../middleware/auth";
import { isStaff } from "../../utils/jwt";
import { json } from "../../utils/json";
import { data } from "../data";
import { COLLECTIONS } from "../firebase";

export const auditLogRoutes = {
  async list(request: Request) {
    const actor = (request as AuthenticatedRequest).user;
    if (!isStaff(actor.role)) return json({ error: "Access denied." }, 403);

    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get("limit") || 100), 500);
    const offset = Number(url.searchParams.get("offset") || 0);

    const rows = await data.findMany<any>(COLLECTIONS.auditLogs, {
      orderBy: ["createdAt", "desc"],
      limit,
      offset,
    });
    return json(rows);
  },
};
