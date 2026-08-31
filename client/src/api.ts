import type { Cohort, Permission, Project, RosterRow, StudentRecord, Track } from "./types";

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

let activeRequests = 0;

function updateLoadingState(delta: number) {
  activeRequests += delta;
  if (activeRequests < 0) activeRequests = 0;
  window.dispatchEvent(new CustomEvent('global-loading', { detail: { isLoading: activeRequests > 0 } }));
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);

  if (authToken) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }

  if (!(init?.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  updateLoadingState(1);
  try {
    const response = await fetch(`${getApiBase()}${path}`, {
      ...init,
      headers,
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.error || payload.details || "Request failed");
    }

    return payload as T;
  } finally {
    updateLoadingState(-1);
  }
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

// Student API
export function listStudents() {
  return api<StudentRecord[]>("/students");
}

// Project API
export function listProjects(studentId?: string) {
  const query = studentId ? `?studentId=${encodeURIComponent(studentId)}` : "";
  return api<Project[]>(`/projects${query}`);
}

export function getProject(id: string) {
  return api<Project>(`/projects/${id}`);
}

export function createProject(body: { title: string; description?: string | null; studentIds?: string[]; deadline?: string | null; briefPdfPath?: string | null }) {
  return api<Project>("/projects", { method: "POST", body: JSON.stringify(body) });
}

export function updateProject(id: string, body: { title?: string; description?: string | null; studentIds?: string[]; status?: string; deadline?: string | null; briefPdfPath?: string | null }) {
  return api<Project>(`/projects/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export async function uploadProjectBrief(file: File) {
  const fd = new FormData();
  fd.append("file", file);
  return api<{ briefId: string }>("/projects/upload-brief", { method: "POST", body: fd });
}

export function deleteProject(id: string) {
  return api<{ deleted: boolean }>(`/projects/${id}`, { method: "DELETE" });
}

export function deleteSubmission(id: string) {
  return api<{ deleted: boolean }>(`/submissions/${id}`, { method: "DELETE" });
}

// Staff access

/** Sets one member's access. `useRoleDefaults` clears the hand-picked list. */
export function updateStaffAccess(
  staffId: string,
  body: { permissions: Permission[] } | { useRoleDefaults: true },
) {
  return api<{ id: string; role: string; permissions: Permission[]; customAccess: boolean }>(
    `/staff/${staffId}/access`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
}

/** Grants a student extra responsibilities without making them staff — they stay `role: "student"`. */
export function updateStudentAccess(studentId: string, permissions: Permission[], allowedAssignmentIds?: string[] | null) {
  return api<{ id: string; role: "student"; permissions: Permission[]; allowedAssignmentIds?: string[] | null; customAccess: boolean }>(
    `/students/${studentId}/access`,
    { method: "PATCH", body: JSON.stringify({ permissions, allowedAssignmentIds }) },
  );
}

// Assignment roster + manual marking

export function getAssignmentRoster(assignmentId: string) {
  return api<{ maxScore: number; students: RosterRow[] }>(`/assignments/${assignmentId}/roster`);
}

/** Marks students complete. Omit `score` to record completion only. */
export function markAssignmentDone(
  assignmentId: string,
  body: { studentIds: string[]; score?: number | null; note?: string; notify?: boolean },
) {
  return api<{ marked: { studentId: string; submissionId: string; score: number | null }[]; skipped: { studentId: string; reason: string }[] }>(
    `/assignments/${assignmentId}/mark`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function unmarkAssignment(assignmentId: string, studentId: string) {
  return api<{ removed: boolean }>(`/assignments/${assignmentId}/mark/${studentId}`, { method: "DELETE" });
}

export function assignStudentsToProject(projectId: string, studentIds: string[]) {
  return api<Project>(`/projects/${projectId}/students`, { method: "POST", body: JSON.stringify({ studentIds }) });
}

export function removeStudentFromProject(projectId: string, studentId: string) {
  return api<Project>(`/projects/${projectId}/students/${studentId}`, { method: "DELETE" });
}

export function submitProject(projectId: string, deployedUrl: string) {
  return api<Project>(`/projects/${projectId}/submit`, { method: "POST", body: JSON.stringify({ deployedUrl }) });
}

export function reviewProject(projectId: string, action: "accepted" | "declined", comment?: string) {
  return api<Project>(`/projects/${projectId}/review`, { method: "POST", body: JSON.stringify({ action, comment }) });
}

// In-app notifications
export function listInAppNotifications() {
  return api<import("./types").InAppNotification[]>("/notifications/in-app");
}

export function markNotificationRead(id: string) {
  return api<import("./types").InAppNotification>(`/notifications/in-app/${id}/read`, { method: "PATCH" });
}

export function markAllNotificationsRead() {
  return api<{ updated: number }>("/notifications/in-app/read-all", { method: "POST" });
}

export function unreadNotificationCount() {
  return api<{ count: number }>("/notifications/in-app/unread-count");
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
