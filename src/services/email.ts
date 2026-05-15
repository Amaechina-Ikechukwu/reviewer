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

export async function sendInvite(email: string, fullName: string, token: string, role?: string) {
  const link = `${APP_URL}/setup/${token}`;
  const first = fullName.split(" ")[0];
  const isStaffInvite = role && role !== "student";

  const greeting = isStaffInvite
    ? `You've been added to the <strong>Reviewer</strong> staff team.`
    : `Your teacher has added you to <strong>Reviewer</strong>. Set up your account to see your assignments and submissions.`;

  await send(email, isStaffInvite
    ? "You're now on the Reviewer staff team"
    : "You've been added to Reviewer", `
    <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:32px 24px;color:#15233b">
      <div style="text-align:center;margin-bottom:24px">
        <div style="display:inline-flex;align-items:center;justify-content:center;width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg,#0d56d8,#1a73e8)">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
        </div>
      </div>
      <h2 style="margin:0 0 8px;text-align:center">Hi ${first},</h2>
      <p style="margin:0 0 24px;color:#64748b;text-align:center;line-height:1.6">${greeting}</p>
      <div style="text-align:center;margin-bottom:24px">
        <a href="${link}" style="display:inline-block;background:#0d56d8;color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px">Set up my account</a>
      </div>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 16px"/>
      <p style="margin:0;font-size:0.8rem;color:#94a3b8;text-align:center">This link expires in 48 hours. If you weren't expecting this, you can safely ignore it.</p>
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

export async function sendGroupAssignmentNotification(
  members: Array<{ email: string; fullName: string }>,
  assignment: { title: string; id: string },
  groupName: string,
  teammates: string[],
) {
  const link = `${APP_URL}/student/submit/${assignment.id}`;
  const teammateLine = teammates.length > 0
    ? `<p style="margin:0 0 16px;color:#64748b">Teammates: <strong>${teammates.join(", ")}</strong></p>`
    : "";
  await Promise.allSettled(members.map(({ email, fullName }) =>
    send(email, `You've been assigned to ${groupName} for "${assignment.title}"`, `
      <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:32px 24px;color:#15233b">
        <h2 style="margin:0 0 8px">Hi ${fullName.split(" ")[0]},</h2>
        <p style="margin:0 0 4px;color:#64748b">You've been assigned to <strong>${groupName}</strong> for the group project <strong>${assignment.title}</strong>.</p>
        ${teammateLine}
        <a href="${link}" style="display:inline-block;background:#0d56d8;color:#fff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:700">Open assignment</a>
      </div>
    `),
  ));
}

export async function sendFormNotification(
  recipients: Array<{ email: string; fullName: string }>,
  form: { id: string; title: string; description?: string; publishedLink?: string | null; closesAt?: Date | string | null },
) {
  const link = form.publishedLink || `${APP_URL}/student/forms/${form.id}`;
  const deadline = form.closesAt
    ? new Date(form.closesAt).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" })
    : null;
  await Promise.allSettled(recipients.map(({ email, fullName }) =>
    send(email, `New form: ${form.title}`, `
      <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:32px 24px;color:#15233b">
        <h2 style="margin:0 0 8px">Hi ${fullName.split(" ")[0]},</h2>
        <p style="margin:0 0 4px;color:#64748b">A new form is available: <strong>${form.title}</strong>.</p>
        ${form.description ? `<p style="margin:0 0 16px;color:#64748b">${form.description}</p>` : ""}
        ${deadline ? `<p style="margin:0 0 16px;color:#64748b">Closes: <strong>${deadline}</strong></p>` : ""}
        <a href="${link}" style="display:inline-block;background:#0d56d8;color:#fff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:700">Open form</a>
      </div>
    `),
  ));
}

export async function sendCustomNotification(
  recipients: Array<{ email: string; fullName: string }>,
  subject: string,
  message: string,
): Promise<{ sent: number; failed: number }> {
  const escaped = message
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
  const results = await Promise.allSettled(
    recipients.map(({ email, fullName }) =>
      send(email, subject, `
        <div style="font-family:system-ui,sans-serif;max-width:600px;margin:auto;background:#fff;border-radius:12px;padding:40px 32px;border:1px solid #e2e8f0">
          <p style="margin:0 0 20px;font-size:16px;font-weight:500;color:#0f172a">Hi ${fullName},</p>
          <div style="font-size:15px;color:#334155;line-height:1.75">${escaped}</div>
        </div>
      `),
    ),
  );
  return {
    sent: results.filter((r) => r.status === "fulfilled").length,
    failed: results.filter((r) => r.status === "rejected").length,
  };
}

export async function sendChangelogNotification(
  recipients: Array<{ email: string; fullName: string }>,
  entry: { version: string; title: string; heading?: string; summary: string; items: Array<{ heading: string }> },
): Promise<{ sent: number; failed: number }> {
  const link = `${APP_URL}/changelog`;
  const heading = entry.heading?.trim() || "New Update";
  const itemsHtml = entry.items.slice(0, 5).map((item) =>
    `<tr><td style="padding:4px 0;color:#334155;font-size:14px">• ${item.heading}</td></tr>`
  ).join("");
  const results = await Promise.allSettled(recipients.map(({ email, fullName }) =>
    send(email, `${heading}: ${entry.version} — ${entry.title}`, `
      <div style="font-family:system-ui,sans-serif;max-width:560px;margin:auto;background:#fff;border-radius:12px;padding:40px 32px;border:1px solid #e2e8f0">
        <div style="text-align:center;margin-bottom:24px">
          <div style="display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:16px;background:linear-gradient(135deg,#0d56d8,#1a73e8)">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
          </div>
        </div>
        <div style="text-align:center;font-size:13px;font-weight:600;color:#0d56d8;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">${heading}</div>
        <h2 style="margin:0 0 4px;text-align:center;font-size:20px;color:#0f172a">${entry.version}: ${entry.title}</h2>
        <p style="margin:0 0 20px;text-align:center;color:#64748b;font-size:14px;line-height:1.6">${entry.summary}</p>
        <table style="width:100%;margin-bottom:24px">${itemsHtml}</table>
        <div style="text-align:center">
          <a href="${link}" style="display:inline-block;background:#0d56d8;color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px">View full changelog</a>
        </div>
      </div>
    `),
  ));
  return {
    sent: results.filter((r) => r.status === "fulfilled").length,
    failed: results.filter((r) => r.status === "rejected").length,
  };
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
