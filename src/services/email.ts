import nodemailer from "nodemailer";
import { logger } from "../utils/logger";

const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST || process.env.EMAIL_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT || process.env.EMAIL_PORT || 587),
  auth: {
    user: process.env.SMTP_USER || process.env.EMAIL_USER,
    pass: process.env.SMTP_PASS || process.env.EMAIL_PASS,
  },
  pool: true,
  maxConnections: Number(process.env.SMTP_MAX_CONNECTIONS || 5),
  maxMessages: 100,
  rateDelta: 1000,
  rateLimit: Number(process.env.SMTP_RATE_LIMIT || 10),
});

const FROM = process.env.FROM_EMAIL || process.env.SMTP_USER || "noreply@example.com";
const APP_URL = (process.env.APP_URL || "").replace(/\/$/, "");
const BULK_CONCURRENCY = Number(process.env.EMAIL_BULK_CONCURRENCY || 5);
const RETRY_ATTEMPTS = Number(process.env.EMAIL_RETRY_ATTEMPTS || 3);

if (!APP_URL) {
  logger.warn("APP_URL is not set — email links will be broken.");
}

export function escapeHtml(input: unknown): string {
  if (input === null || input === undefined) return "";
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isValidEmail(email: string): boolean {
  return typeof email === "string" && EMAIL_RE.test(email);
}

function classifyError(err: unknown): { retryable: boolean; code: string } {
  const code = (err && typeof err === "object" && "code" in err) ? String((err as any).code) : "UNKNOWN";
  const responseCode = (err && typeof err === "object" && "responseCode" in err) ? Number((err as any).responseCode) : 0;
  // Permanent failures: 5xx SMTP, invalid mailbox, auth.
  if (responseCode >= 500 && responseCode < 600) return { retryable: false, code };
  if (code === "EAUTH" || code === "EENVELOPE") return { retryable: false, code };
  // Transient: timeouts, connection drops, 4xx throttling.
  return { retryable: true, code };
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Send a single email with retry + classification.
 * Resolves with `{ ok: true }` on success. Throws a typed error on permanent
 * failure or after exhausting retries on transient ones — caller decides what
 * to do (queue worker records dead-letter, sync caller surfaces to user).
 */
export async function sendOne(to: string, subject: string, html: string): Promise<{ messageId?: string }> {
  if (!isValidEmail(to)) {
    const err = new Error(`Invalid email address: ${to}`);
    (err as any).code = "EENVELOPE";
    throw err;
  }
  let lastErr: unknown;
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      const info = await transport.sendMail({ from: FROM, to, subject, html });
      logger.debug("sendOne: success", { to, subject, attempt, messageId: info.messageId });
      return { messageId: info.messageId };
    } catch (err) {
      lastErr = err;
      const { retryable, code } = classifyError(err);
      const message = err instanceof Error ? err.message : String(err);
      if (!retryable || attempt === RETRY_ATTEMPTS) {
        logger.error("sendOne: failed", { to, subject, attempt, code, retryable, error: message });
        throw err;
      }
      const backoffMs = Math.min(8000, 500 * 2 ** (attempt - 1));
      logger.warn("sendOne: transient failure, retrying", { to, subject, attempt, code, backoffMs, error: message });
      await sleep(backoffMs);
    }
  }
  throw lastErr;
}

export type BulkResult = {
  total: number;
  sent: number;
  failed: number;
  failures: Array<{ email: string; error: string; code: string }>;
};

/**
 * Send the same email body (rendered per-recipient) to many addresses with
 * bounded concurrency. Caller provides a `render(recipient)` function so each
 * email can be personalized. Returns a full report — no exceptions thrown.
 */
export async function sendBulk<R extends { email: string; fullName: string }>(
  recipients: R[],
  subject: string | ((r: R) => string),
  render: (r: R) => string,
  opts: { concurrency?: number; label?: string } = {},
): Promise<BulkResult> {
  const concurrency = opts.concurrency ?? BULK_CONCURRENCY;
  const label = opts.label ?? "bulk";
  const result: BulkResult = { total: recipients.length, sent: 0, failed: 0, failures: [] };

  logger.info("sendBulk: starting", { label, total: recipients.length, concurrency });

  let cursor = 0;
  async function worker() {
    while (true) {
      const idx = cursor++;
      if (idx >= recipients.length) return;
      const r = recipients[idx];
      const subj = typeof subject === "function" ? subject(r) : subject;
      try {
        await sendOne(r.email, subj, render(r));
        result.sent++;
      } catch (err) {
        result.failed++;
        const { code } = classifyError(err);
        const message = err instanceof Error ? err.message : String(err);
        result.failures.push({ email: r.email, error: message, code });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, recipients.length) }, () => worker()));

  logger.info("sendBulk: complete", { label, sent: result.sent, failed: result.failed, total: result.total });
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Template helpers
// ─────────────────────────────────────────────────────────────────────────────

