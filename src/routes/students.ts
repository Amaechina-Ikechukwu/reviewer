import { asc, eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db } from "../db/connection";
import { assignments, authTokens, reviews, submissionOverrides, submissions, users } from "../db/schema";
import type { AuthenticatedRequest } from "../middleware/auth";
import { audit } from "../services/audit";
import { sendInvite, sendPasswordReset } from "../services/email";
import { json, parseJson } from "../utils/json";

type CreateStudentBody = {
  email?: string;
  fullName?: string;
};

function generateToken() {
  return randomBytes(32).toString("hex");
}

export const studentRoutes = {
  async list(request: Request) {
    const user = (request as AuthenticatedRequest).user;
    if (user.role !== "teacher") {
      return json({ error: "Only teachers can manage students." }, 403);
    }

    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        role: users.role,
        createdAt: users.createdAt,
        passwordHash: users.passwordHash,
      })
      .from(users)
      .where(eq(users.role, "student"))
      .orderBy(asc(users.fullName));

    return json(rows.map(({ passwordHash, ...r }) => ({ ...r, pending: passwordHash === "INVITE_PENDING" })));
  },

  async create(request: Request) {
    const user = (request as AuthenticatedRequest).user;
    if (user.role !== "teacher") {
      return json({ error: "Only teachers can create students." }, 403);
    }

    const body = await parseJson<CreateStudentBody>(request);
    const email = body.email?.trim().toLowerCase();
    const fullName = body.fullName?.trim();

    if (!email || !fullName) {
      return json({ error: "Student full name and email are required." }, 400);
    }

    const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing.length > 0) {
      return json({ error: "A student with that email already exists." }, 409);
    }

    const [student] = await db
      .insert(users)
      .values({ email, fullName, passwordHash: "INVITE_PENDING", role: "student" })
      .returning({ id: users.id, email: users.email, fullName: users.fullName, role: users.role, createdAt: users.createdAt });

    const token = generateToken();
    await db.insert(authTokens).values({
      userId: student.id,
      token,
      type: "invite",
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    });

    try {
      await sendInvite(email, fullName, token);
    } catch (err) {
      console.error("Failed to send invite email:", err);
    }

    return json({ student: { ...student, pending: true }, inviteSent: true }, 201);
  },

  async myOverrides(request: Request) {
    const user = (request as AuthenticatedRequest).user;
    if (user.role !== "student") return json({ assignmentIds: [] });

    const rows = await db
      .select({ assignmentId: submissionOverrides.assignmentId })
      .from(submissionOverrides)
      .where(eq(submissionOverrides.studentId, user.userId));

    return json({ assignmentIds: rows.map((r) => r.assignmentId) });
  },

  async openSubmission(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    if (user.role !== "teacher") return json({ error: "Only teachers can open submissions." }, 403);

    const { studentId } = params;
    const { assignmentId, closesAt: closesAtStr } = await parseJson<{ assignmentId?: string; closesAt?: string }>(request);
    if (!assignmentId) return json({ error: "assignmentId required." }, 400);
    const closesAt = closesAtStr ? new Date(closesAtStr) : null;
    if (closesAt && Number.isNaN(closesAt.getTime())) return json({ error: "Invalid closesAt date." }, 400);

    const [student] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, studentId)).limit(1);
    if (!student || student.role !== "student") return json({ error: "Student not found." }, 404);

    const [assignment] = await db.select({ id: assignments.id }).from(assignments).where(eq(assignments.id, assignmentId)).limit(1);
    if (!assignment) return json({ error: "Assignment not found." }, 404);

    await db
      .insert(submissionOverrides)
      .values({ studentId, assignmentId, grantedBy: user.userId, ...(closesAt ? { closesAt } : {}) })
      .onConflictDoUpdate({
        target: [submissionOverrides.studentId, submissionOverrides.assignmentId],
        set: { grantedBy: user.userId, ...(closesAt ? { closesAt } : {}) },
      });

    return json({ opened: true });
  },

  async merge(request: Request) {
    const user = (request as AuthenticatedRequest).user;
    if (user.role !== "teacher") return json({ error: "Only teachers can merge students." }, 403);

    const { sourceId, targetId } = await parseJson<{ sourceId?: string; targetId?: string }>(request);
    if (!sourceId || !targetId) return json({ error: "sourceId and targetId required." }, 400);
    if (sourceId === targetId) return json({ error: "Cannot merge a student with themselves." }, 400);

    const [source] = await db.select({ id: users.id, role: users.role, fullName: users.fullName, email: users.email })
      .from(users).where(eq(users.id, sourceId)).limit(1);
    const [target] = await db.select({ id: users.id, role: users.role, fullName: users.fullName, email: users.email })
      .from(users).where(eq(users.id, targetId)).limit(1);

    if (!source || source.role !== "student") return json({ error: "Source student not found." }, 404);
    if (!target || target.role !== "student") return json({ error: "Target student not found." }, 404);

    // If the target has a placeholder/historical email but source has a real one,
    // copy ONLY the email over — keep the target's own name intact.
    // Must clear source email first (unique constraint) before setting it on target.
    const targetHasPlaceholder = target.email.endsWith("@historical.reviewai.local");
    const sourceHasRealEmail = !source.email.endsWith("@historical.reviewai.local");
    if (targetHasPlaceholder && sourceHasRealEmail) {
      const tempEmail = `merging.${Date.now()}@historical.reviewai.local`;
      await db.update(users).set({ email: tempEmail }).where(eq(users.id, sourceId));
      await db.update(users).set({ email: source.email }).where(eq(users.id, targetId));
    }

    // Find which assignments target already has submissions for (to detect conflicts)
    const targetSubs = await db
      .select({ assignmentId: submissions.assignmentId })
      .from(submissions)
      .where(eq(submissions.studentId, targetId));
    const targetAssignmentIds = new Set(targetSubs.map((s) => s.assignmentId));

    // Transfer non-conflicting submissions; collect conflicting ones
    const sourceSubs = await db.select().from(submissions).where(eq(submissions.studentId, sourceId));
    const conflictSubIds: string[] = [];
    for (const sub of sourceSubs) {
      if (!targetAssignmentIds.has(sub.assignmentId)) {
        await db.update(submissions).set({ studentId: targetId }).where(eq(submissions.id, sub.id));
      } else {
        conflictSubIds.push(sub.id);
      }
    }

    // Delete conflicting submissions and their reviews
    for (const subId of conflictSubIds) {
      await db.delete(reviews).where(eq(reviews.submissionId, subId));
      await db.delete(submissions).where(eq(submissions.id, subId));
    }

    // Transfer overrides (non-conflicting)
    const sourceOverrides = await db
      .select()
      .from(submissionOverrides)
      .where(eq(submissionOverrides.studentId, sourceId));
    for (const override of sourceOverrides) {
      await db
        .insert(submissionOverrides)
        .values({ studentId: targetId, assignmentId: override.assignmentId, grantedBy: override.grantedBy })
        .onConflictDoNothing();
    }

    // Delete all remaining source records
    await db.delete(submissionOverrides).where(eq(submissionOverrides.studentId, sourceId));
    await db.delete(authTokens).where(eq(authTokens.userId, sourceId));
    await db.delete(users).where(eq(users.id, sourceId));

    return json({ merged: true, targetId, transferredSubmissions: sourceSubs.length - conflictSubIds.length, skipped: conflictSubIds.length });
  },

  async resetPassword(request: Request) {
    const user = (request as AuthenticatedRequest).user;
    if (user.role !== "teacher") {
      return json({ error: "Only teachers can trigger password resets." }, 403);
    }

    const { studentId } = await parseJson<{ studentId?: string }>(request);
    if (!studentId) return json({ error: "studentId required." }, 400);

    const [student] = await db.select().from(users).where(eq(users.id, studentId)).limit(1);
    if (!student || student.role !== "student") return json({ error: "Student not found." }, 404);

    const token = generateToken();
    await db.insert(authTokens).values({
      userId: student.id,
      token,
      type: "reset",
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
    });

    try {
      await sendPasswordReset(student.email, student.fullName, token);
    } catch (err) {
      console.error("Failed to send reset email:", err);
    }

    audit({ actorId: user.userId, action: "student.password_reset", targetType: "student", targetId: studentId });
    return json({ sent: true });
  },

  async delete(request: Request, params: Record<string, string>) {
    const actor = (request as AuthenticatedRequest).user;
    if (actor.role !== "teacher") return json({ error: "Only teachers can delete students." }, 403);

    const { studentId } = params;

    const [existing] = await db.select({ id: users.id, role: users.role, fullName: users.fullName, email: users.email })
      .from(users).where(eq(users.id, studentId)).limit(1);
    if (!existing || existing.role !== "student") return json({ error: "Student not found." }, 404);

    // Cascade: delete reviews first, then submissions, overrides, tokens, user
    const studentSubs = await db.select({ id: submissions.id }).from(submissions).where(eq(submissions.studentId, studentId));
    for (const sub of studentSubs) {
      await db.delete(reviews).where(eq(reviews.submissionId, sub.id));
    }
    await db.delete(submissions).where(eq(submissions.studentId, studentId));
    await db.delete(submissionOverrides).where(eq(submissionOverrides.studentId, studentId));
    await db.delete(authTokens).where(eq(authTokens.userId, studentId));
    await db.delete(users).where(eq(users.id, studentId));

    audit({
      actorId: actor.userId,
      action: "student.deleted",
      targetType: "student",
      targetId: studentId,
      details: { fullName: existing.fullName, email: existing.email, submissionsDeleted: studentSubs.length },
    });

    return json({ deleted: true });
  },

  async update(request: Request, params: Record<string, string>) {
    const actor = (request as AuthenticatedRequest).user;
    if (actor.role !== "teacher") return json({ error: "Only teachers can edit student details." }, 403);

    const { studentId } = params;
    const body = await parseJson<{ fullName?: string; email?: string }>(request);

    const fullName = body.fullName?.trim();
    const email = body.email?.trim().toLowerCase();

    if (!fullName && !email) return json({ error: "Provide at least one field to update." }, 400);

    const [existing] = await db.select().from(users).where(eq(users.id, studentId)).limit(1);
    if (!existing || existing.role !== "student") return json({ error: "Student not found." }, 404);

    if (email && email !== existing.email) {
      const [conflict] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
      if (conflict) return json({ error: "That email is already in use." }, 409);
    }

    const patch: Partial<{ fullName: string; email: string }> = {};
    if (fullName) patch.fullName = fullName;
    if (email) patch.email = email;

    const [updated] = await db
      .update(users)
      .set(patch)
      .where(eq(users.id, studentId))
      .returning({ id: users.id, email: users.email, fullName: users.fullName, role: users.role, createdAt: users.createdAt });

    audit({
      actorId: actor.userId,
      action: "student.updated",
      targetType: "student",
      targetId: studentId,
      details: { before: { fullName: existing.fullName, email: existing.email }, after: patch },
    });

    return json(updated);
  },
};
