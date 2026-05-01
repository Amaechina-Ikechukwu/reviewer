import { randomUUID } from "node:crypto";
import type { AuthenticatedRequest } from "../../middleware/auth";
import { json, parseJson } from "../../utils/json";
import { signToken } from "../../utils/jwt";
import { hashPassword, verifyPassword } from "../../utils/password";
import { data } from "../data";
import { COLLECTIONS } from "../firebase";
import { audit } from "../services/audit";

type RegisterBody = { email?: string; password?: string; fullName?: string; role?: "student" | "teacher" };
type LoginBody = { email?: string; password?: string };

function userResponse(u: { id: string; email: string; fullName: string; role: "student" | "teacher" }) {
  const token = signToken({ userId: u.id, email: u.email, fullName: u.fullName, role: u.role });
  return { token, user: { id: u.id, email: u.email, fullName: u.fullName, role: u.role } };
}

export const authRoutes = {
  async register(request: Request) {
    const body = await parseJson<RegisterBody>(request);
    const email = body.email?.trim().toLowerCase();
    const password = body.password?.trim();
    const fullName = body.fullName?.trim();
    const role = body.role === "teacher" ? "teacher" : "student";

    if (!email || !password || !fullName) return json({ error: "Email, password, and full name are required." }, 400);

    const existing = await data.findOne<{ id: string }>(COLLECTIONS.users, [["email", "==", email]]);
    if (existing) return json({ error: "An account with that email already exists." }, 409);

    const id = randomUUID();
    const user = await data.insert<{ id: string; email: string; fullName: string; role: "student" | "teacher" }>(
      COLLECTIONS.users,
      id,
      { email, passwordHash: await hashPassword(password), fullName, role, joinCode: null, teacherId: null },
    );

    audit({ actorId: user.id, actorEmail: user.email, action: "auth.register", targetType: "user", targetId: user.id, details: { role } });
    return json(userResponse(user), 201);
  },

  async login(request: Request) {
    const body = await parseJson<LoginBody>(request);
    const email = body.email?.trim().toLowerCase();
    const password = body.password?.trim();

    if (!email || !password) return json({ error: "Email and password are required." }, 400);

    const user = await data.findOne<any>(COLLECTIONS.users, [["email", "==", email]]);
    if (!user) return json({ error: "Invalid email or password." }, 401);

    if (user.passwordHash === "INVITE_PENDING") {
      return json({ error: "Your account is not set up yet. Check your email for a setup link." }, 403);
    }

    if (!await verifyPassword(password, user.passwordHash)) {
      audit({ actorEmail: email, action: "auth.login_failed", details: { reason: "wrong_password" } });
      return json({ error: "Invalid email or password." }, 401);
    }

    audit({ actorId: user.id, actorEmail: user.email, action: "auth.login", targetType: "user", targetId: user.id });
    return json(userResponse(user));
  },

  async me(request: Request) {
    const user = (request as AuthenticatedRequest).user;
    return json({ user: { id: user.userId, email: user.email, fullName: user.fullName, role: user.role } });
  },

  async acceptInvite(request: Request, params: Record<string, string>) {
    const { token } = params;
    const { password } = await parseJson<{ password?: string }>(request);
    if (!password || password.length < 8) return json({ error: "Password must be at least 8 characters." }, 400);

    const row = await data.findOne<any>(COLLECTIONS.authTokens, [
      ["token", "==", token],
      ["type", "==", "invite"],
    ]);
    if (!row || row.usedAt || (row.expiresAt && new Date(row.expiresAt) < new Date())) {
      return json({ error: "Invite link is invalid or has expired." }, 400);
    }

    const user = await data.getById<any>(COLLECTIONS.users, row.userId);
    if (!user) return json({ error: "Account not found." }, 404);

    await data.update(COLLECTIONS.users, user.id, { passwordHash: await hashPassword(password) });
    await data.update(COLLECTIONS.authTokens, row.id, { usedAt: new Date() });

    // Merge historical placeholder accounts with same name
    const nameLower = (user.fullName as string).trim().toLowerCase();
    const allStudents = await data.findMany<any>(COLLECTIONS.users, { where: [["role", "==", "student"]] });
    const ghosts = allStudents.filter(
      (u) => u.id !== user.id
        && typeof u.email === "string"
        && u.email.endsWith("@historical.reviewai.local")
        && (u.fullName as string).trim().toLowerCase() === nameLower,
    );

    for (const ghost of ghosts) {
      const ghostSubs = await data.findMany<any>(COLLECTIONS.submissions, { where: [["studentId", "==", ghost.id]] });
      for (const s of ghostSubs) await data.update(COLLECTIONS.submissions, s.id, { studentId: user.id });
      await data.del(COLLECTIONS.users, ghost.id);
    }

    audit({ actorId: user.id, actorEmail: user.email, action: "auth.invite_accepted", targetType: "user", targetId: user.id, details: { mergedHistorical: ghosts.length } });
    return json(userResponse(user));
  },

  async resetPassword(request: Request, params: Record<string, string>) {
    const { token } = params;
    const { password } = await parseJson<{ password?: string }>(request);
    if (!password || password.length < 8) return json({ error: "Password must be at least 8 characters." }, 400);

    const row = await data.findOne<any>(COLLECTIONS.authTokens, [
      ["token", "==", token],
      ["type", "==", "reset"],
    ]);
    if (!row || row.usedAt || (row.expiresAt && new Date(row.expiresAt) < new Date())) {
      return json({ error: "Reset link is invalid or has expired." }, 400);
    }

    const user = await data.getById<any>(COLLECTIONS.users, row.userId);
    if (!user) return json({ error: "Account not found." }, 404);

    await data.update(COLLECTIONS.users, user.id, { passwordHash: await hashPassword(password) });
    await data.update(COLLECTIONS.authTokens, row.id, { usedAt: new Date() });
    return json(userResponse(user));
  },

  async validateToken(request: Request, params: Record<string, string>) {
    const { token } = params;
    const url = new URL(request.url);
    const type = (url.searchParams.get("type") as "invite" | "reset" | null) || "invite";

    const row = await data.findOne<any>(COLLECTIONS.authTokens, [
      ["token", "==", token],
      ["type", "==", type],
    ]);
    if (!row || row.usedAt || (row.expiresAt && new Date(row.expiresAt) < new Date())) {
      return json({ valid: false }, 200);
    }

    const user = await data.getById<any>(COLLECTIONS.users, row.userId);
    return json({ valid: true, fullName: user?.fullName, email: user?.email });
  },
};