const HEADER_SVG = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`;

function shellOpen(): string {
  return `<div style="font-family:sans-serif;max-width:520px;margin:auto;padding:32px 24px;color:#15233b">`;
}
function shellClose(): string {
  return `</div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1:1 transactional sends — used directly by callers, not via bulk
// ─────────────────────────────────────────────────────────────────────────────

export async function sendInvite(email: string, fullName: string, token: string, role?: string) {
  const link = `${APP_URL}/setup/${encodeURIComponent(token)}`;
  const first = escapeHtml(fullName.split(" ")[0]);
  const isStaffInvite = role && role !== "student";

  const greeting = isStaffInvite
    ? `You've been added to the <strong>Reviewer</strong> staff team.`
    : `Your teacher has added you to <strong>Reviewer</strong>. Set up your account to see your assignments and submissions.`;

  await sendOne(email, isStaffInvite ? "You're now on the Reviewer staff team" : "You've been added to Reviewer", `
    ${shellOpen()}
      <div style="text-align:center;margin-bottom:24px">
        <div style="display:inline-flex;align-items:center;justify-content:center;width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg,#0d56d8,#1a73e8)">${HEADER_SVG}</div>
      </div>
      <h2 style="margin:0 0 8px;text-align:center">Hi ${first},</h2>
      <p style="margin:0 0 24px;color:#64748b;text-align:center;line-height:1.6">${greeting}</p>
      <div style="text-align:center;margin-bottom:24px">
        <a href="${link}" style="display:inline-block;background:#0d56d8;color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px">Set up my account</a>
      </div>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 16px"/>
      <p style="margin:0;font-size:0.8rem;color:#94a3b8;text-align:center">This link expires in 48 hours. If you weren't expecting this, you can safely ignore it.</p>
    ${shellClose()}
  `);
}

export async function sendPasswordReset(email: string, fullName: string, token: string) {
  const link = `${APP_URL}/reset/${encodeURIComponent(token)}`;
  const first = escapeHtml(fullName.split(" ")[0]);
  await sendOne(email, "Reset your Reviewer password", `
    ${shellOpen()}
      <h2 style="margin:0 0 8px">Password reset</h2>
      <p style="margin:0 0 24px;color:#64748b">Hi ${first}, your teacher requested a password reset for your account.</p>
      <a href="${link}" style="display:inline-block;background:#0d56d8;color:#fff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:700">Set new password</a>
      <p style="margin:24px 0 0;font-size:0.85rem;color:#94a3b8">Link expires in 2 hours. If this wasn't expected, contact your teacher.</p>
    ${shellClose()}
  `);
}

export async function sendSubmissionNotification(
  teacher: { email: string; fullName: string },
  student: { fullName: string },
  assignment: { title: string; id: string },
  submissionId: string,
) {
  const link = `${APP_URL}/teacher/review/${encodeURIComponent(submissionId)}`;
  await sendOne(teacher.email, `New submission: ${assignment.title}`, `
    ${shellOpen()}
      <h2 style="margin:0 0 8px">New submission received</h2>
      <p style="margin:0 0 4px;color:#64748b"><strong>${escapeHtml(student.fullName)}</strong> just submitted <strong>${escapeHtml(assignment.title)}</strong>.</p>
      <br/>
      <a href="${link}" style="display:inline-block;background:#0d56d8;color:#fff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:700">Review submission</a>
    ${shellClose()}
  `);
}

