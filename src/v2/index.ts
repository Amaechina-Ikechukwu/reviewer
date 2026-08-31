import type { Permission } from "../utils/permissions";
import { assignmentRoutes } from "./routes/assignments";
import { notificationRoutes } from "./routes/notifications";
import { auditLogRoutes } from "./routes/auditLogs";
import { authRoutes } from "./routes/auth";
import { classNoteRoutes } from "./routes/classNotes";
import { cohortRoutes } from "./routes/cohorts";
import { customFormRoutes } from "./routes/customForms";
import { gradebookRoutes } from "./routes/gradebook";
import { reviewRoutes } from "./routes/reviews";
import { studentRoutes } from "./routes/students";
import { submissionRoutes } from "./routes/submissions";
import { staffRoutes } from "./routes/staff";
import { teacherRoutes } from "./routes/teachers";
import { changelogRoutes } from "./routes/changelogs";
import { emailJobRoutes } from "./routes/emailJobs";
import { quizRoutes } from "./routes/quizzes";
import { projectRoutes } from "./routes/projects";
import { inAppNotificationRoutes } from "./routes/inAppNotifications";

export type V2RouteHandler = (request: Request, params: Record<string, string>) => Promise<Response> | Response;
export type V2RouteSpec = {
  method: string;
  path: string;
  handler: V2RouteHandler;
  requiresAuth: boolean;
  /** Access the caller needs on top of being signed in. Enforced centrally by
   * the dispatcher, so no handler has to repeat the check. */
  permission?: Permission;
};

