/**
 * Access is per person, not per role. A role only supplies the starting set —
 * once someone's access has been edited, the stored list is what counts. This
 * is what lets a teaching assistant grade without also being able to delete an
 * assignment or invite staff.
 */

import { isStaff } from "./jwt";

export const PERMISSIONS = [
  { key: "assignments.manage", label: "Create & edit assignments", group: "Assignments" },
  { key: "assignments.delete", label: "Delete assignments", group: "Assignments" },
  { key: "reviews.run", label: "Run AI reviews", group: "Grading" },
  { key: "grades.edit", label: "Grade, score & mark students done", group: "Grading" },
  { key: "scores.view", label: "View gradebook & student scores", group: "Grading" },
  { key: "submissions.manage", label: "Submit for students, import & delete submissions", group: "Grading" },
  { key: "students.manage", label: "Add & manage students", group: "People" },
  { key: "cohorts.manage", label: "Create & manage cohorts", group: "People" },
  { key: "staff.manage", label: "Invite & manage staff", group: "People" },
  { key: "quizzes.manage", label: "Create & manage quizzes", group: "Coursework" },
  { key: "forms.manage", label: "Create & manage forms", group: "Coursework" },
  { key: "projects.manage", label: "Create & manage projects", group: "Coursework" },
  { key: "notes.manage", label: "Upload & manage class notes", group: "Coursework" },
  { key: "notifications.send", label: "Send announcements", group: "Communication" },
  { key: "changelog.manage", label: "Publish changelog entries", group: "Communication" },
] as const;

export type Permission = (typeof PERMISSIONS)[number]["key"];

export const PERMISSION_KEYS = PERMISSIONS.map((entry) => entry.key) as Permission[];

const ALL = PERMISSION_KEYS;
const EXCEPT = (...excluded: Permission[]) => ALL.filter((key) => !excluded.includes(key));

/**
 * What a role can do before anyone edits it. Owners and admins run the place;
 * managers and instructors do everything except hand out access; an assistant
 * starts with grading only, which is the whole point of the role.
 */
export const ROLE_DEFAULTS: Record<string, Permission[]> = {
  owner: ALL,
  admin: ALL,
  manager: EXCEPT("staff.manage", "changelog.manage"),
  instructor: EXCEPT("staff.manage", "changelog.manage"),
  teacher: EXCEPT("staff.manage", "changelog.manage"),
  assistant: ["reviews.run", "grades.edit", "scores.view"],
  student: [],
};

/**
 * What a student can be handed on top of being a student — everything except
 * the permissions that are really about controlling other staff or the
 * public changelog, and project management, whose ownership/visibility rules
 * assume the actor is staff.
 */
export const STUDENT_GRANTABLE_PERMISSIONS: Permission[] = EXCEPT("staff.manage", "changelog.manage", "projects.manage");

export function isPermission(value: unknown): value is Permission {
  return typeof value === "string" && (PERMISSION_KEYS as string[]).includes(value);
}

/** Keeps only real permission keys, so a stale one in the database is ignored. */
export function sanitizePermissions(values: unknown): Permission[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter(isPermission))];
}

/**
 * A stored list always wins, even when empty — that is a deliberate "this
 * person can only read". Only an untouched account falls back to its role.
 */
export function permissionsFor(user: { role?: string | null; permissions?: unknown }): Permission[] {
  if (Array.isArray(user.permissions)) return sanitizePermissions(user.permissions);
  return ROLE_DEFAULTS[user.role ?? ""] ?? [];
}

export function can(user: { role?: string | null; permissions?: unknown }, permission: Permission): boolean {
  return permissionsFor(user).includes(permission);
}

/**
 * The gate every handler that maps to one catalog permission should use in
 * place of a bare staff check. `route.permission` in v2/index.ts already
 * enforces this before the handler runs — for a `Permission`-gated route,
 * getting this far means the caller already has it, staff or not. This
 * exists mainly for handlers that don't have a `route.permission` (a plain
 * "isStaff" read like the gradebook or roster) but should still open up to a
 * student who was individually granted the matching permission, without
 * touching the behavior for everyone already relying on the old check.
 */
export function isStaffOrGranted(
  user: { role?: string | null; permissions?: readonly string[] | null },
  permission: Permission,
): boolean {
  if (isStaff(user.role ?? "")) return true;
  if (!user.permissions) return false;
  if (user.permissions.includes(permission)) return true;
  if (permission === "scores.view" && user.permissions.includes("grades.edit")) return true;
  return false;
}
