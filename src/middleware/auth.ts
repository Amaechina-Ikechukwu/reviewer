import { json } from "../utils/json";
import { type AuthUser, verifyToken } from "../utils/jwt";
import type { Permission } from "../utils/permissions";

/** The signed-in caller, with the access resolved for this request. */
export type AuthenticatedRequest = Request & {
  user: AuthUser & { permissions?: Permission[] };
};

export function verifyAuth(request: Request): AuthUser | Response {
  const authHeader = request.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice("Bearer ".length);

  try {
    return verifyToken(token);
  } catch {
    return json({ error: "Invalid or expired token" }, 401);
  }
}
