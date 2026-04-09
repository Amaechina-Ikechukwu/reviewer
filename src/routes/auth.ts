import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "../db/connection";
import { authTokens, submissions, users } from "../db/schema";
import type { AuthenticatedRequest } from "../middleware/auth";
import { audit } from "../services/audit";
import { json, parseJson } from "../utils/json";
import { signToken } from "../utils/jwt";
import { hashPassword, verifyPassword } from "../utils/password";

type RegisterBody = {
  email?: string;
  password?: string;
  fullName?: string;
  role?: "student" | "teacher";
};

type LoginBody = {
  email?: string;
  password?: string;
};

function userResponse(user: { id: string; email: string; fullName: string; role: "student" | "teacher" }) {
  const token = signToken({ userId: user.id, email: user.email, fullName: user.fullName, role: user.role });
  return { token, user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role } };
}

export const authRoutes = {
  async register(request: Request) {
    const body = await parseJson<RegisterBody>(request);
    const email = body.email?.trim().toLowerCase();
    const password = body.password?.trim();
    const fullName = body.fullName?.trim();
    const role = body.role === "teacher" ? "teacher" : "student";

    if (!email || !password || !fullName) {
      return json({ error: "Email, password, and full name are required." }, 400);
    }

    const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing.length > 0) {
      return json({ error: "An account with that email already exists." }, 409);
    }

    const [user] = await db
      .insert(users)
      .values({ email, passwordHash: await hashPassword(password), fullName, role })
      .returning();

    audit({ actorId: user.id, actorEmail: user.email, action: "auth.register", targetType: "user", targetId: user.id, details: { role } });
    return json(userResponse(user), 201);
  },

  async login(request: Request) {
    const body = await parseJson<LoginBody>(request);
    const email = body.email?.trim().toLowerCase();
    const password = body.password?.trim();

    if (!email || !password) {
      return json({ error: "Email and password are required." }, 400);
    }

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user) {
      return json({ error: "Invalid email or password." }, 401);
    }

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

  // Student sets password from invite link
  async acceptInvite(request: Request, params: Record<string, string>) {
    const { token } = params;
    const { password } = await parseJson<{ password?: string }>(request);

    if (!password || password.length < 8) {
      return json({ error: "Password must be at least 8 characters." }, 400);
    }

    const [row] = await db
      .select()
      .from(authTokens)
      .where(and(eq(authTokens.token, token), eq(authTokens.type, "invite"), isNull(authTokens.usedAt), gt(authTokens.expiresAt, new Date())))
      .limit(1);

    if (!row) return json({ error: "Invite link is invalid or has expired." }, 400);

    const [user] = await db.select().from(users).where(eq(users.id, row.userId)).limit(1);
    if (!user) return json({ error: "Account not found." }, 404);

    await db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, user.id));
    await db.update(authTokens).set({ usedAt: new Date() }).where(eq(authTokens.id, row.id));

    // Merge historical imports: find placeholder users with matching name and re-assign their submissions
    const nameLower = user.fullName.trim().toLowerCase();
    const historicalUsers = await db
      .select()
      .from(users)
      .where(eq(users.role, "student"));

    const matches = historicalUsers.filter(
      (u) => u.id !== user.id
        && u.email.endsWith("@historical.reviewai.local")
        && u.fullName.trim().toLowerCase() === nameLower,
    );

    for (const ghost of matches) {
      await db.update(submissions).set({ studentId: user.id }).where(eq(submissions.studentId, ghost.id));
      await db.delete(users).where(eq(users.id, ghost.id));
    }

    audit({ actorId: user.id, actorEmail: user.email, action: "auth.invite_accepted", targetType: "user", targetId: user.id, details: { mergedHistorical: matches.length } });
    return json(userResponse({ ...user, role: user.role as "student" | "teacher" }));
  },

  // Student resets password from reset link
  async resetPassword(request: Request, params: Record<string, string>) {
    const { token } = params;
    const { password } = await parseJson<{ password?: string }>(request);

    if (!password || password.length < 8) {
      return json({ error: "Password must be at least 8 characters." }, 400);
    }

    const [row] = await db
      .select()
      .from(authTokens)
      .where(and(eq(authTokens.token, token), eq(authTokens.type, "reset"), isNull(authTokens.usedAt), gt(authTokens.expiresAt, new Date())))
      .limit(1);

    if (!row) return json({ error: "Reset link is invalid or has expired." }, 400);

    const [user] = await db.select().from(users).where(eq(users.id, row.userId)).limit(1);
    if (!user) return json({ error: "Account not found." }, 404);

    await db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, user.id));
    await db.update(authTokens).set({ usedAt: new Date() }).where(eq(authTokens.id, row.id));

    return json(userResponse({ ...user, role: user.role as "student" | "teacher" }));
  },

  // Validate a token (invite or reset) without consuming it
  async validateToken(request: Request, params: Record<string, string>) {
    const { token } = params;
    const url = new URL(request.url);
    const type = url.searchParams.get("type") as "invite" | "reset" | null;

    const [row] = await db
      .select()
      .from(authTokens)
      .where(and(
        eq(authTokens.token, token),
        type ? eq(authTokens.type, type) : eq(authTokens.type, "invite"),
        isNull(authTokens.usedAt),
        gt(authTokens.expiresAt, new Date()),
      ))
      .limit(1);

    if (!row) return json({ valid: false }, 200);

    const [user] = await db.select({ fullName: users.fullName, email: users.email }).from(users).where(eq(users.id, row.userId)).limit(1);
    return json({ valid: true, fullName: user?.fullName, email: user?.email });
  },
};
