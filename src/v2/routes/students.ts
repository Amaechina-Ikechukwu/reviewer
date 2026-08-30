import { randomBytes, randomUUID } from "node:crypto";
import type { AuthenticatedRequest } from "../../middleware/auth";
import { isStaff } from "../../utils/jwt";
import { audit } from "../services/audit";
import { invalidateAccess } from "../services/access";
import { sendInvite, sendPasswordReset } from "../../services/email";
import { json, parseJson } from "../../utils/json";
import { data } from "../data";
import { COLLECTIONS } from "../firebase";
import { isStaffOrGranted, permissionsFor, sanitizePermissions, STUDENT_GRANTABLE_PERMISSIONS } from "../../utils/permissions";

const generateToken = () => randomBytes(32).toString("hex");

export const studentRoutes = {
  async list(request: Request) {
    const user = (request as AuthenticatedRequest).user;
    if (!isStaffOrGranted(user, "students.manage")) return json({ error: "Access denied." }, 403);

    const rows = await data.findMany<any>(COLLECTIONS.users, { where: [["role", "==", "student"]] });
    rows.sort((a, b) => String(a.fullName).localeCompare(String(b.fullName)));
    return json(rows.map(({ passwordHash, ...r }) => ({
      id: r.id, email: r.email, fullName: r.fullName, role: r.role,
      cohortId: r.cohortId ?? null,
      teacherId: r.teacherId ?? null,
      createdAt: r.createdAt,
      pending: passwordHash === "INVITE_PENDING",
      permissions: permissionsFor(r),
      customAccess: Array.isArray(r.permissions) && r.permissions.length > 0,
    })));
  },

  async create(request: Request) {
    const user = (request as AuthenticatedRequest).user;
    if (!isStaffOrGranted(user, "students.manage")) return json({ error: "Access denied." }, 403);

    const body = await parseJson<{ email?: string; fullName?: string }>(request);
    const email = body.email?.trim().toLowerCase();
    const fullName = body.fullName?.trim();
    if (!email || !fullName) return json({ error: "Student full name and email are required." }, 400);

    const existing = await data.findOne(COLLECTIONS.users, [["email", "==", email]]);
    if (existing) return json({ error: "A student with that email already exists." }, 409);

    const id = randomUUID();
    const student = await data.insert<any>(COLLECTIONS.users, id, {
      email, fullName, passwordHash: "INVITE_PENDING", role: "student", joinCode: null, teacherId: null,
    });

    const token = generateToken();
    await data.insert(COLLECTIONS.authTokens, token, {
      userId: student.id, token, type: "invite",
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000), usedAt: null,
    });

    try { await sendInvite(email, fullName, token, "student"); }
    catch (err) { console.error("Failed to send invite email:", err); }

    return json({
      student: { id: student.id, email: student.email, fullName: student.fullName, role: student.role, createdAt: student.createdAt, pending: true },
      inviteSent: true,
    }, 201);
  },

  async myOverrides(request: Request) {
    const user = (request as AuthenticatedRequest).user;
    if (user.role !== "student") return json({ assignmentIds: [] });
    const rows = await data.findMany<any>(COLLECTIONS.submissionOverrides, { where: [["studentId", "==", user.userId]] });
    return json({ assignmentIds: rows.map((r) => r.assignmentId) });
  },

  async openSubmission(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    if (!isStaffOrGranted(user, "students.manage")) return json({ error: "Access denied." }, 403);

    const { studentId } = params;
    const { assignmentId, closesAt: closesAtStr } = await parseJson<{ assignmentId?: string; closesAt?: string }>(request);
    if (!assignmentId) return json({ error: "assignmentId required." }, 400);
    const closesAt = closesAtStr ? new Date(closesAtStr) : null;
    if (closesAt && Number.isNaN(closesAt.getTime())) return json({ error: "Invalid closesAt date." }, 400);

    const student = await data.getById<any>(COLLECTIONS.users, studentId);
    if (!student || student.role !== "student") return json({ error: "Student not found." }, 404);

    const assignment = await data.getById<any>(COLLECTIONS.assignments, assignmentId);
    if (!assignment) return json({ error: "Assignment not found." }, 404);

    const existing = await data.findOne<any>(COLLECTIONS.submissionOverrides, [["studentId", "==", studentId], ["assignmentId", "==", assignmentId]]);
    if (existing) {
      await data.update(COLLECTIONS.submissionOverrides, existing.id, { grantedBy: user.userId, ...(closesAt ? { closesAt } : {}) });
    } else {
      await data.insert(COLLECTIONS.submissionOverrides, randomUUID(), {
        studentId, assignmentId, grantedBy: user.userId, closesAt: closesAt ?? null,
      });
    }

    return json({ opened: true });
  },

  async merge(request: Request) {
    const user = (request as AuthenticatedRequest).user;
    if (!isStaffOrGranted(user, "students.manage")) return json({ error: "Access denied." }, 403);

    const { sourceId, targetId } = await parseJson<{ sourceId?: string; targetId?: string }>(request);
    if (!sourceId || !targetId) return json({ error: "sourceId and targetId required." }, 400);
    if (sourceId === targetId) return json({ error: "Cannot merge a student with themselves." }, 400);

    const source = await data.getById<any>(COLLECTIONS.users, sourceId);
    const target = await data.getById<any>(COLLECTIONS.users, targetId);
    if (!source || source.role !== "student") return json({ error: "Source student not found." }, 404);
    if (!target || target.role !== "student") return json({ error: "Target student not found." }, 404);

    const targetHasPlaceholder = String(target.email).endsWith("@historical.reviewai.local");
    const sourceHasReal = !String(source.email).endsWith("@historical.reviewai.local");
    if (targetHasPlaceholder && sourceHasReal) {
      const tempEmail = `merging.${Date.now()}@historical.reviewai.local`;
      await data.update(COLLECTIONS.users, sourceId, { email: tempEmail });
      await data.update(COLLECTIONS.users, targetId, { email: source.email });
    }

    const targetSubs = await data.findMany<any>(COLLECTIONS.submissions, { where: [["studentId", "==", targetId]] });
    const targetAssignmentIds = new Set(targetSubs.map((s) => s.assignmentId));

    const sourceSubs = await data.findMany<any>(COLLECTIONS.submissions, { where: [["studentId", "==", sourceId]] });
    const conflictSubIds: string[] = [];
    for (const sub of sourceSubs) {
      if (!targetAssignmentIds.has(sub.assignmentId)) {
        await data.update(COLLECTIONS.submissions, sub.id, { studentId: targetId });
      } else {
        conflictSubIds.push(sub.id);
      }
    }
    for (const subId of conflictSubIds) {
      await data.delMany(COLLECTIONS.reviews, [["submissionId", "==", subId]]);
      await data.del(COLLECTIONS.submissions, subId);
    }

    const sourceOverrides = await data.findMany<any>(COLLECTIONS.submissionOverrides, { where: [["studentId", "==", sourceId]] });
    for (const ov of sourceOverrides) {
      const conflict = await data.findOne(COLLECTIONS.submissionOverrides, [["studentId", "==", targetId], ["assignmentId", "==", ov.assignmentId]]);
      if (!conflict) {
        await data.insert(COLLECTIONS.submissionOverrides, randomUUID(), {
          studentId: targetId, assignmentId: ov.assignmentId, grantedBy: ov.grantedBy, closesAt: ov.closesAt ?? null,
        });
      }
    }

    await data.delMany(COLLECTIONS.submissionOverrides, [["studentId", "==", sourceId]]);
    await data.delMany(COLLECTIONS.authTokens, [["userId", "==", sourceId]]);
    await data.del(COLLECTIONS.users, sourceId);

    return json({ merged: true, targetId, transferredSubmissions: sourceSubs.length - conflictSubIds.length, skipped: conflictSubIds.length });
  },

  async resetPassword(request: Request) {
    const user = (request as AuthenticatedRequest).user;
    if (!isStaffOrGranted(user, "students.manage")) return json({ error: "Access denied." }, 403);

    const { studentId } = await parseJson<{ studentId?: string }>(request);
    if (!studentId) return json({ error: "studentId required." }, 400);

    const student = await data.getById<any>(COLLECTIONS.users, studentId);
    if (!student || student.role !== "student") return json({ error: "Student not found." }, 404);

    const token = generateToken();
    await data.insert(COLLECTIONS.authTokens, token, {
      userId: student.id, token, type: "reset",
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000), usedAt: null,
    });

    try { await sendPasswordReset(student.email, student.fullName, token); }
    catch (err) { console.error("Failed to send reset email:", err); }

    audit({ actorId: user.userId, action: "student.password_reset", targetType: "student", targetId: studentId });
    return json({ sent: true });
  },

  async delete(request: Request, params: Record<string, string>) {
    const actor = (request as AuthenticatedRequest).user;
    if (!isStaffOrGranted(actor, "students.manage")) return json({ error: "Access denied." }, 403);

    const { studentId } = params;
    const existing = await data.getById<any>(COLLECTIONS.users, studentId);
    if (!existing || existing.role !== "student") return json({ error: "Student not found." }, 404);

    const subs = await data.findMany<any>(COLLECTIONS.submissions, { where: [["studentId", "==", studentId]] });
    for (const sub of subs) await data.delMany(COLLECTIONS.reviews, [["submissionId", "==", sub.id]]);
    await data.delMany(COLLECTIONS.submissions, [["studentId", "==", studentId]]);
    await data.delMany(COLLECTIONS.submissionOverrides, [["studentId", "==", studentId]]);
    await data.delMany(COLLECTIONS.authTokens, [["userId", "==", studentId]]);
    await data.del(COLLECTIONS.users, studentId);

    audit({
      actorId: actor.userId, action: "student.deleted", targetType: "student", targetId: studentId,
      details: { fullName: existing.fullName, email: existing.email, submissionsDeleted: subs.length },
    });
    return json({ deleted: true });
  },

  async update(request: Request, params: Record<string, string>) {
    const actor = (request as AuthenticatedRequest).user;
    if (!isStaffOrGranted(actor, "students.manage")) return json({ error: "Access denied." }, 403);

    const { studentId } = params;
    const body = await parseJson<{ fullName?: string; email?: string }>(request);
    const fullName = body.fullName?.trim();
    const email = body.email?.trim().toLowerCase();
    if (!fullName && !email) return json({ error: "Provide at least one field to update." }, 400);

    const existing = await data.getById<any>(COLLECTIONS.users, studentId);
    if (!existing || existing.role !== "student") return json({ error: "Student not found." }, 404);

    if (email && email !== existing.email) {
      const conflict = await data.findOne(COLLECTIONS.users, [["email", "==", email]]);
      if (conflict) return json({ error: "That email is already in use." }, 409);
    }

    const patch: Record<string, unknown> = {};
    if (fullName) patch.fullName = fullName;
    if (email) patch.email = email;

    const updated = await data.update<any>(COLLECTIONS.users, studentId, patch);

    audit({
      actorId: actor.userId, action: "student.updated", targetType: "student", targetId: studentId,
      details: { before: { fullName: existing.fullName, email: existing.email }, after: patch },
    });
    return json({ id: updated!.id, email: updated!.email, fullName: updated!.fullName, role: updated!.role, createdAt: updated!.createdAt });
  },

  /**
   * Gives a student extra responsibilities (grading, creating assignments,
   * etc.) without making them staff — they stay `role: "student"`, keep their
   * student dashboard and submission flow, and just gain the picked actions
   * on top. Reuses the same per-person permission list staff accounts use.
   */
  async updateAccess(request: Request, params: Record<string, string>) {
    const actor = (request as AuthenticatedRequest).user;
    if (!isStaff(actor.role)) return json({ error: "Access denied." }, 403);

    const { studentId } = params;
    const student = await data.getById<any>(COLLECTIONS.users, studentId);
    if (!student || student.role !== "student") return json({ error: "Student not found." }, 404);

    const body = await parseJson<{ permissions?: unknown }>(request);
    if (!Array.isArray(body.permissions)) {
      return json({ error: "Provide the permissions to grant." }, 400);
    }
    // An empty array is meaningful — it clears any access this student had.
    const permissions = sanitizePermissions(body.permissions).filter((p) => STUDENT_GRANTABLE_PERMISSIONS.includes(p));

    await data.update(COLLECTIONS.users, studentId, { permissions });
    invalidateAccess(studentId);

    audit({
      actorId: actor.userId,
      action: "student.access_changed",
      targetType: "user",
      targetId: studentId,
      details: { permissions },
    });

    return json({
      id: studentId,
      email: student.email,
      fullName: student.fullName,
      role: "student",
      permissions: permissionsFor({ role: "student", permissions }),
      customAccess: permissions.length > 0,
      pending: student.passwordHash === "INVITE_PENDING",
    });
  },
};