export async function sendGradeRelease(
  student: { email: string; fullName: string },
  assignment: { title: string; id: string },
  grade: { score: number; maxScore: number; feedback?: string | null; suggestions?: string[] },
) {
  const first = escapeHtml(student.fullName.split(" ")[0]);
  const link = `${APP_URL}/student/results`;
  const percent = Math.round((grade.score / grade.maxScore) * 100);

  const suggestionsHtml = grade.suggestions && grade.suggestions.length > 0
    ? `<ul style="margin:12px 0 0;padding-left:20px;color:#334155;line-height:1.7">${grade.suggestions.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>`
    : "";

  await sendOne(student.email, `Your grade for "${assignment.title}"`, `
    <div style="font-family:sans-serif;max-width:560px;margin:auto;padding:32px 24px;color:#15233b">
      <h2 style="margin:0 0 4px">Hi ${first},</h2>
      <p style="margin:0 0 24px;color:#64748b">Your assignment <strong>${escapeHtml(assignment.title)}</strong> has been graded.</p>
      <div style="background:#f0f4ff;border-radius:12px;padding:20px 24px;margin-bottom:20px;text-align:center">
        <div style="font-size:2.4rem;font-weight:800;color:#0d56d8">${grade.score}/${grade.maxScore}</div>
        <div style="color:#64748b;font-size:0.9rem">${percent}%</div>
      </div>
      ${grade.feedback ? `<p style="margin:0 0 8px;color:#334155;line-height:1.7"><strong>Feedback:</strong> ${escapeHtml(grade.feedback)}</p>` : ""}
      ${suggestionsHtml}
      <br/>
      <a href="${link}" style="display:inline-block;background:#0d56d8;color:#fff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:700">View on Reviewer</a>
    </div>
  `);
}

// ─────────────────────────────────────────────────────────────────────────────
// Bulk-send renderers — these return BulkResult and never throw.
// Routes/queue worker call these. The renderer functions escape user input.
// ─────────────────────────────────────────────────────────────────────────────

export async function sendAssignmentNotification(
  students: Array<{ email: string; fullName: string }>,
  assignment: { title: string; closesAt: Date; id: string },
): Promise<BulkResult> {
  const deadline = assignment.closesAt.toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" });
  const link = `${APP_URL}/student/submit/${encodeURIComponent(assignment.id)}`;
  const title = escapeHtml(assignment.title);
  const subject = `New assignment: ${assignment.title}`;

  return sendBulk(students, subject, ({ fullName }) => `
    ${shellOpen()}
      <h2 style="margin:0 0 8px">${title}</h2>
      <p style="margin:0 0 4px;color:#64748b">A new assignment is now available.</p>
      <p style="margin:0 0 24px;color:#64748b">Due: <strong>${escapeHtml(deadline)}</strong></p>
      <a href="${link}" style="display:inline-block;background:#0d56d8;color:#fff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:700">Open assignment</a>
      <p style="margin:24px 0 0;font-size:0.85rem;color:#94a3b8">You'll receive a reminder before the deadline. — ${escapeHtml(fullName.split(" ")[0])}, log in to Reviewer to submit.</p>
    ${shellClose()}
  `, { label: `assignment:${assignment.id}` });
}

export async function sendGroupAssignmentNotification(
  members: Array<{ email: string; fullName: string }>,
  assignment: { title: string; id: string },
  groupName: string,
  teammates: string[],
): Promise<BulkResult> {
  const link = `${APP_URL}/student/submit/${encodeURIComponent(assignment.id)}`;
  const teammateLine = teammates.length > 0
    ? `<p style="margin:0 0 16px;color:#64748b">Teammates: <strong>${escapeHtml(teammates.join(", "))}</strong></p>`
    : "";
  const title = escapeHtml(assignment.title);
  const group = escapeHtml(groupName);

  return sendBulk(members, `You've been assigned to ${groupName} for "${assignment.title}"`, ({ fullName }) => `
    ${shellOpen()}
      <h2 style="margin:0 0 8px">Hi ${escapeHtml(fullName.split(" ")[0])},</h2>
      <p style="margin:0 0 4px;color:#64748b">You've been assigned to <strong>${group}</strong> for the group project <strong>${title}</strong>.</p>
      ${teammateLine}
      <a href="${link}" style="display:inline-block;background:#0d56d8;color:#fff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:700">Open assignment</a>
    ${shellClose()}
  `, { label: `group:${assignment.id}` });
}

export async function sendFormNotification(
  recipients: Array<{ email: string; fullName: string }>,
  form: { id: string; title: string; description?: string; publishedLink?: string | null; closesAt?: Date | string | null },
): Promise<BulkResult> {
  const link = form.publishedLink || `${APP_URL}/student/forms/${encodeURIComponent(form.id)}`;
  const deadline = form.closesAt
    ? new Date(form.closesAt).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" })
    : null;
  const title = escapeHtml(form.title);

  return sendBulk(recipients, `New form: ${form.title}`, ({ fullName }) => `
    ${shellOpen()}
      <h2 style="margin:0 0 8px">Hi ${escapeHtml(fullName.split(" ")[0])},</h2>
      <p style="margin:0 0 4px;color:#64748b">A new form is available: <strong>${title}</strong>.</p>
      ${form.description ? `<p style="margin:0 0 16px;color:#64748b">${escapeHtml(form.description)}</p>` : ""}
      ${deadline ? `<p style="margin:0 0 16px;color:#64748b">Closes: <strong>${escapeHtml(deadline)}</strong></p>` : ""}
      <a href="${link}" style="display:inline-block;background:#0d56d8;color:#fff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:700">Open form</a>
    ${shellClose()}
  `, { label: `form:${form.id}` });
}

