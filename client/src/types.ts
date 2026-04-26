export type Role = "student" | "teacher";
export type ProviderName = "gemini";
export type AssignmentSourceType = "manual" | "markdown" | "notion" | "mixed";

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
  createdBy: string;
  opensAt: string;
  closesAt: string;
  maxScore: number;
  allowGithub: boolean;
  allowFileUpload: boolean;
  defaultProvider: ProviderName;
  classNotes: string | null;
  createdAt: string;
};

export type Submission = {
  id: string;
  assignmentId: string;
  studentId: string;
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
};

export type StudentRecord = {
  id: string;
  email: string;
  fullName: string;
  role: "student";
  createdAt: string;
};
