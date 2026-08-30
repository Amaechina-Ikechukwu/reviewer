import { permissionsFor } from "../../utils/permissions";
import { randomBytes, randomUUID } from "node:crypto";
import type { AuthenticatedRequest } from "../../middleware/auth";
import { json, parseJson } from "../../utils/json";
import { isStaff, signToken, type UserRole } from "../../utils/jwt";
import { logger } from "../../utils/logger";
import { hashPassword, verifyPassword } from "../../utils/password";
import { data } from "../data";
import { COLLECTIONS } from "../firebase";
import { sendPasswordReset } from "../../services/email";
import { audit } from "../services/audit";

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function findAuthToken(token: string, type: string) {
  if (!token) {
    logger.warn("findAuthToken: empty token");
    return null;
  }
  try {
    const row = await data.getById<any>(COLLECTIONS.authTokens, token);
    if (row) {
      logger.debug("findAuthToken: doc-id hit", { tokenPrefix: token.slice(0, 8), foundType: row.type, requestedType: type });
      if (row.type === type) return row;
    } else {
      logger.debug("findAuthToken: doc-id miss, trying where-query fallback", { tokenPrefix: token.slice(0, 8), type });
    }
    const rows = await data.findMany<any>(COLLECTIONS.authTokens, {
      where: [["token", "==", token]],
      limit: 10,
    });
    logger.debug("findAuthToken: where-query result", { tokenPrefix: token.slice(0, 8), matchCount: rows.length, types: rows.map((r) => r.type) });
    return rows.find((r) => r.type === type) || null;
  } catch (err) {
    logger.error("findAuthToken: lookup threw", {
      tokenPrefix: token.slice(0, 8),
      type,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    throw err;
  }
}

const VALID_STAFF_ROLES = ["teacher", "owner", "admin", "manager", "instructor", "assistant"] as const;

type RegisterBody = { email?: string; password?: string; fullName?: string; role?: UserRole; inviteToken?: string };
type LoginBody = { email?: string; password?: string };

/** Last self-service reset per email address, for light throttling. */
const resetRequests = new Map<string, number>();

/** Mints a reset token with its OTP and emails the link. */
async function issueReset(target: { id: string; email: string; fullName: string }, opts: { selfService?: boolean } = {}) {
  const token = randomBytes(32).toString("hex");
  await data.insert<any>(COLLECTIONS.authTokens, token, {
    userId: target.id,
    token,
    type: "reset",
    otp: generateOtp(),
    otpUsed: false,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    usedAt: null,
  });

  await sendPasswordReset(target.email, target.fullName, token, opts);
  return token;
}

function userResponse(u: { id: string; email: string; fullName: string; role: UserRole; permissions?: unknown }) {
  const token = signToken({ userId: u.id, email: u.email, fullName: u.fullName, role: u.role });
  // Access ships with the profile so the UI can hide what this person cannot
  // do from the moment they sign in, not just after the next /auth/me refetch.
  return { token, user: { id: u.id, email: u.email, fullName: u.fullName, role: u.role, permissions: permissionsFor(u) } };
}

export const authRoutes = {
  async register(request: Request) {
    const body = await parseJson<RegisterBody>(request);
    const email = body.email?.trim().toLowerCase();
    const password = body.password?.trim();
    const fullName = body.fullName?.trim();
    const role: UserRole = body.role && (VALID_STAFF_ROLES as readonly string[]).includes(body.role)
      ? body.role as UserRole
      : body.role === "student" ? "student" : "student";

    if (!email || !password || !fullName) return json({ error: "Email, password, and full name are required." }, 400);

    const existing = await data.findOne<{ id: string }>(COLLECTIONS.users, [["email", "==", email]]);
    if (existing) return json({ error: "An account with that email already exists." }, 409);

    // If an inviteToken is provided, find the cohort and assign the new user to it
    let cohortId: string | null = null;
    if (body.inviteToken) {
      const cohort = await data.findOne<any>(COLLECTIONS.cohorts, [["inviteToken", "==", body.inviteToken]]);
      if (cohort) cohortId = cohort.id;
    }

    const id = randomUUID();
    const user = await data.insert<{ id: string; email: string; fullName: string; role: UserRole }>(
      COLLECTIONS.users,
      id,
      { email, passwordHash: await hashPassword(password), fullName, role, joinCode: null, teacherId: null, cohortId },
    );

    audit({ actorId: user.id, actorEmail: user.email, action: "auth.register", targetType: "user", targetId: user.id, details: { role, cohortId } });
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
    const userDoc = await data.getById<any>(COLLECTIONS.users, user.userId);
    // Access ships with the profile so the UI can hide what this person cannot
    // do, rather than offering buttons the server will refuse.
    return json({
      user: {
        id: user.userId,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        cohortId: userDoc?.cohortId ?? null,
        permissions: permissionsFor(userDoc ?? { role: user.role }),
      },
    });
  },

  async acceptInvite(request: Request, params: Record<string, string>) {
    const { token } = params;
    const { password } = await parseJson<{ password?: string }>(request);
    if (!password || password.length < 8) return json({ error: "Password must be at least 8 characters." }, 400);

    const row = await findAuthToken(token, "invite");
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

  /**
   * Self-service reset from the login page. Someone locked out cannot use
   * requestReset, which needs a session. The reply never says whether the
   * address exists — that would turn this into an account checker.
   */
  async forgotPassword(request: Request) {
    const body = await parseJson<{ email?: string }>(request);
    const email = body.email?.trim().toLowerCase() || "";
    const reply = json({
      sent: true,
      message: "If that email has an account, a reset link is on its way.",
    });

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: "Please enter a valid email address." }, 400);
    }

    // One live request per address per minute, so the endpoint cannot be used
    // to bombard someone's inbox.
    const last = resetRequests.get(email);
    if (last && Date.now() - last < 60_000) return reply;
    resetRequests.set(email, Date.now());

    const target = await data.findOne<any>(COLLECTIONS.users, [["email", "==", email]]);
    if (!target) {
      logger.info("forgotPassword: no account", { email });
      return reply;
    }
    if (target.passwordHash === "INVITE_PENDING") {
      // Their invite link is the way in; a reset would strand them.
      logger.info("forgotPassword: account still pending setup", { email });
      return reply;
    }

    try {
      await issueReset(target, { selfService: true });
    } catch (err) {
      logger.error("forgotPassword: could not send reset", {
        email,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    audit({ actorId: target.id, actorEmail: email, action: "auth.forgot_password" });
    return reply;
  },

  async requestReset(request: Request) {
    const user = (request as AuthenticatedRequest).user;
    const body = await parseJson<{ email?: string }>(request);
    const email = body.email?.trim().toLowerCase() || user.email;
    if (!email) return json({ error: "Email is required." }, 400);

    const target = await data.findOne<any>(COLLECTIONS.users, [["email", "==", email]]);
    if (!target) return json({ error: "No account found with that email." }, 404);

    try {
      await issueReset(target);
    } catch (err) {
      logger.error("Failed to send reset email", { email, error: err instanceof Error ? err.message : String(err) });
    }

    return json({ sent: true, message: "Check your email for the reset link." });
  },

  async sendOtp(request: Request) {
    const { token } = await parseJson<{ token?: string }>(request);
    if (!token) return json({ error: "Token is required." }, 400);

    const row = await data.findOne<any>(COLLECTIONS.authTokens, [
      ["token", "==", token],
      ["type", "==", "reset"],
    ]);
    if (!row || row.usedAt || (row.expiresAt && new Date(row.expiresAt) < new Date())) {
      return json({ error: "Reset link is invalid or has expired." }, 400);
    }

    const newOtp = generateOtp();
    await data.update(COLLECTIONS.authTokens, row.id, { otp: newOtp, otpUsed: false });

    const user = await data.getById<any>(COLLECTIONS.users, row.userId);
    if (user?.email) {
      const first = (user.fullName || "").split(" ")[0];
      const nodemailer = await import("nodemailer");
      const transport = nodemailer.default.createTransport({
        host: process.env.SMTP_HOST || "smtp.gmail.com",
        port: Number(process.env.SMTP_PORT || 587),
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
      const from = process.env.FROM_EMAIL || process.env.SMTP_USER || "noreply@example.com";
      await transport.sendMail({
        from, to: user.email,
        subject: "Your password reset OTP",
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px 24px;text-align:center;color:#15233b">
            <div style="display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:16px;background:linear-gradient(135deg,#0d56d8,#1a73e8);margin-bottom:20px">
              <span style="color:white;font-size:24px;font-weight:700">!</span>
            </div>
            <h2 style="margin:0 0 8px">Hi ${first},</h2>
            <p style="color:#64748b;margin:0 0 24px;line-height:1.6">Use the OTP below to reset your password. It expires in 15 minutes.</p>
            <div style="background:#f0f4ff;border-radius:12px;padding:20px;margin-bottom:24px;font-size:32px;font-weight:800;letter-spacing:8px;color:#0d56d8">${newOtp}</div>
            <p style="font-size:0.85rem;color:#94a3b8;margin:0">If you didn't request this, you can ignore this email.</p>
          </div>
        `,
      });
    }

    return json({ sent: true });
  },

  async resetWithOtp(request: Request) {
    const { token, otp, password } = await parseJson<{ token?: string; otp?: string; password?: string }>(request);
    if (!token) return json({ error: "Token is required." }, 400);
    if (!otp || otp.length !== 6) return json({ error: "A valid 6-digit OTP is required." }, 400);
    if (!password || password.length < 8) return json({ error: "Password must be at least 8 characters." }, 400);

    const row = await findAuthToken(token, "reset");
    if (!row) return json({ error: "Reset session not found." }, 400);
    if (row.usedAt || (row.expiresAt && new Date(row.expiresAt) < new Date())) {
      return json({ error: "Reset link has expired." }, 400);
    }
    if (row.otpUsed) return json({ error: "OTP has already been used." }, 400);
    if (row.otp !== otp) return json({ error: "Invalid OTP." }, 400);

    const user = await data.getById<any>(COLLECTIONS.users, row.userId);
    if (!user) return json({ error: "Account not found." }, 404);

    await data.update(COLLECTIONS.users, user.id, { passwordHash: await hashPassword(password) });
    await data.update(COLLECTIONS.authTokens, row.id, { usedAt: new Date(), otpUsed: true });

    return json({ success: true, message: "Password updated successfully." });
  },

  async resetPassword(request: Request, params: Record<string, string>) {
    const { token } = params;
    const { password } = await parseJson<{ password?: string }>(request);
    if (!password || password.length < 8) return json({ error: "Password must be at least 8 characters." }, 400);

    const row = await findAuthToken(token, "reset");
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

    const row = await findAuthToken(token, type);
    if (!row) {
      logger.info("validateToken: token not found", { tokenPrefix: token?.slice(0, 8), type });
      return json({ valid: false }, 200);
    }
    if (row.usedAt) {
      logger.info("validateToken: token already used", { tokenPrefix: token?.slice(0, 8), usedAt: row.usedAt });
      return json({ valid: false }, 200);
    }
    if (row.expiresAt && new Date(row.expiresAt) < new Date()) {
      logger.info("validateToken: token expired", { tokenPrefix: token?.slice(0, 8), expiresAt: row.expiresAt });
      return json({ valid: false }, 200);
    }
    logger.info("validateToken: token valid", { tokenPrefix: token?.slice(0, 8), type, userId: row.userId });

    const user = await data.getById<any>(COLLECTIONS.users, row.userId);
    return json({ valid: true, fullName: user?.fullName, email: user?.email });
  },
};