export async function sendCustomNotification(
  recipients: Array<{ email: string; fullName: string }>,
  subject: string,
  message: string,
): Promise<BulkResult> {
  // Treat the message body as plaintext — escape, then convert newlines.
  const safeMessage = escapeHtml(message).replace(/\n/g, "<br>");
  const subjectClean = subject.replace(/[\r\n]/g, " ").slice(0, 200);

  return sendBulk(recipients, subjectClean, ({ fullName }) => `
    <div style="font-family:system-ui,sans-serif;max-width:600px;margin:auto;background:#fff;border-radius:12px;padding:40px 32px;border:1px solid #e2e8f0">
      <p style="margin:0 0 20px;font-size:16px;font-weight:500;color:#0f172a">Hi ${escapeHtml(fullName)},</p>
      <div style="font-size:15px;color:#334155;line-height:1.75">${safeMessage}</div>
    </div>
  `, { label: "custom" });
}

export async function sendChangelogNotification(
  recipients: Array<{ email: string; fullName: string }>,
  entry: { version: string; title: string; heading?: string; summary: string; items: Array<{ heading: string }> },
): Promise<BulkResult> {
  const link = `${APP_URL}/changelog`;
  const heading = escapeHtml(entry.heading?.trim() || "New Update");
  const itemsHtml = entry.items.slice(0, 5).map((item) =>
    `<tr><td style="padding:4px 0;color:#334155;font-size:14px">• ${escapeHtml(item.heading)}</td></tr>`
  ).join("");
  const version = escapeHtml(entry.version);
  const title = escapeHtml(entry.title);
  const summary = escapeHtml(entry.summary);
  const subject = `${entry.heading?.trim() || "New Update"}: ${entry.version} — ${entry.title}`.slice(0, 200);

  return sendBulk(recipients, subject, () => `
    <div style="font-family:system-ui,sans-serif;max-width:560px;margin:auto;background:#fff;border-radius:12px;padding:40px 32px;border:1px solid #e2e8f0">
      <div style="text-align:center;margin-bottom:24px">
        <div style="display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:16px;background:linear-gradient(135deg,#0d56d8,#1a73e8)">${HEADER_SVG}</div>
      </div>
      <div style="text-align:center;font-size:13px;font-weight:600;color:#0d56d8;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">${heading}</div>
      <h2 style="margin:0 0 4px;text-align:center;font-size:20px;color:#0f172a">${version}: ${title}</h2>
      <p style="margin:0 0 20px;text-align:center;color:#64748b;font-size:14px;line-height:1.6">${summary}</p>
      <table style="width:100%;margin-bottom:24px">${itemsHtml}</table>
      <div style="text-align:center">
        <a href="${link}" style="display:inline-block;background:#0d56d8;color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px">View full changelog</a>
      </div>
    </div>
  `, { label: `changelog:${entry.version}` });
}

export async function sendDeadlineReminder(
  students: Array<{ email: string; fullName: string }>,
  assignment: { title: string; closesAt: Date; id: string },
  hoursLeft: number,
): Promise<BulkResult> {
  const deadline = assignment.closesAt.toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" });
  const link = `${APP_URL}/student/submit/${encodeURIComponent(assignment.id)}`;
  const label = hoursLeft <= 1 ? "less than 1 hour" : `${hoursLeft} hours`;
  const title = escapeHtml(assignment.title);

  return sendBulk(students, `Reminder: "${assignment.title}" closes in ${label}`, ({ fullName }) => `
    ${shellOpen()}
      <h2 style="margin:0 0 8px">Deadline reminder</h2>
      <p style="margin:0 0 4px;color:#64748b">Hi ${escapeHtml(fullName.split(" ")[0])},</p>
      <p style="margin:0 0 24px;color:#64748b"><strong>${title}</strong> closes in <strong>${escapeHtml(label)}</strong> (${escapeHtml(deadline)}).</p>
      <a href="${link}" style="display:inline-block;background:#0d56d8;color:#fff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:700">Submit now</a>
    ${shellClose()}
  `, { label: `reminder:${assignment.id}:${hoursLeft}h` });
}
