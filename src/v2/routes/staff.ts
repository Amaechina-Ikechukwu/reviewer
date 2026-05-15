import { randomUUID } from "node:crypto";
import type { AuthenticatedRequest } from "../../middleware/auth";
import { isStaff } from "../../utils/jwt";
import { json, parseJson } from "../../utils/json";
import { logger } from "../../utils/logger";
import { sendInvite } from "../../services/email";
import { data } from "../data";
import { COLLECTIONS } from "../firebase";
import { audit } from "../services/audit";

const VALID_STAFF_ROLES = ["teacher", "owner", "admin", "manager", "instructor"] as const;
type StaffRole = typeof VALID_STAFF_ROLES[number];

const INVITE_TTL_MS = 48 * 60 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME_LEN = 120;

const generateToken = () => randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");

function isValidRole(role: unknown): role is StaffRole {
  return typeof role === "string" && (VALID_STAFF_ROLES as readonly string[]).includes(role);
}

function buildInviteLink(token: string) {
  const base = (process.env.APP_URL || "").replace(/\/$/, "");
  return `${base}/setup/${token}`;
}

async function issueInvite(userId: string, email: string, fullName: string, role: StaffRole) {
  logger.info("issueInvite: starting", { userId, email, role });
  await data.delMany(COLLECTIONS.authTokens, [["userId", "==", userId]]);
  const token = generateToken();
  await data.insert(COLLECTIONS.authTokens, token, {
    userId, token, type: "invite",
    expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    usedAt: null,
  });
  logger.info("issueInvite: token persisted", { userId, tokenPrefix: token.slice(0, 8) });

  let emailSent = true;
  let emailError: string | null = null;
  try {
    await sendInvite(email, fullName, token, role);
    logger.info("issueInvite: email sent", { userId, email });
  } catch (err) {
    emailSent = false;
    emailError = err instanceof Error ? err.message : "Unknown error";
    logger.error("issueInvite: email send failed", {
      userId,
      email,
      error: emailError,
      stack: err instanceof Error ? err.stack : undefined,
    });
  }

  return { token, inviteLink: buildInviteLink(token), emailSent, emailError };
}

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
    const email = body.email?.trim().toLowerCase() ?? "";
    const fullName = body.fullName?.trim() ?? "";
    const rawRole = body.role?.trim();

    if (!fullName) return json({ error: "Full name is required." }, 400);
    if (fullName.length > MAX_NAME_LEN) return json({ error: `Full name must be ${MAX_NAME_LEN} characters or fewer.` }, 400);
    if (!email) return json({ error: "Email is required." }, 400);
    if (!EMAIL_RE.test(email)) return json({ error: "Please enter a valid email address." }, 400);
    if (!rawRole) return json({ error: "Role is required." }, 400);
    if (!isValidRole(rawRole)) {
      return json({ error: `Invalid role. Must be one of: ${VALID_STAFF_ROLES.join(", ")}.` }, 400);
    }
    const role: StaffRole = rawRole;

    const existing = await data.findOne<any>(COLLECTIONS.users, [["email", "==", email]]);

    if (existing) {
      if (existing.passwordHash !== "INVITE_PENDING") {
        return json({ error: "An active account with that email already exists." }, 409);
      }
      const updates: Record<string, unknown> = {};
      if (existing.fullName !== fullName) updates.fullName = fullName;
      if (existing.role !== role) updates.role = role;
      if (Object.keys(updates).length) await data.update(COLLECTIONS.users, existing.id, updates);

      const result = await issueInvite(existing.id, email, fullName, role);
      audit({
        actorId: actor.userId,
        action: "staff.invite_resent",
        targetType: "user",
        targetId: existing.id,
        details: { email, role, reason: "duplicate_invite", emailSent: result.emailSent },
      });
      return json({
        id: existing.id, email, fullName, role, pending: true,
        inviteLink: result.inviteLink,
        emailSent: result.emailSent,
        ...(result.emailError ? { emailError: result.emailError } : {}),
        reinvited: true,
      });
    }

    const id = randomUUID();
    const staff = await data.insert<any>(COLLECTIONS.users, id, {
      email, fullName, passwordHash: "INVITE_PENDING", role,
      joinCode: null, teacherId: null,
    });

    let result;
    try {
      result = await issueInvite(staff.id, email, fullName, role);
    } catch (err) {
      // Token insert failed — roll back the orphan user so the staff list stays clean.
      await data.del(COLLECTIONS.users, staff.id).catch(() => {});
      const msg = err instanceof Error ? err.message : "Failed to issue invite.";
      logger.error("Rolling back staff invite — token insert failed", {
        userId: staff.id,
        email,
        error: msg,
        stack: err instanceof Error ? err.stack : undefined,
      });
      return json({ error: msg }, 500);
    }

    audit({
      actorId: actor.userId,
      action: "staff.invited",
      targetType: "user",
      targetId: staff.id,
      details: { email, role, emailSent: result.emailSent },
    });
    return json({
      id: staff.id, email, fullName, role, pending: true,
      inviteLink: result.inviteLink,
      emailSent: result.emailSent,
      ...(result.emailError ? { emailError: result.emailError } : {}),
    }, 201);
  },

  async updateRole(request: Request, params: Record<string, string>) {
    const actor = (request as AuthenticatedRequest).user;
    if (!isStaff(actor.role)) return json({ error: "Access denied." }, 403);

    const { id } = params;
    if (id === actor.userId) return json({ error: "You cannot change your own role." }, 400);

    const body = await parseJson<{ role?: string }>(request);
    if (!isValidRole(body.role)) {
      return json({ error: `Invalid role. Must be one of: ${VALID_STAFF_ROLES.join(", ")}.` }, 400);
    }
    const role: StaffRole = body.role;

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

    const result = await issueInvite(target.id, target.email, target.fullName, target.role);

    audit({
      actorId: actor.userId,
      action: "staff.invite_resent",
      targetType: "user",
      targetId: id,
      details: { emailSent: result.emailSent },
    });
    return json({
      sent: true,
      inviteLink: result.inviteLink,
      emailSent: result.emailSent,
      ...(result.emailError ? { emailError: result.emailError } : {}),
    });
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
