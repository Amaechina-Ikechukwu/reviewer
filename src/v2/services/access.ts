import { data } from "../data";
import { COLLECTIONS } from "../firebase";
import { type Permission, permissionsFor } from "../../utils/permissions";

/**
 * Access lives on the user record, not in the token, so revoking something
 * takes effect on the next request instead of the next login. That costs a
 * read per request, which a short cache absorbs.
 */
export type ResolvedAccess = {
  permissions: Permission[];
  allowedAssignmentIds?: string[] | null;
};

const TTL_MS = 30_000;
const cache = new Map<string, { access: ResolvedAccess; expiresAt: number }>();

export function invalidateAccess(userId: string) {
  cache.delete(userId);
}

export async function resolveAccess(userId: string, role: string): Promise<ResolvedAccess> {
  const hit = cache.get(userId);
  if (hit && hit.expiresAt > Date.now()) return hit.access;

  // A missing or unreadable record falls back to the role's defaults rather
  // than locking someone out of the app mid-session.
  const user = await data.getById<any>(COLLECTIONS.users, userId).catch(() => null);
  const permissions = permissionsFor(user ?? { role });
  const allowedAssignmentIds = Array.isArray(user?.allowedAssignmentIds) ? user.allowedAssignmentIds : null;

  const access: ResolvedAccess = { permissions, allowedAssignmentIds };
  cache.set(userId, { access, expiresAt: Date.now() + TTL_MS });
  return access;
}

export async function resolvePermissions(userId: string, role: string): Promise<Permission[]> {
  const access = await resolveAccess(userId, role);
  return access.permissions;
}
