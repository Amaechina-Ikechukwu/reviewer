export type Track =
  | "frontend"
  | "backend"
  | "data_analytics"
  | "product_design"
  | "digital_marketing"
  | "cyber_security";

export const TRACKS: { value: Track; label: string }[] = [
  { value: "frontend", label: "Frontend" },
  { value: "backend", label: "Backend" },
  { value: "data_analytics", label: "Data Analytics" },
  { value: "product_design", label: "Product Design" },
  { value: "digital_marketing", label: "Digital Marketing" },
  { value: "cyber_security", label: "Cyber Security" },
];

export const CODE_TRACKS: Track[] = ["frontend", "backend", "cyber_security"];

export type StaffRole = "teacher" | "owner" | "admin" | "manager" | "instructor";
export type Role = "student" | StaffRole;

export function isStaffRole(role: Role | string): boolean {
  return ["teacher", "owner", "admin", "manager", "instructor"].includes(role);
}

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  owner: "Owner",
  admin: "Admin",
  manager: "Manager",
  instructor: "Instructor",
  teacher: "Instructor",
};

export type ProviderName = "gemini";
export type AssignmentSourceType = "manual" | "markdown" | "notion" | "mixed" | "pdf";

export type User = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
};

export type Assignment = {
  id: string;
  title: string;
  description: string;
  rubric: string;
  sourceType: AssignmentSourceType;
  sourceMarkdown: string | null;
  sourceUrl: string | null;
  sourcePdfPath: string | null;
  createdBy: string;
  opensAt: string;
  closesAt: string;
  maxScore: number;
  allowGithub: boolean;
  allowFileUpload: boolean;
  defaultProvider: ProviderName;
  classNotes: string | null;
  isGroupAssignment?: boolean;
  groupCount?: number;
  groupQuestionMode?: "same" | "per_group";
  track?: Track | null;
  cohortId?: string | null;
  createdAt: string;
};

export type GroupSourceType = "markdown" | "link" | "pdf";

export type AssignmentGroup = {
  id: string;
  assignmentId: string;
  name: string;
  memberIds: string[];
  description?: string | null;
  rubric?: string | null;
  sourceType?: GroupSourceType | null;
  sourceUrl?: string | null;
  sourcePdfPath?: string | null;
};

export type Submission = {
  id: string;
  assignmentId: string;
  studentId: string;
  groupId?: string | null;
  submissionType: "github" | "file_upload";
  githubUrl: string | null;
  filePath: string | null;
  submittedAt: string;
  isLate: boolean;
};

export type CodeFile = {
  filename: string;
  content: string;
  language: string;
};

export type Review = {
  id: string;
  submissionId: string;
  status: "pending" | "reviewing" | "completed" | "failed";
  aiScore: number | null;
  maxScore: number | null;
  teacherOverrideScore: number | null;
  feedback?: {
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
  };
  rawAiResponse: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

export type ProviderInfo = {
  name: ProviderName;
  configured: boolean;
  model: string;
};

export type ClassNote = {
  id: string;
  title: string;
  filename: string;
  createdAt: string;
  content?: string;
  fileType?: "md" | "pdf" | "docx";
  storagePath?: string;
};

export type StudentRecord = {
  id: string;
  email: string;
  fullName: string;
  role: "student";
  cohortId?: string | null;
  track?: Track | null;
  createdAt: string;
};

export type Cohort = {
  id: string;
  name: string;
  track: Track;
  description?: string | null;
  createdAt: string;
};

export type CustomFormFieldType =
  | "short_text"
  | "long_text"
  | "number"
  | "single_choice"
  | "multi_choice"
  | "url";

export type CustomFormField = {
  id: string;
  label: string;
  type: CustomFormFieldType;
  required: boolean;
  options?: string[];
  helpText?: string;
  repeatCount?: number;
};

export type CustomFormStatus = "draft" | "open" | "closed";

export type CustomFormTargetType = "all" | "specific";

export type CustomForm = {
  id: string;
  title: string;
  description: string;
  fields: CustomFormField[];
  status: CustomFormStatus;
  closesAt: string | null;
  createdBy: string;
  createdAt: string;
  targetType?: CustomFormTargetType;
  targetStudentId?: string | null;
  targetGroupId?: string | null;
  assignmentId?: string | null;
  publishedLink?: string | null;
};

export type QuizStatus = "draft" | "open" | "closed";

export type QuizAttemptStatus = "in_progress" | "submitted" | "auto_submitted";

export type QuizQuestion = {
  id: string;
  prompt: string;
  options: string[];
  correctIndex?: number;
};

export type Quiz = {
  id: string;
  title: string;
  description?: string;
  cohortId: string;
  secondsPerQuestion: number;
  leaveThreshold: number;
  penaltyPerLeave: number;
  status: QuizStatus;
  questionCount: number;
  questions?: QuizQuestion[];
  resultsReleased?: boolean;
  resultsReleasedAt?: string | null;
  createdBy: string;
  createdAt: string;
};

export type QuizAttempt = {
  id: string;
  quizId: string;
  studentId: string;
  startedAt: string;
  submittedAt: string | null;
  answers: Record<string, number>;
  leaveCount: number;
  rawScore: number;
  penalty: number;
  finalScore: number;
  totalQuestions: number;
  status: QuizAttemptStatus;
  released?: boolean;
  releasedAt?: string | null;
};

export type ProjectStatus = "active" | "completed" | "archived";

export type Project = {
  id: string;
  title: string;
  description: string | null;
  studentIds: string[];
  students?: { id: string; email: string; fullName: string }[];
  status: ProjectStatus;
  deadline: string | null;
  deployedUrl?: string | null;
  submittedAt?: string | null;
  reviewStatus?: "accepted" | "declined" | null;
  reviewComment?: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
};

export type InAppNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  link?: string;
  read: boolean;
  forRole?: string;
  createdAt: string;
};

export type CustomFormDecision = "pending" | "approved" | "rejected";

export type CustomFormResponse = {
  id: string;
  formId: string;
  studentId: string;
  answers: Record<string, string | number | string[]>;
  fieldDecisions?: Record<string, CustomFormDecision>;
  fieldNotes?: Record<string, string>;
  reviewedBy: string | null;
  reviewedAt: string | null;
  submittedAt: string;
  updatedAt?: string;
  updateCount?: number;
  /** @deprecated Use fieldDecisions instead. Retained for legacy records. */
  decision?: CustomFormDecision;
  /** @deprecated Use fieldNotes instead. Retained for legacy records. */
  reviewNotes?: string | null;
};
