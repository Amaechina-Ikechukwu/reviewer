import { randomBytes, randomUUID } from "node:crypto";
import type { AuthenticatedRequest } from "../../middleware/auth";
import { json, parseJson } from "../../utils/json";
import { signToken } from "../../utils/jwt";
import { hashPassword } from "../../utils/password";
import { data } from "../data";
import { COLLECTIONS } from "../firebase";

const generateJoinCode = () => randomBytes(8).toString("hex");

function userResponse(u: { id: string; email: string; fullName: string; role: "student" | "teacher" }) {
  const token = signToken({ userId: u.id, email: u.email, fullName: u.fullName, role: u.role });
  return { token, user: { id: u.id, email: u.email, fullName: u.fullName, role: u.role } };
}

export const teacherRoutes = {
  async getJoinLink(request: Request) {
    const user = (request as AuthenticatedRequest).user;
    if (user.role !== "teacher") return json({ error: "Only teachers can get join links." }, 403);

    let teacher = await data.getById<any>(COLLECTIONS.users, user.userId);
    if (!teacher) return json({ error: "Account not found." }, 404);

    if (!teacher.joinCode) {
      const code = generateJoinCode();
      teacher = await data.update<any>(COLLECTIONS.users, user.userId, { joinCode: code });
    }

    const appUrl = (process.env.APP_URL || "").replace(/\/$/, "");
    return json({ code: teacher!.joinCode, url: `${appUrl}/v2/join/${teacher!.joinCode}` });
  },

  async getTeacherByCode(_request: Request, params: Record<string, string>) {
    const teacher = await data.findOne<any>(COLLECTIONS.users, [["joinCode", "==", params.code]]);
    if (!teacher) return json({ error: "Invalid join link." }, 404);
    return json({ teacherName: teacher.fullName });
  },

  async joinViaLink(request: Request, params: Record<string, string>) {
    const teacher = await data.findOne<any>(COLLECTIONS.users, [["joinCode", "==", params.code]]);
    if (!teacher) return json({ error: "Invalid join link." }, 404);

    const body = await parseJson<{ fullName?: string; email?: string; password?: string }>(request);
    const trimmedEmail = body.email?.trim().toLowerCase();
    const trimmedName = body.fullName?.trim();
    const { password } = body;

    if (!trimmedEmail || !trimmedName || !password || password.length < 8) {
      return json({ error: "Full name, email, and password (min 8 chars) are required." }, 400);
    }

    const existing = await data.findOne(COLLECTIONS.users, [["email", "==", trimmedEmail]]);
    if (existing) return json({ error: "An account with that email already exists." }, 409);

    const id = randomUUID();
    const student = await data.insert<any>(COLLECTIONS.users, id, {
      email: trimmedEmail, fullName: trimmedName,
      passwordHash: await hashPassword(password),
      role: "student", teacherId: teacher.id, joinCode: null,
    });
    return json(userResponse(student), 201);
  },
};
