import { and, eq, gt, isNull, lt, ne } from "drizzle-orm";
import { db } from "../db/connection";
import { assignments, submissions, users } from "../db/schema";
import { sendDeadlineReminder } from "../services/email";

const REMINDER_HOURS = [24, 1];

async function checkReminders() {
  const now = new Date();

  for (const hours of REMINDER_HOURS) {
    const windowStart = new Date(now.getTime() + (hours - 0.5) * 60 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + (hours + 0.5) * 60 * 60 * 1000);

    const upcoming = await db
      .select()
      .from(assignments)
      .where(and(gt(assignments.closesAt, windowStart), lt(assignments.closesAt, windowEnd)));

    for (const assignment of upcoming) {
      const alreadySubmitted = await db
        .select({ studentId: submissions.studentId })
        .from(submissions)
        .where(eq(submissions.assignmentId, assignment.id));

      const submittedIds = new Set(alreadySubmitted.map((r) => r.studentId));

      const allStudents = await db
        .select({ email: users.email, fullName: users.fullName })
        .from(users)
        .where(
          and(
            eq(users.role, "student"),
            ne(users.passwordHash, "INVITE_PENDING"),
          ),
        );

      const pending = allStudents.filter(
        (s) => !submittedIds.has(s.email) && !s.email.endsWith("@historical.reviewai.local"),
      );

      if (pending.length > 0) {
        await sendDeadlineReminder(pending, { ...assignment, closesAt: new Date(assignment.closesAt) }, hours);
      }
    }
  }
}

export function startReminderJob() {
  setInterval(checkReminders, 30 * 60 * 1000);
  checkReminders().catch(console.error);
}
