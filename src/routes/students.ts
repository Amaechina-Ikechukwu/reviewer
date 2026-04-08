import { asc, eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db } from "../db/connection";
import { assignments, authTokens, submissionOverrides, users } from "../db/schema";
import type { AuthenticatedRequest } from "../middleware/auth";
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

  async openSubmission(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    if (user.role !== "teacher") return json({ error: "Only teachers can open submissions." }, 403);

    const { studentId } = params;
    const { assignmentId } = await parseJson<{ assignmentId?: string }>(request);
    if (!assignmentId) return json({ error: "assignmentId required." }, 400);

    const [student] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, studentId)).limit(1);
    if (!student || student.role !== "student") return json({ error: "Student not found." }, 404);

    const [assignment] = await db.select({ id: assignments.id }).from(assignments).where(eq(assignments.id, assignmentId)).limit(1);
    if (!assignment) return json({ error: "Assignment not found." }, 404);

    await db
      .insert(submissionOverrides)
      .values({ studentId, assignmentId, grantedBy: user.userId })
      .onConflictDoNothing();

    return json({ opened: true });
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

    return json({ sent: true });
  },
};
