import type { Cohort, Track } from "./types";

function getApiBase() {
  return "/v2/api";
}

let authToken: string | null = localStorage.getItem("token");

export function setToken(token: string | null) {
  authToken = token;
  if (token) {
    localStorage.setItem("token", token);
  } else {
    localStorage.removeItem("token");
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);

  if (authToken) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }

  if (!(init?.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${getApiBase()}${path}`, {
    ...init,
    headers,
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || payload.details || "Request failed");
  }

  return payload as T;
}

// Cohort API
export function listCohorts() {
  return api<(Cohort & { studentCount: number })[]>("/cohorts");
}

export function getCohort(id: string) {
  return api<Cohort & { students: any[] }>(`/cohorts/${id}`);
}

export function createCohort(body: { name: string; track: Track; description?: string }) {
  return api<Cohort>("/cohorts", { method: "POST", body: JSON.stringify(body) });
}

export function updateCohort(id: string, body: { name?: string; track?: Track; description?: string | null }) {
  return api<Cohort>(`/cohorts/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export function deleteCohort(id: string) {
  return api<{ deleted: boolean }>(`/cohorts/${id}`, { method: "DELETE" });
}

export function addStudentToCohort(cohortId: string, studentId: string) {
  return api<{ added: boolean }>(`/cohorts/${cohortId}/students`, { method: "POST", body: JSON.stringify({ studentId }) });
}

export function addStudentsToCohort(cohortId: string, studentIds: string[]) {
  return api<{ added: boolean; count: number }>(`/cohorts/${cohortId}/students`, { method: "POST", body: JSON.stringify({ studentIds }) });
}

export function removeStudentFromCohort(cohortId: string, studentId: string) {
  return api<{ removed: boolean }>(`/cohorts/${cohortId}/students/${studentId}`, { method: "DELETE" });
}

// Email-job polling — used after async bulk-send endpoints return 202 { jobId }.
export type EmailJobStatus = {
  id: string;
  kind: string;
  status: "pending" | "running" | "completed" | "failed";
  total: number;
  sent: number;
  failed: number;
  attempts: number;
  failures: Array<{ email: string; error: string; code: string }>;
  failureCount: number;
  error: string | null;
};

export function getEmailJob(id: string) {
  return api<EmailJobStatus>(`/email-jobs/${id}`);
}

export async function pollEmailJob(
  id: string,
  opts: { intervalMs?: number; timeoutMs?: number; onTick?: (j: EmailJobStatus) => void } = {},
): Promise<EmailJobStatus> {
  const intervalMs = opts.intervalMs ?? 2000;
  const timeoutMs = opts.timeoutMs ?? 10 * 60 * 1000;
  const deadline = Date.now() + timeoutMs;
  while (true) {
    const job = await getEmailJob(id);
    opts.onTick?.(job);
    if (job.status === "completed" || job.status === "failed") return job;
    if (Date.now() > deadline) return job;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
