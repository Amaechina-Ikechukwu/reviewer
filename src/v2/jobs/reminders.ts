import { data } from "../data";
import { COLLECTIONS } from "../firebase";
import { enqueueEmailJob } from "../services/emailJobs";
import { logger } from "../../utils/logger";

const REMINDER_HOURS = [24, 1];

async function checkReminders() {
  const now = new Date();

  for (const hours of REMINDER_HOURS) {
    const windowStart = new Date(now.getTime() + (hours - 0.5) * 60 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + (hours + 0.5) * 60 * 60 * 1000);

    const upcoming = await data.findMany<any>(COLLECTIONS.assignments, {
      where: [
        ["closesAt", ">", windowStart],
        ["closesAt", "<", windowEnd],
      ],
    });

    if (upcoming.length === 0) continue;

    const allStudents = await data.findMany<any>(COLLECTIONS.users, {
      where: [["role", "==", "student"]],
    });
    const studentsByCohort = new Map<string | null, any[]>();
    for (const s of allStudents) {
      if (s.passwordHash === "INVITE_PENDING" || String(s.email).endsWith("@historical.reviewai.local")) continue;
      const key = s.cohortId ?? null;
      if (!studentsByCohort.has(key)) studentsByCohort.set(key, []);
      studentsByCohort.get(key)!.push(s);
    }

    for (const assignment of upcoming) {
      const subs = await data.findMany<any>(COLLECTIONS.submissions, {
        where: [["assignmentId", "==", assignment.id]],
      });
      const submittedStudentIds = new Set(subs.map((s) => s.studentId));

      // If the assignment has a cohort, only remind students in that cohort
      const eligible = assignment.cohortId
        ? (studentsByCohort.get(assignment.cohortId) || [])
        : [];

      const pending = eligible
        .filter((s) => !submittedStudentIds.has(s.id))
        .map((s) => ({ email: s.email, fullName: s.fullName }));

      if (pending.length > 0) {
        await enqueueEmailJob({
          kind: "deadline_reminder",
          recipients: pending,
          payload: {
            assignment: { ...assignment, closesAt: new Date(assignment.closesAt).toISOString() },
            hoursLeft: hours,
          },
          idempotencyKey: `reminder:${assignment.id}:${hours}h`,
        });
      }
    }
  }
}

export function startReminderJobV2() {
  setInterval(() => {
    checkReminders().catch((err) => logger.error("reminders: tick failed", { error: err instanceof Error ? err.message : String(err) }));
  }, 30 * 60 * 1000);
  checkReminders().catch((err) => logger.error("reminders: initial tick failed", { error: err instanceof Error ? err.message : String(err) }));
}
