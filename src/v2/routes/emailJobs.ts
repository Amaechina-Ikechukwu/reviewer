import type { AuthenticatedRequest } from "../../middleware/auth";
import { isStaff } from "../../utils/jwt";
import { json } from "../../utils/json";
import { getEmailJob } from "../services/emailJobs";

export const emailJobRoutes = {
  async get(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    if (!isStaff(user.role)) return json({ error: "Access denied." }, 403);

    const job = await getEmailJob(params.id);
    if (!job) return json({ error: "Job not found." }, 404);

    return json({
      id: job.id,
      kind: job.kind,
      status: job.status,
      total: job.total,
      sent: job.sent,
      failed: job.failed,
      attempts: job.attempts,
      createdAt: job.createdAt,
      startedAt: job.startedAt ?? null,
      completedAt: job.completedAt ?? null,
      // Truncate failure detail at 50 entries so a botched 10k-recipient blast doesn't return MBs.
      failures: (job.failures ?? []).slice(0, 50),
      failureCount: (job.failures ?? []).length,
      error: job.error ?? null,
    });
  },
};
