import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db } from "../db/connection";
import { users } from "../db/schema";
import type { AuthenticatedRequest } from "../middleware/auth";
import { json, parseJson } from "../utils/json";
import { hashPassword } from "../utils/password";
import { signToken } from "../utils/jwt";

function generateJoinCode() {
  return randomBytes(8).toString("hex");
}

function userResponse(user: { id: string; email: string; fullName: string; role: "student" | "teacher" }) {
  const token = signToken({ userId: user.id, email: user.email, fullName: user.fullName, role: user.role });
  return { token, user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role } };
}

export const teacherRoutes = {
  async getJoinLink(request: Request) {
    const user = (request as AuthenticatedRequest).user;
    if (user.role !== "teacher") return json({ error: "Only teachers can get join links." }, 403);

    let [teacher] = await db.select().from(users).where(eq(users.id, user.userId)).limit(1);

    if (!teacher.joinCode) {
      const code = generateJoinCode();
      [teacher] = await db.update(users).set({ joinCode: code }).where(eq(users.id, user.userId)).returning();
    }

    const appUrl = (process.env.APP_URL || "").replace(/\/$/, "");
    return json({ code: teacher.joinCode, url: `${appUrl}/join/${teacher.joinCode}` });
  },

  async getTeacherByCode(_request: Request, params: Record<string, string>) {
    const { code } = params;
    const [teacher] = await db
      .select({ fullName: users.fullName })
      .from(users)
      .where(eq(users.joinCode, code))
      .limit(1);

    if (!teacher) return json({ error: "Invalid join link." }, 404);
    return json({ teacherName: teacher.fullName });
  },

  async joinViaLink(request: Request, params: Record<string, string>) {
    const { code } = params;
    const [teacher] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.joinCode, code))
      .limit(1);

    if (!teacher) return json({ error: "Invalid join link." }, 404);

    const body = await parseJson<{ fullName?: string; email?: string; password?: string }>(request);
    const trimmedEmail = body.email?.trim().toLowerCase();
    const trimmedName = body.fullName?.trim();
    const { password } = body;

    if (!trimmedEmail || !trimmedName || !password || password.length < 8) {
      return json({ error: "Full name, email, and password (min 8 chars) are required." }, 400);
    }

    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, trimmedEmail)).limit(1);
    if (existing.length > 0) {
      return json({ error: "An account with that email already exists." }, 409);
    }

    const [student] = await db
      .insert(users)
      .values({
        email: trimmedEmail,
        fullName: trimmedName,
        passwordHash: await hashPassword(password),
        role: "student",
        teacherId: teacher.id,
      })
      .returning();

    return json(userResponse(student), 201);
  },
};
