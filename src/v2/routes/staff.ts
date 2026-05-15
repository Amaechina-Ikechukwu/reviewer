import { randomUUID } from "node:crypto";
import type { AuthenticatedRequest } from "../../middleware/auth";
import { isStaff } from "../../utils/jwt";
import { json, parseJson } from "../../utils/json";
import { sendInvite } from "../../services/email";
import { data } from "../data";
import { COLLECTIONS } from "../firebase";
import { audit } from "../services/audit";

const VALID_STAFF_ROLES = ["teacher", "owner", "admin", "manager", "instructor"] as const;
type StaffRole = typeof VALID_STAFF_ROLES[number];

const generateToken = () => randomUUID().replace(/-/g, "");

export const staffRoutes = {
  async list(request: Request) {
    const user = (request as AuthenticatedRequest).user;
    if (!isStaff(user.role)) return json({ error: "Access denied." }, 403);

    const all = await data.findMany<any>(COLLECTIONS.users, {});
    const staff = all.filter((u) => (VALID_STAFF_ROLES as readonly string[]).includes(u.role));

    return json(staff.map((s) => ({
      id: s.id,
      email: s.email,
      fullName: s.fullName,
      role: s.role,
      pending: s.passwordHash === "INVITE_PENDING",
    })));
  },

  async invite(request: Request) {
    const actor = (request as AuthenticatedRequest).user;
    if (!isStaff(actor.role)) return json({ error: "Access denied." }, 403);

    const body = await parseJson<{ fullName?: string; email?: string; role?: string }>(request);
    const email = body.email?.trim().toLowerCase();
    const fullName = body.fullName?.trim();
    const role: StaffRole = (VALID_STAFF_ROLES as readonly string[]).includes(body.role || "")
      ? (body.role as StaffRole)
      : "instructor";

    if (!email || !fullName) return json({ error: "Full name and email are required." }, 400);

    const existing = await data.findOne<any>(COLLECTIONS.users, [["email", "==", email]]);
    if (existing) return json({ error: "An account with that email already exists." }, 409);

    const id = randomUUID();
    const staff = await data.insert<any>(COLLECTIONS.users, id, {
      email, fullName, passwordHash: "INVITE_PENDING", role, joinCode: null, teacherId: null,
    });

    const token = generateToken();
    await data.insert(COLLECTIONS.authTokens, randomUUID(), {
      userId: staff.id, token, type: "invite",
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000), usedAt: null,
    });

    try { await sendInvite(email, fullName, token); } catch (err) {
      console.error("Failed to send invite email:", err);
    }

    audit({ actorId: actor.userId, action: "staff.invited", targetType: "user", targetId: staff.id, details: { email, role } });
    return json({ id: staff.id, email, fullName, role, pending: true }, 201);
  },

  async updateRole(request: Request, params: Record<string, string>) {
    const actor = (request as AuthenticatedRequest).user;
    if (!isStaff(actor.role)) return json({ error: "Access denied." }, 403);

    const { id } = params;
    if (id === actor.userId) return json({ error: "You cannot change your own role." }, 400);

    const body = await parseJson<{ role?: string }>(request);
    if (!body.role || !(VALID_STAFF_ROLES as readonly string[]).includes(body.role)) {
      return json({ error: "Invalid role." }, 400);
    }
    const role = body.role as StaffRole;

    const target = await data.getById<any>(COLLECTIONS.users, id);
    if (!target || !(VALID_STAFF_ROLES as readonly string[]).includes(target.role)) {
      return json({ error: "Staff member not found." }, 404);
    }

    await data.update(COLLECTIONS.users, id, { role });
    audit({ actorId: actor.userId, action: "staff.role_changed", targetType: "user", targetId: id, details: { from: target.role, to: role } });
    return json({ id, role });
  },

  async resendInvite(request: Request, params: Record<string, string>) {
    const actor = (request as AuthenticatedRequest).user;
    if (!isStaff(actor.role)) return json({ error: "Access denied." }, 403);

    const { id } = params;
    const target = await data.getById<any>(COLLECTIONS.users, id);
    if (!target || !(VALID_STAFF_ROLES as readonly string[]).includes(target.role)) {
      return json({ error: "Staff member not found." }, 404);
    }
    if (target.passwordHash !== "INVITE_PENDING") {
      return json({ error: "This staff member has already set up their account." }, 400);
    }

    await data.delMany(COLLECTIONS.authTokens, [["userId", "==", id]]);
    const token = generateToken();
    await data.insert(COLLECTIONS.authTokens, randomUUID(), {
      userId: id, token, type: "invite",
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000), usedAt: null,
    });

    try { await sendInvite(target.email, target.fullName, token); } catch (err) {
      console.error("Failed to resend invite email:", err);
    }

    audit({ actorId: actor.userId, action: "staff.invite_resent", targetType: "user", targetId: id });
    return json({ sent: true });
  },

  async remove(request: Request, params: Record<string, string>) {
    const actor = (request as AuthenticatedRequest).user;
    if (!isStaff(actor.role)) return json({ error: "Access denied." }, 403);

    const { id } = params;
    if (id === actor.userId) return json({ error: "You cannot remove yourself." }, 400);

    const target = await data.getById<any>(COLLECTIONS.users, id);
    if (!target || !(VALID_STAFF_ROLES as readonly string[]).includes(target.role)) {
      return json({ error: "Staff member not found." }, 404);
    }

    await data.delMany(COLLECTIONS.authTokens, [["userId", "==", id]]);
    await data.del(COLLECTIONS.users, id);

    audit({ actorId: actor.userId, action: "staff.removed", targetType: "user", targetId: id, details: { email: target.email, role: target.role } });
    return json({ removed: true });
  },
};
