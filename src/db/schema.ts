import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["student", "teacher"]);
export const submissionTypeEnum = pgEnum("submission_type", ["github", "file_upload"]);
export const reviewStatusEnum = pgEnum("review_status", ["pending", "reviewing", "completed", "failed"]);
export const tokenTypeEnum = pgEnum("token_type", ["invite", "reset"]);

export type StoredFeedback = {
  summary: string;
  criteria: Array<{
    name: string;
    score: number;
    maxScore: number;
    comment: string;
  }>;
  suggestions: string[];
  codeQualityNotes: string;
  provider?: string;
  model?: string;
  durationMs?: number;
  submissionStructure?: {
    classification: "one_file_per_question" | "multi_file_per_question" | "single_project_solution" | "mixed_or_unclear";
    confidence: "high" | "medium" | "low";
    explanation: string;
  };
  fileScores?: Array<{
    filename: string;
    score: number;
    maxScore: number;
    summary: string;
  }>;
  averageFileScore?: number | null;
  questionGroups?: Array<{
    label: string;
    files: string[];
    reasoning: string;
  }>;
  comparisons?: Array<{
    provider: string;
    model: string;
    score: number;
    durationMs: number;
    feedback: {
      summary: string;
      criteria: Array<{
        name: string;
        score: number;
        maxScore: number;
        comment: string;
      }>;
      suggestions: string[];
      codeQualityNotes: string;
    };
  }>;
};

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  fullName: varchar("full_name", { length: 255 }).notNull(),
  role: userRoleEnum("role").notNull().default("student"),
  joinCode: varchar("join_code", { length: 16 }).unique(),
  teacherId: uuid("teacher_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const assignments = pgTable("assignments", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description").notNull(),
  rubric: text("rubric").notNull(),
  sourceType: varchar("source_type", { length: 20 }).notNull().default("manual"),
  sourceMarkdown: text("source_markdown"),
  sourceUrl: text("source_url"),
  createdBy: uuid("created_by").references(() => users.id).notNull(),
  opensAt: timestamp("opens_at", { withTimezone: true }).notNull(),
  closesAt: timestamp("closes_at", { withTimezone: true }).notNull(),
  maxScore: integer("max_score").notNull().default(100),
  allowGithub: boolean("allow_github").notNull().default(true),
  allowFileUpload: boolean("allow_file_upload").notNull().default(true),
  defaultProvider: varchar("default_provider", { length: 20 }).notNull().default("gemini"),
  classNotes: text("class_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  createdByIdx: index("idx_assignments_created_by").on(table.createdBy),
  windowsIdx: index("idx_assignments_dates").on(table.opensAt, table.closesAt),
}));

export const submissions = pgTable("submissions", {
  id: uuid("id").defaultRandom().primaryKey(),
  assignmentId: uuid("assignment_id").references(() => assignments.id).notNull(),
  studentId: uuid("student_id").references(() => users.id).notNull(),
  submissionType: submissionTypeEnum("submission_type").notNull(),
  githubUrl: varchar("github_url", { length: 1000 }),
  filePath: text("file_path"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow().notNull(),
  isLate: boolean("is_late").notNull().default(false),
}, (table) => ({
  studentAssignmentUnique: uniqueIndex("uniq_submissions_assignment_student").on(table.assignmentId, table.studentId),
  assignmentIdx: index("idx_submissions_assignment").on(table.assignmentId),
  studentIdx: index("idx_submissions_student").on(table.studentId),
  submittedAtIdx: index("idx_submissions_date").on(table.submittedAt),
}));

export const reviews = pgTable("reviews", {
  id: uuid("id").defaultRandom().primaryKey(),
  submissionId: uuid("submission_id").references(() => submissions.id).notNull().unique(),
  status: reviewStatusEnum("status").notNull().default("pending"),
  aiScore: integer("ai_score"),
  maxScore: integer("max_score"),
  teacherOverrideScore: integer("teacher_override_score"),
  feedback: jsonb("feedback").$type<StoredFeedback>(),
  rawAiResponse: text("raw_ai_response"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  submissionIdx: index("idx_reviews_submission").on(table.submissionId),
}));

export const authTokens = pgTable("auth_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  token: text("token").notNull().unique(),
  type: tokenTypeEnum("type").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  tokenIdx: uniqueIndex("idx_auth_tokens_token").on(table.token),
  userTypeIdx: index("idx_auth_tokens_user_type").on(table.userId, table.type),
}));

export const submissionOverrides = pgTable("submission_overrides", {
  id: uuid("id").defaultRandom().primaryKey(),
  studentId: uuid("student_id").references(() => users.id).notNull(),
  assignmentId: uuid("assignment_id").references(() => assignments.id).notNull(),
  grantedBy: uuid("granted_by").references(() => users.id).notNull(),
  closesAt: timestamp("closes_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  studentAssignmentUnique: uniqueIndex("uniq_overrides_student_assignment").on(table.studentId, table.assignmentId),
}));

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  actorId: uuid("actor_id"),
  actorEmail: varchar("actor_email", { length: 255 }),
  action: varchar("action", { length: 100 }).notNull(),
  targetType: varchar("target_type", { length: 50 }),
  targetId: varchar("target_id", { length: 255 }),
  details: jsonb("details").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  createdAtIdx: index("idx_audit_logs_created_at").on(table.createdAt),
  actorIdx: index("idx_audit_logs_actor").on(table.actorId),
}));

export type User = typeof users.$inferSelect;
export type Assignment = typeof assignments.$inferSelect;
export type Submission = typeof submissions.$inferSelect;
export type Review = typeof reviews.$inferSelect;
export type AuthToken = typeof authTokens.$inferSelect;
export type SubmissionOverride = typeof submissionOverrides.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
