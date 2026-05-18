import type { AuthenticatedRequest } from "../../middleware/auth";
import { json, parseJson } from "../../utils/json";
import { data } from "../data";
import { COLLECTIONS } from "../firebase";
import { enqueueEmailJob } from "../services/emailJobs";

const MANAGER_ROLES = new Set(["owner", "admin", "manager"]);
const STAFF_ROLES = new Set(["teacher", "owner", "admin", "manager", "instructor"]);
const TEACHER_ALLOWED_TARGETS = new Set<Target>(["students", "cohort", "individual"]);

type Target = "all" | "students" | "staff" | "cohort" | "individual";

type NotificationBody = {
  subject?: string;
  message?: string;
  target?: Target;
  cohortId?: string;
  recipientIds?: string[];
};

const VALID_TARGETS = new Set<Target>(["all", "students", "staff", "cohort", "individual"]);

export const notificationRoutes = {
  async send(request: Request) {
    const user = (request as AuthenticatedRequest).user;
    if (!STAFF_ROLES.has(user.role)) {
      return json({ error: "Only staff can send notifications." }, 403);
    }
    const isManager = MANAGER_ROLES.has(user.role);

    const body = await parseJson<NotificationBody>(request);
    if (!body.subject?.trim()) return json({ error: "Subject is required." }, 400);
    if (!body.message?.trim()) return json({ error: "Message is required." }, 400);
    if (!body.target || !VALID_TARGETS.has(body.target)) {
      return json({ error: "Invalid target audience." }, 400);
    }
    if (!isManager && !TEACHER_ALLOWED_TARGETS.has(body.target)) {
      return json({ error: "Teachers can only email their own students." }, 403);
    }

    let users: any[] = [];

    if (body.target === "all") {
      users = await data.findMany<any>(COLLECTIONS.users, {});
    } else if (body.target === "students") {
      if (isManager) {
        users = await data.findMany<any>(COLLECTIONS.users, { where: [["role", "==", "student"]] });
      } else {
        // Teachers/instructors can only email their own students.
        users = await data.findMany<any>(COLLECTIONS.users, {
          where: [["role", "==", "student"], ["teacherId", "==", user.userId]],
        });
      }
    } else if (body.target === "staff") {
      const all = await data.findMany<any>(COLLECTIONS.users, {});
      users = all.filter((u: any) => STAFF_ROLES.has(u.role));
    } else if (body.target === "cohort") {
      if (!body.cohortId) return json({ error: "Cohort ID is required." }, 400);
      users = await data.findMany<any>(COLLECTIONS.users, {
        where: [["cohortId", "==", body.cohortId]],
      });
      if (!isManager) {
        users = users.filter((u: any) => u.teacherId === user.userId);
      }
    } else if (body.target === "individual") {
      if (!body.recipientIds || !Array.isArray(body.recipientIds) || body.recipientIds.length === 0) {
        return json({ error: "At least one recipient is required." }, 400);
      }
      const all = await data.findMany<any>(COLLECTIONS.users, {});
      users = all.filter((u: any) => body.recipientIds!.includes(u.id));
      if (!isManager) {
        users = users.filter((u: any) => u.teacherId === user.userId);
      }
    }

    const recipients = users
      .filter(
        (u: any) =>
          u.email &&
          !u.email.endsWith("@historical.reviewai.local") &&
          u.passwordHash !== "INVITE_PENDING",
      )
      .map((u: any) => ({ email: u.email as string, fullName: u.fullName as string }));

    if (recipients.length === 0) {
      return json({ sent: 0, failed: 0, total: 0, message: "No eligible recipients found." });
    }

    const job = await enqueueEmailJob({
      kind: "custom",
      recipients,
      payload: { subject: body.subject!, message: body.message! },
      actorId: user.userId,
    });
    return json({ jobId: job.id, total: job.total, status: job.status }, 202);
  },
};