export const v2Routes: V2RouteSpec[] = [
  { method: "POST", path: "/v2/api/auth/register", handler: authRoutes.register, requiresAuth: false },
  { method: "POST", path: "/v2/api/auth/login", handler: authRoutes.login, requiresAuth: false },
  { method: "GET", path: "/v2/api/auth/me", handler: authRoutes.me, requiresAuth: true },
  { method: "GET", path: "/v2/api/auth/token/:token", handler: authRoutes.validateToken, requiresAuth: false },
  { method: "POST", path: "/v2/api/auth/invite/:token", handler: authRoutes.acceptInvite, requiresAuth: false },
  { method: "POST", path: "/v2/api/auth/request-reset", handler: authRoutes.requestReset, requiresAuth: true },
  { method: "POST", path: "/v2/api/auth/forgot-password", handler: authRoutes.forgotPassword, requiresAuth: false },
  { method: "POST", path: "/v2/api/auth/send-otp", handler: authRoutes.sendOtp, requiresAuth: false },
  { method: "POST", path: "/v2/api/auth/reset-with-otp", handler: authRoutes.resetWithOtp, requiresAuth: false },
  { method: "POST", path: "/v2/api/auth/reset/:token", handler: authRoutes.resetPassword, requiresAuth: false },

  { method: "POST", path: "/v2/api/assignments", handler: assignmentRoutes.create, requiresAuth: true, permission: "assignments.manage" },
  { method: "GET", path: "/v2/api/assignments", handler: assignmentRoutes.list, requiresAuth: true },
  { method: "POST", path: "/v2/api/assignments/upload-brief", handler: assignmentRoutes.uploadBrief, requiresAuth: true, permission: "assignments.manage" },
  { method: "GET", path: "/v2/api/assignments/:id", handler: assignmentRoutes.get, requiresAuth: true },
  { method: "GET", path: "/v2/api/assignments/:id/brief", handler: assignmentRoutes.getBrief, requiresAuth: true },
  { method: "GET", path: "/v2/api/public/assignments/:id", handler: assignmentRoutes.getPublicBrief, requiresAuth: false },
  { method: "GET", path: "/v2/api/public/assignments/:id/brief", handler: assignmentRoutes.getBrief, requiresAuth: false },
  { method: "GET", path: "/v2/api/assignments/:id/class-notes-asset", handler: assignmentRoutes.getClassNotesAsset, requiresAuth: true },
  { method: "PATCH", path: "/v2/api/assignments/:id", handler: assignmentRoutes.update, requiresAuth: true, permission: "assignments.manage" },
  { method: "DELETE", path: "/v2/api/assignments/:id", handler: assignmentRoutes.remove, requiresAuth: true, permission: "assignments.delete" },
  { method: "GET", path: "/v2/api/assignments/:id/groups", handler: assignmentRoutes.listGroups, requiresAuth: true },
  { method: "PUT", path: "/v2/api/assignments/:id/groups", handler: assignmentRoutes.updateGroups, requiresAuth: true, permission: "assignments.manage" },
  { method: "POST", path: "/v2/api/assignments/:id/groups/regenerate", handler: assignmentRoutes.regenerateGroups, requiresAuth: true, permission: "assignments.manage" },
  { method: "POST", path: "/v2/api/assignments/upload-group-asset", handler: assignmentRoutes.uploadGroupAsset, requiresAuth: true, permission: "assignments.manage" },
  { method: "GET", path: "/v2/api/assignments/:id/groups/:groupId/brief", handler: assignmentRoutes.getGroupBrief, requiresAuth: true },
  { method: "GET", path: "/v2/api/assignments/:id/groups/:groupId/assets/:assetId", handler: assignmentRoutes.getGroupAsset, requiresAuth: true },
  { method: "POST", path: "/v2/api/assignments/:id/groups/:groupId/share", handler: assignmentRoutes.shareGroup, requiresAuth: true, permission: "assignments.manage" },
  { method: "DELETE", path: "/v2/api/assignments/:id/groups/:groupId/share", handler: assignmentRoutes.unshareGroup, requiresAuth: true, permission: "assignments.manage" },
  { method: "GET", path: "/v2/api/public/groups/:token", handler: assignmentRoutes.getPublicGroup, requiresAuth: false },
  { method: "GET", path: "/v2/api/public/groups/:token/brief", handler: assignmentRoutes.getPublicGroupBrief, requiresAuth: false },
  { method: "GET", path: "/v2/api/public/groups/:token/assets/:assetId", handler: assignmentRoutes.getPublicGroupAsset, requiresAuth: false },

  { method: "POST", path: "/v2/api/submissions", handler: submissionRoutes.create, requiresAuth: true },
  { method: "POST", path: "/v2/api/submissions/import", handler: submissionRoutes.import, requiresAuth: true, permission: "submissions.manage" },
  { method: "GET", path: "/v2/api/submissions", handler: submissionRoutes.list, requiresAuth: true },
  { method: "GET", path: "/v2/api/submissions/:id", handler: submissionRoutes.get, requiresAuth: true },
  { method: "GET", path: "/v2/api/submissions/:id/files", handler: submissionRoutes.getFiles, requiresAuth: true },
  { method: "POST", path: "/v2/api/submissions/:id/share", handler: submissionRoutes.share, requiresAuth: true },
  { method: "DELETE", path: "/v2/api/submissions/:id/share", handler: submissionRoutes.unshare, requiresAuth: true },
  { method: "GET", path: "/v2/api/public/submissions/:token", handler: submissionRoutes.getPublic, requiresAuth: false },
  { method: "POST", path: "/v2/api/submissions/submit-for-student", handler: submissionRoutes.submitForStudent, requiresAuth: true, permission: "submissions.manage" },
  { method: "GET", path: "/v2/api/assignments/:id/roster", handler: submissionRoutes.roster, requiresAuth: true },
  { method: "POST", path: "/v2/api/assignments/:id/mark", handler: submissionRoutes.mark, requiresAuth: true, permission: "grades.edit" },
  { method: "DELETE", path: "/v2/api/assignments/:id/mark/:studentId", handler: submissionRoutes.unmark, requiresAuth: true, permission: "grades.edit" },
  { method: "DELETE", path: "/v2/api/submissions/:id", handler: submissionRoutes.delete, requiresAuth: true, permission: "submissions.manage" },

  { method: "GET", path: "/v2/api/cohorts", handler: cohortRoutes.list, requiresAuth: true },
  { method: "POST", path: "/v2/api/cohorts", handler: cohortRoutes.create, requiresAuth: true, permission: "cohorts.manage" },
  { method: "GET", path: "/v2/api/cohorts/:id", handler: cohortRoutes.get, requiresAuth: true },
  { method: "PATCH", path: "/v2/api/cohorts/:id", handler: cohortRoutes.update, requiresAuth: true, permission: "cohorts.manage" },
  { method: "DELETE", path: "/v2/api/cohorts/:id", handler: cohortRoutes.remove, requiresAuth: true, permission: "cohorts.manage" },
  { method: "POST", path: "/v2/api/cohorts/:id/students", handler: cohortRoutes.addStudent, requiresAuth: true, permission: "cohorts.manage" },
  { method: "DELETE", path: "/v2/api/cohorts/:id/students/:studentId", handler: cohortRoutes.removeStudent, requiresAuth: true, permission: "cohorts.manage" },

  { method: "GET", path: "/v2/api/students", handler: studentRoutes.list, requiresAuth: true },
  { method: "GET", path: "/v2/api/students/my-overrides", handler: studentRoutes.myOverrides, requiresAuth: true },
  { method: "POST", path: "/v2/api/students", handler: studentRoutes.create, requiresAuth: true, permission: "students.manage" },
  { method: "POST", path: "/v2/api/students/merge", handler: studentRoutes.merge, requiresAuth: true, permission: "students.manage" },
  { method: "POST", path: "/v2/api/students/reset-password", handler: studentRoutes.resetPassword, requiresAuth: true, permission: "students.manage" },
  { method: "PATCH", path: "/v2/api/students/:studentId", handler: studentRoutes.update, requiresAuth: true, permission: "students.manage" },
  { method: "DELETE", path: "/v2/api/students/:studentId", handler: studentRoutes.delete, requiresAuth: true, permission: "students.manage" },
  { method: "POST", path: "/v2/api/students/:studentId/open-submission", handler: studentRoutes.openSubmission, requiresAuth: true, permission: "students.manage" },
  { method: "PATCH", path: "/v2/api/students/:studentId/access", handler: studentRoutes.updateAccess, requiresAuth: true, permission: "staff.manage" },

  { method: "GET", path: "/v2/api/audit-logs", handler: auditLogRoutes.list, requiresAuth: true },
  { method: "GET", path: "/v2/api/gradebook", handler: gradebookRoutes.get, requiresAuth: true },

  { method: "GET", path: "/v2/api/staff", handler: staffRoutes.list, requiresAuth: true },
  { method: "GET", path: "/v2/api/staff/access-options", handler: staffRoutes.accessOptions, requiresAuth: true, permission: "staff.manage" },
  { method: "POST", path: "/v2/api/staff", handler: staffRoutes.invite, requiresAuth: true, permission: "staff.manage" },
  { method: "PATCH", path: "/v2/api/staff/:id/role", handler: staffRoutes.updateRole, requiresAuth: true, permission: "staff.manage" },
  { method: "PATCH", path: "/v2/api/staff/:id/access", handler: staffRoutes.updateAccess, requiresAuth: true, permission: "staff.manage" },
  { method: "POST", path: "/v2/api/staff/:id/resend-invite", handler: staffRoutes.resendInvite, requiresAuth: true, permission: "staff.manage" },
  { method: "DELETE", path: "/v2/api/staff/:id", handler: staffRoutes.remove, requiresAuth: true, permission: "staff.manage" },

  { method: "GET", path: "/v2/api/teachers/join-link", handler: teacherRoutes.getJoinLink, requiresAuth: true },
  { method: "GET", path: "/v2/api/teachers/join/:code", handler: teacherRoutes.getTeacherByCode, requiresAuth: false },
  { method: "POST", path: "/v2/api/teachers/join/:code", handler: teacherRoutes.joinViaLink, requiresAuth: false },

  { method: "POST", path: "/v2/api/class-notes", handler: classNoteRoutes.upload, requiresAuth: true, permission: "notes.manage" },
  { method: "GET", path: "/v2/api/class-notes", handler: classNoteRoutes.list, requiresAuth: true },
  { method: "GET", path: "/v2/api/class-notes/:id", handler: classNoteRoutes.get, requiresAuth: true },
  { method: "GET", path: "/v2/api/class-notes/:id/download", handler: classNoteRoutes.download, requiresAuth: true },
  { method: "DELETE", path: "/v2/api/class-notes/:id", handler: classNoteRoutes.remove, requiresAuth: true, permission: "notes.manage" },

  { method: "GET", path: "/v2/api/reviews/providers", handler: reviewRoutes.providers, requiresAuth: true },
  { method: "POST", path: "/v2/api/reviews/:submissionId/run", handler: reviewRoutes.run, requiresAuth: true, permission: "reviews.run" },
  { method: "GET", path: "/v2/api/reviews/:submissionId", handler: reviewRoutes.get, requiresAuth: true },
  { method: "PATCH", path: "/v2/api/reviews/:submissionId/override", handler: reviewRoutes.override, requiresAuth: true, permission: "grades.edit" },

  { method: "POST", path: "/v2/api/forms", handler: customFormRoutes.create, requiresAuth: true, permission: "forms.manage" },
  { method: "GET", path: "/v2/api/forms", handler: customFormRoutes.list, requiresAuth: true },
  { method: "GET", path: "/v2/api/forms/my-responses", handler: customFormRoutes.myResponses, requiresAuth: true },
  { method: "GET", path: "/v2/api/forms/:id", handler: customFormRoutes.get, requiresAuth: true },
  { method: "PATCH", path: "/v2/api/forms/:id", handler: customFormRoutes.update, requiresAuth: true, permission: "forms.manage" },
  { method: "DELETE", path: "/v2/api/forms/:id", handler: customFormRoutes.remove, requiresAuth: true, permission: "forms.manage" },
  { method: "POST", path: "/v2/api/forms/:id/responses", handler: customFormRoutes.submitResponse, requiresAuth: true },
  { method: "GET", path: "/v2/api/forms/:id/responses", handler: customFormRoutes.listResponses, requiresAuth: true },
  { method: "PATCH", path: "/v2/api/forms/:id/responses/:responseId", handler: customFormRoutes.decideResponse, requiresAuth: true, permission: "forms.manage" },

  { method: "POST", path: "/v2/api/notifications/send", handler: notificationRoutes.send, requiresAuth: true, permission: "notifications.send" },

  { method: "GET", path: "/v2/api/email-jobs/:id", handler: emailJobRoutes.get, requiresAuth: true },

  { method: "POST", path: "/v2/api/quizzes", handler: quizRoutes.create, requiresAuth: true, permission: "quizzes.manage" },
  { method: "GET", path: "/v2/api/quizzes", handler: quizRoutes.list, requiresAuth: true },
  { method: "GET", path: "/v2/api/quizzes/:id", handler: quizRoutes.get, requiresAuth: true },
  { method: "PATCH", path: "/v2/api/quizzes/:id", handler: quizRoutes.update, requiresAuth: true, permission: "quizzes.manage" },
  { method: "DELETE", path: "/v2/api/quizzes/:id", handler: quizRoutes.remove, requiresAuth: true, permission: "quizzes.manage" },
  { method: "POST", path: "/v2/api/quizzes/:id/attempts/start", handler: quizRoutes.startAttempt, requiresAuth: true },
  { method: "POST", path: "/v2/api/quizzes/:id/attempts/:attemptId/leave", handler: quizRoutes.registerLeave, requiresAuth: true },
  { method: "POST", path: "/v2/api/quizzes/:id/attempts/:attemptId/submit", handler: quizRoutes.submitAttempt, requiresAuth: true },
  { method: "GET", path: "/v2/api/quizzes/:id/my-attempt", handler: quizRoutes.myAttempt, requiresAuth: true },
  { method: "GET", path: "/v2/api/quizzes/:id/attempts", handler: quizRoutes.listAttempts, requiresAuth: true },
  { method: "POST", path: "/v2/api/quizzes/:id/release", handler: quizRoutes.releaseResults, requiresAuth: true, permission: "quizzes.manage" },
  { method: "POST", path: "/v2/api/quizzes/:id/attempts/:attemptId/release", handler: quizRoutes.releaseAttempt, requiresAuth: true, permission: "quizzes.manage" },

  // Create/update/delete have no dispatcher-level permission: a plain student
  // can create, edit, and delete their own solo project (see projectRoutes),
  // which a blanket "projects.manage" gate here would block since students
  // can never be granted that permission. Staff-vs-others enforcement for
  // these three happens inside the handlers instead.
  { method: "POST", path: "/v2/api/projects", handler: projectRoutes.create, requiresAuth: true },
  { method: "GET", path: "/v2/api/projects", handler: projectRoutes.list, requiresAuth: true },
  { method: "GET", path: "/v2/api/projects/:id", handler: projectRoutes.get, requiresAuth: true },
  { method: "PATCH", path: "/v2/api/projects/:id", handler: projectRoutes.update, requiresAuth: true },
  { method: "DELETE", path: "/v2/api/projects/:id", handler: projectRoutes.remove, requiresAuth: true },
  { method: "POST", path: "/v2/api/projects/:id/students", handler: projectRoutes.assignStudents, requiresAuth: true, permission: "projects.manage" },
  { method: "DELETE", path: "/v2/api/projects/:id/students/:studentId", handler: projectRoutes.removeStudent, requiresAuth: true, permission: "projects.manage" },
  { method: "POST", path: "/v2/api/projects/:id/submit", handler: projectRoutes.submit, requiresAuth: true },
  { method: "POST", path: "/v2/api/projects/:id/review", handler: projectRoutes.review, requiresAuth: true, permission: "projects.manage" },

  // In-app notifications
  { method: "GET", path: "/v2/api/notifications/in-app", handler: inAppNotificationRoutes.list, requiresAuth: true },
  { method: "PATCH", path: "/v2/api/notifications/in-app/:id/read", handler: inAppNotificationRoutes.markRead, requiresAuth: true },
  { method: "POST", path: "/v2/api/notifications/in-app/read-all", handler: inAppNotificationRoutes.markAllRead, requiresAuth: true },
  { method: "GET", path: "/v2/api/notifications/in-app/unread-count", handler: inAppNotificationRoutes.unreadCount, requiresAuth: true },

  { method: "GET", path: "/v2/api/changelogs", handler: changelogRoutes.list, requiresAuth: false },
  { method: "POST", path: "/v2/api/changelogs", handler: changelogRoutes.create, requiresAuth: true, permission: "changelog.manage" },
  { method: "POST", path: "/v2/api/changelogs/:id/notify", handler: changelogRoutes.notify, requiresAuth: true, permission: "changelog.manage" },
  { method: "PATCH", path: "/v2/api/changelogs/:id", handler: changelogRoutes.update, requiresAuth: true, permission: "changelog.manage" },
  { method: "DELETE", path: "/v2/api/changelogs/:id", handler: changelogRoutes.remove, requiresAuth: true, permission: "changelog.manage" },
];
