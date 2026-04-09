import nodemailer from "nodemailer";

const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST || process.env.EMAIL_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT || process.env.EMAIL_PORT || 587),
  auth: {
    user: process.env.SMTP_USER || process.env.EMAIL_USER,
    pass: process.env.SMTP_PASS || process.env.EMAIL_PASS,
  },
});

const FROM = process.env.FROM_EMAIL || process.env.SMTP_USER || "noreply@example.com";
const APP_URL = (process.env.APP_URL || "").replace(/\/$/, "");

if (!APP_URL) {
  console.warn("WARNING: APP_URL is not set — email links will be broken.");
}

function send(to: string, subject: string, html: string) {
  return transport.sendMail({ from: FROM, to, subject, html });
}

export async function sendInvite(email: string, fullName: string, token: string) {
  const link = `${APP_URL}/setup/${token}`;
  const first = fullName.split(" ")[0];
  await send(email, "You've been added to Reviewer", `
    <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:32px 24px;color:#15233b">
      <h2 style="margin:0 0 8px">Hi ${first},</h2>
      <p style="margin:0 0 24px;color:#64748b">Your teacher has added you to <strong>Reviewer</strong>. Set up your account to see your assignments and submissions.</p>
      <a href="${link}" style="display:inline-block;background:#0d56d8;color:#fff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:700">Set up my account</a>
      <p style="margin:24px 0 0;font-size:0.85rem;color:#94a3b8">Link expires in 48 hours. If you weren't expecting this, ignore it.</p>
    </div>
  `);
}

export async function sendPasswordReset(email: string, fullName: string, token: string) {
  const link = `${APP_URL}/reset/${token}`;
  const first = fullName.split(" ")[0];
  await send(email, "Reset your Reviewer password", `
    <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:32px 24px;color:#15233b">
      <h2 style="margin:0 0 8px">Password reset</h2>
      <p style="margin:0 0 24px;color:#64748b">Hi ${first}, your teacher requested a password reset for your account.</p>
      <a href="${link}" style="display:inline-block;background:#0d56d8;color:#fff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:700">Set new password</a>
      <p style="margin:24px 0 0;font-size:0.85rem;color:#94a3b8">Link expires in 2 hours. If this wasn't expected, contact your teacher.</p>
    </div>
  `);
}

export async function sendAssignmentNotification(
  students: Array<{ email: string; fullName: string }>,
  assignment: { title: string; closesAt: Date; id: string },
) {
  const deadline = assignment.closesAt.toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" });
  const link = `${APP_URL}/student/submit/${assignment.id}`;
  await Promise.allSettled(students.map(({ email, fullName }) =>
    send(email, `New assignment: ${assignment.title}`, `
      <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:32px 24px;color:#15233b">
        <h2 style="margin:0 0 8px">${assignment.title}</h2>
        <p style="margin:0 0 4px;color:#64748b">A new assignment is now available.</p>
        <p style="margin:0 0 24px;color:#64748b">Due: <strong>${deadline}</strong></p>
        <a href="${link}" style="display:inline-block;background:#0d56d8;color:#fff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:700">Open assignment</a>
        <p style="margin:24px 0 0;font-size:0.85rem;color:#94a3b8">You'll receive a reminder before the deadline. — ${fullName.split(" ")[0]}, log in to Reviewer to submit.</p>
      </div>
    `),
  ));
}

export async function sendGradeRelease(
  student: { email: string; fullName: string },
  assignment: { title: string; id: string },
  grade: { score: number; maxScore: number; feedback?: string | null; suggestions?: string[] },
) {
  const first = student.fullName.split(" ")[0];
  const link = `${APP_URL}/student/results`;
  const percent = Math.round((grade.score / grade.maxScore) * 100);

  const suggestionsHtml = grade.suggestions && grade.suggestions.length > 0
    ? `<ul style="margin:12px 0 0;padding-left:20px;color:#334155;line-height:1.7">${grade.suggestions.map((s) => `<li>${s}</li>`).join("")}</ul>`
    : "";

  await send(student.email, `Your grade for "${assignment.title}"`, `
    <div style="font-family:sans-serif;max-width:560px;margin:auto;padding:32px 24px;color:#15233b">
      <h2 style="margin:0 0 4px">Hi ${first},</h2>
      <p style="margin:0 0 24px;color:#64748b">Your assignment <strong>${assignment.title}</strong> has been graded.</p>

      <div style="background:#f0f4ff;border-radius:12px;padding:20px 24px;margin-bottom:20px;text-align:center">
        <div style="font-size:2.4rem;font-weight:800;color:#0d56d8">${grade.score}/${grade.maxScore}</div>
        <div style="color:#64748b;font-size:0.9rem">${percent}%</div>
      </div>

      ${grade.feedback ? `<p style="margin:0 0 8px;color:#334155;line-height:1.7"><strong>Feedback:</strong> ${grade.feedback}</p>` : ""}
      ${suggestionsHtml}

      <br/>
      <a href="${link}" style="display:inline-block;background:#0d56d8;color:#fff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:700">View on Reviewer</a>
    </div>
  `);
}

export async function sendSubmissionNotification(
  teacher: { email: string; fullName: string },
  student: { fullName: string },
  assignment: { title: string; id: string },
  submissionId: string,
) {
  const link = `${APP_URL}/teacher/review/${submissionId}`;
  await send(teacher.email, `New submission: ${assignment.title}`, `
    <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:32px 24px;color:#15233b">
      <h2 style="margin:0 0 8px">New submission received</h2>
      <p style="margin:0 0 4px;color:#64748b"><strong>${student.fullName}</strong> just submitted <strong>${assignment.title}</strong>.</p>
      <br/>
      <a href="${link}" style="display:inline-block;background:#0d56d8;color:#fff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:700">Review submission</a>
    </div>
  `);
}

export async function sendDeadlineReminder(
  students: Array<{ email: string; fullName: string }>,
  assignment: { title: string; closesAt: Date; id: string },
  hoursLeft: number,
) {
  const deadline = assignment.closesAt.toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" });
  const link = `${APP_URL}/student/submit/${assignment.id}`;
  const label = hoursLeft <= 1 ? "less than 1 hour" : `${hoursLeft} hours`;
  await Promise.allSettled(students.map(({ email, fullName }) =>
    send(email, `Reminder: "${assignment.title}" closes in ${label}`, `
      <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:32px 24px;color:#15233b">
        <h2 style="margin:0 0 8px">Deadline reminder</h2>
        <p style="margin:0 0 4px;color:#64748b">Hi ${fullName.split(" ")[0]},</p>
        <p style="margin:0 0 24px;color:#64748b"><strong>${assignment.title}</strong> closes in <strong>${label}</strong> (${deadline}).</p>
        <a href="${link}" style="display:inline-block;background:#0d56d8;color:#fff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:700">Submit now</a>
      </div>
    `),
  ));
}
