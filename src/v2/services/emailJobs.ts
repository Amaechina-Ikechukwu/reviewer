import { randomUUID } from "node:crypto";
import { data } from "../data";
import { COLLECTIONS } from "../firebase";
import { logger } from "../../utils/logger";
import {
  sendAssignmentNotification,
  sendChangelogNotification,
  sendCustomNotification,
  sendDeadlineReminder,
  sendFormNotification,
  sendGroupAssignmentNotification,
  sendProjectAssignmentNotification,
  sendProjectSubmissionNotification,
  sendProjectReviewNotification,
  sendQuizResultsRelease,
  type BulkResult,
} from "../../services/email";

export type EmailJobKind =
  | "custom"
  | "changelog"
  | "form"
  | "assignment"
  | "group_assignment"
  | "deadline_reminder"
  | "quiz_results"
  | "project_assignment"
  | "project_submission"
  | "project_review";

export type EmailJobStatus = "pending" | "running" | "completed" | "failed";

export type EmailRecipient = { email: string; fullName: string };

export type EmailJob = {
  id: string;
  kind: EmailJobKind;
  status: EmailJobStatus;
  recipients: EmailRecipient[];
  payload: any;
  total: number;
  sent: number;
  failed: number;
  failures: Array<{ email: string; error: string; code: string }>;
  attempts: number;
  createdAt: Date;
  startedAt?: Date | null;
  completedAt?: Date | null;
  lockedUntil?: Date | null;
  idempotencyKey?: string | null;
  actorId?: string | null;
  error?: string | null;
};

const LOCK_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 3;

export async function enqueueEmailJob(input: {
  kind: EmailJobKind;
  recipients: EmailRecipient[];
  payload: any;
  actorId?: string | null;
  idempotencyKey?: string | null;
}): Promise<EmailJob> {
  if (input.idempotencyKey) {
    const existing = await data.findOne<EmailJob>(COLLECTIONS.emailJobs, [
      ["idempotencyKey", "==", input.idempotencyKey],
    ]);
    if (existing) {
      logger.info("enqueueEmailJob: idempotency hit", { idempotencyKey: input.idempotencyKey, jobId: existing.id });
      return existing;
    }
  }

  const id = randomUUID();
  const job: EmailJob = {
    id,
    kind: input.kind,
    status: "pending",
    recipients: input.recipients,
    payload: input.payload,
    total: input.recipients.length,
    sent: 0,
    failed: 0,
    failures: [],
    attempts: 0,
    createdAt: new Date(),
    startedAt: null,
    completedAt: null,
    lockedUntil: null,
    idempotencyKey: input.idempotencyKey ?? null,
    actorId: input.actorId ?? null,
    error: null,
  };
  await data.insert(COLLECTIONS.emailJobs, id, job as any);
  logger.info("enqueueEmailJob: created", { jobId: id, kind: input.kind, total: job.total });
  return job;
}

export async function getEmailJob(id: string): Promise<EmailJob | null> {
  return data.getById<EmailJob>(COLLECTIONS.emailJobs, id);
}

async function runOne(job: EmailJob): Promise<BulkResult> {
  switch (job.kind) {
    case "custom":
      return sendCustomNotification(job.recipients, job.payload.subject, job.payload.message);
    case "changelog":
      return sendChangelogNotification(job.recipients, job.payload);
    case "form":
      return sendFormNotification(job.recipients, job.payload);
    case "assignment":
      return sendAssignmentNotification(job.recipients, {
        ...job.payload,
        closesAt: new Date(job.payload.closesAt),
      });
    case "group_assignment":
      return sendGroupAssignmentNotification(
        job.recipients,
        job.payload.assignment,
        job.payload.groupName,
        job.payload.teammates,
      );
    case "deadline_reminder":
      return sendDeadlineReminder(
        job.recipients,
        { ...job.payload.assignment, closesAt: new Date(job.payload.assignment.closesAt) },
        job.payload.hoursLeft,
      );
    case "project_assignment":
      return sendProjectAssignmentNotification(job.recipients, job.payload.project, job.payload.assignedBy);
    case "project_submission":
      return sendProjectSubmissionNotification(job.recipients, job.payload.project, job.payload.studentName);
    case "project_review":
      return sendProjectReviewNotification(job.recipients, job.payload.project, job.payload.action, job.payload.reviewedBy, job.payload.comment);
    case "quiz_results":
      return sendQuizResultsRelease(job.recipients, job.payload);
    default:
      throw new Error(`Unknown email job kind: ${(job as any).kind}`);
  }
}

async function claimJob(): Promise<EmailJob | null> {
  // Find the oldest pending job whose lock has expired (or never set).
  const now = new Date();
  const pending = await data.findMany<EmailJob>(COLLECTIONS.emailJobs, {
    where: [["status", "==", "pending"]],
    orderBy: ["createdAt", "asc"],
    limit: 5,
  });
  for (const job of pending) {
    if (job.lockedUntil && new Date(job.lockedUntil) > now) continue;
    const lockedUntil = new Date(now.getTime() + LOCK_TTL_MS);
    await data.update(COLLECTIONS.emailJobs, job.id, {
      status: "running",
      startedAt: now,
      lockedUntil,
      attempts: (job.attempts || 0) + 1,
    });
    const refreshed = await data.getById<EmailJob>(COLLECTIONS.emailJobs, job.id);
    if (refreshed) return refreshed;
  }
  return null;
}

async function processOne(job: EmailJob): Promise<void> {
  logger.info("emailQueue: processing job", { jobId: job.id, kind: job.kind, attempt: job.attempts, total: job.total });
  try {
    const result = await runOne(job);
    const finalStatus: EmailJobStatus = result.failed === 0 ? "completed"
      : result.sent === 0 && job.attempts < MAX_ATTEMPTS ? "pending"
      : "completed";

    await data.update(COLLECTIONS.emailJobs, job.id, {
      status: finalStatus,
      sent: result.sent,
      failed: result.failed,
      failures: result.failures,
      completedAt: finalStatus === "completed" ? new Date() : null,
      lockedUntil: null,
      error: null,
    });
    logger.info("emailQueue: job finished", {
      jobId: job.id,
      finalStatus,
      sent: result.sent,
      failed: result.failed,
      total: result.total,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const retry = (job.attempts || 1) < MAX_ATTEMPTS;
    await data.update(COLLECTIONS.emailJobs, job.id, {
      status: retry ? "pending" : "failed",
      lockedUntil: null,
      error: message,
      completedAt: retry ? null : new Date(),
    });
    logger.error("emailQueue: job threw", { jobId: job.id, attempt: job.attempts, retry, error: message });
  }
}

let workerRunning = false;
let workerTimer: ReturnType<typeof setInterval> | null = null;

async function tick() {
  if (workerRunning) return;
  workerRunning = true;
  try {
    let job: EmailJob | null;
    while ((job = await claimJob())) {
      await processOne(job);
    }
  } catch (err) {
    logger.error("emailQueue: tick threw", { error: err instanceof Error ? err.message : String(err) });
  } finally {
    workerRunning = false;
  }
}

export function startEmailWorker() {
  if (workerTimer) return;
  const intervalMs = Number(process.env.EMAIL_WORKER_INTERVAL_MS || 10_000);
  logger.info("emailQueue: worker started", { intervalMs });
  workerTimer = setInterval(() => { tick().catch(() => {}); }, intervalMs);
  tick().catch(() => {});
}

export function stopEmailWorker() {
  if (workerTimer) clearInterval(workerTimer);
  workerTimer = null;
}
