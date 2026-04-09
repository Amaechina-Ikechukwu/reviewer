import { and, between, desc, eq, ilike, isNull } from "drizzle-orm";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { db } from "../db/connection";
import { assignments, reviews, submissionOverrides, submissions, users } from "../db/schema";
import type { AuthenticatedRequest } from "../middleware/auth";
import { readSubmissionFiles } from "../services/code-reader";
import { extractZip } from "../services/file-extractor";
import { cloneGithubRepo } from "../services/github";
import { isWithinDeadline } from "../utils/deadline";
import { json } from "../utils/json";
import { sendSubmissionNotification } from "../services/email";
import { hashPassword } from "../utils/password";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";
const MAX_FILE_SIZE = Number(process.env.MAX_FILE_SIZE || 52_428_800);

type ImportEntry = {
  fullName?: string;
  email?: string;
  githubUrl?: string;
};

function generatePassword() {
  return `Std-${randomBytes(5).toString("base64url")}`;
}

function slugifyName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    || "student";
}

function normalizeGithubUrl(value?: string | null) {
  const trimmed = value?.trim() || "";
  if (!trimmed) {
    return "";
  }

  const withoutLabel = trimmed.replace(/^(link|github|repo|repository)\s*:\s*/i, "").trim();

  if (/^https?:\/\/github\.com\/[^\s]+$/i.test(withoutLabel)) {
    return withoutLabel;
  }

  const shortMatch = withoutLabel.match(/^([a-z0-9_.-]+\/[a-z0-9_.-]+(?:\.git)?)$/i);
  if (shortMatch) {
    return `https://github.com/${shortMatch[1]}`;
  }

  const embeddedMatch = withoutLabel.match(/github\.com\/([a-z0-9_.-]+\/[a-z0-9_.-]+(?:\.git)?)/i);
  if (embeddedMatch) {
    return `https://github.com/${embeddedMatch[1]}`;
  }

  return withoutLabel;
}

async function createHistoricalEmail(fullName: string) {
  const base = slugifyName(fullName);

  for (let attempt = 1; attempt <= 100; attempt += 1) {
    const email = attempt === 1
      ? `${base}@historical.reviewai.local`
      : `${base}.${attempt}@historical.reviewai.local`;
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (!existing) {
      return email;
    }
  }

  return `${base}.${randomUUID()}@historical.reviewai.local`;
}

function isHistoricalEmail(email: string) {
  return email.endsWith("@historical.reviewai.local");
}

async function getAssignment(assignmentId: string) {
  const [assignment] = await db.select().from(assignments).where(eq(assignments.id, assignmentId)).limit(1);
  return assignment;
}

/** Normalize a name for fuzzy comparison: lowercase, collapse spaces, strip punctuation */
function normalizeName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

/** Score how well two names match (0–1). Uses token overlap so "Abuoma David" matches "David Abuoma" etc. */
function nameMatchScore(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return 1;

  const tokensA = new Set(na.split(" "));
  const tokensB = new Set(nb.split(" "));
  const intersection = [...tokensA].filter((t) => tokensB.has(t)).length;
  const union = new Set([...tokensA, ...tokensB]).size;
  return intersection / union;
}

/** Find the best-matching existing student for a given name. Returns null if no good match. */
async function findStudentByFuzzyName(fullName: string) {
  const allStudents = await db
    .select({ id: users.id, email: users.email, fullName: users.fullName, role: users.role, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.role, "student"));

  let best: (typeof allStudents)[0] | null = null;
  let bestScore = 0;

  for (const student of allStudents) {
    const score = nameMatchScore(fullName, student.fullName);
    if (score > bestScore) {
      bestScore = score;
      best = student;
    }
  }

  // Require at least first-name match (score ≥ 0.4) to count as a match
  return bestScore >= 0.4 ? best : null;
}

async function removeSubmissionFiles(filePath?: string | null) {
  if (!filePath || !existsSync(filePath)) {
    return;
  }

  await rm(filePath, { recursive: true, force: true });
}

export const submissionRoutes = {
  async create(request: Request) {
    const user = (request as AuthenticatedRequest).user;
    if (user.role !== "student") {
      return json({ error: "Only students can submit assignments." }, 403);
    }

    const contentType = request.headers.get("content-type") || "";
    let assignmentId = "";
    let submissionType: "github" | "file_upload";
    let githubUrl: string | null = null;
    let uploadedFile: File | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      assignmentId = String(formData.get("assignmentId") || "");
      submissionType = "file_upload";
      uploadedFile = formData.get("file") as File | null;
    } else {
      const body = await request.json() as { assignmentId?: string; githubUrl?: string };
      assignmentId = String(body.assignmentId || "");
      submissionType = "github";
      githubUrl = body.githubUrl?.trim() || null;
    }

    if (!assignmentId) {
      return json({ error: "Assignment is required." }, 400);
    }

    const assignment = await getAssignment(assignmentId);
    if (!assignment) {
      return json({ error: "Assignment not found." }, 404);
    }

    if (submissionType === "github" && !assignment.allowGithub) {
      return json({ error: "GitHub submissions are not enabled for this assignment." }, 400);
    }

    if (submissionType === "file_upload" && !assignment.allowFileUpload) {
      return json({ error: "ZIP uploads are not enabled for this assignment." }, 400);
    }

    if (uploadedFile && uploadedFile.size > MAX_FILE_SIZE) {
      return json({ error: "Uploaded file is too large." }, 400);
    }

    const deadline = isWithinDeadline(assignment.opensAt, assignment.closesAt);
    if (!deadline.canSubmit) {
      const [override] = await db
        .select({ id: submissionOverrides.id })
        .from(submissionOverrides)
        .where(and(eq(submissionOverrides.studentId, user.userId), eq(submissionOverrides.assignmentId, assignmentId)))
        .limit(1);
      if (!override) {
        return json({ error: deadline.reason }, 400);
      }
    }
    const isLate = false;

    const [previousSubmission] = await db
      .select({ id: submissions.id })
      .from(submissions)
      .where(and(eq(submissions.assignmentId, assignmentId), eq(submissions.studentId, user.userId)))
      .limit(1);

    if (previousSubmission) {
      return json({ error: "You have already submitted for this assignment." }, 409);
    }

    const submissionId = randomUUID();
    let filePath: string | null = null;

    if (submissionType === "file_upload") {
      if (!uploadedFile) {
        return json({ error: "Please attach a ZIP file." }, 400);
      }
      const destDir = join(UPLOAD_DIR, submissionId);
      await extractZip(uploadedFile, destDir);
      filePath = destDir;
    } else {
      if (!githubUrl) {
        return json({ error: "Please provide a GitHub URL." }, 400);
      }
      // GitHub repos are cloned at review time, not at submission time
    }

    const [submission] = await db
      .insert(submissions)
      .values({
        id: submissionId,
        assignmentId: assignment.id,
        studentId: user.userId,
        submissionType,
        githubUrl,
        filePath,
        isLate,
      })
      .returning();

    // Notify teacher
    const [teacher] = await db.select({ email: users.email, fullName: users.fullName })
      .from(users).where(eq(users.id, assignment.createdBy)).limit(1);
    if (teacher) {
      const [student] = await db.select({ fullName: users.fullName }).from(users).where(eq(users.id, user.userId)).limit(1);
      sendSubmissionNotification(teacher, { fullName: student?.fullName || "A student" }, assignment, submissionId).catch(console.error);
    }

    return json(submission, 201);
  },

  async list(request: Request) {
    const url = new URL(request.url);
    const user = (request as AuthenticatedRequest).user;
    const assignmentId = url.searchParams.get("assignment_id");
    const date = url.searchParams.get("date");

    const conditions: any[] = [];

    if (user.role === "student") {
      conditions.push(eq(submissions.studentId, user.userId));
    }

    if (assignmentId) {
      conditions.push(eq(submissions.assignmentId, assignmentId));
    }

    if (date) {
      const start = new Date(`${date}T00:00:00`);
      const end = new Date(`${date}T23:59:59.999`);
      conditions.push(between(submissions.submittedAt, start, end));
    }

    const whereClause = conditions.length > 1
      ? and(...conditions)
      : conditions.length === 1
        ? conditions[0]
        : undefined;

    const baseQuery = db
      .select({
        submission: submissions,
        studentName: users.fullName,
        studentEmail: users.email,
        assignmentTitle: assignments.title,
        assignmentDefaultProvider: assignments.defaultProvider,
      })
      .from(submissions)
      .leftJoin(users, eq(submissions.studentId, users.id))
      .leftJoin(assignments, eq(submissions.assignmentId, assignments.id));

    const rows = whereClause
      ? await baseQuery.where(whereClause).orderBy(desc(submissions.submittedAt))
      : await baseQuery.orderBy(desc(submissions.submittedAt));

    return json(rows);
  },

  async get(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;

    const [row] = await db
      .select({
        submission: submissions,
        assignment: assignments,
        studentName: users.fullName,
        studentEmail: users.email,
      })
      .from(submissions)
      .leftJoin(assignments, eq(submissions.assignmentId, assignments.id))
      .leftJoin(users, eq(submissions.studentId, users.id))
      .where(eq(submissions.id, params.id))
      .limit(1);

    if (!row) {
      return json({ error: "Submission not found." }, 404);
    }

    if (user.role === "student" && row.submission.studentId !== user.userId) {
      return json({ error: "Forbidden" }, 403);
    }

    return json(row);
  },

  async getFiles(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;

    const [submission] = await db.select().from(submissions).where(eq(submissions.id, params.id)).limit(1);
    if (!submission) {
      return json({ error: "Submission not found." }, 404);
    }

    if (user.role === "student" && submission.studentId !== user.userId) {
      return json({ error: "Forbidden" }, 403);
    }

    if (!submission.filePath) {
      return json({ files: [] });
    }

    const files = await readSubmissionFiles(submission.filePath);
    return json({ files });
  },

  async createForStudent(request: Request) {
    const user = (request as AuthenticatedRequest).user;
    if (user.role !== "teacher") {
      return json({ error: "Only teachers can submit on behalf of students." }, 403);
    }

    const body = await request.json() as { studentId?: string; assignmentId?: string; githubUrl?: string };
    const { studentId, assignmentId } = body;
    const githubUrl = body.githubUrl?.trim();

    if (!studentId || !assignmentId || !githubUrl) {
      return json({ error: "studentId, assignmentId, and githubUrl are required." }, 400);
    }

    const [student] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, studentId)).limit(1);
    if (!student || student.role !== "student") return json({ error: "Student not found." }, 404);

    const assignment = await getAssignment(assignmentId);
    if (!assignment) return json({ error: "Assignment not found." }, 404);
    if (!assignment.allowGithub) return json({ error: "This assignment does not allow GitHub submissions." }, 400);

    const normalizedUrl = normalizeGithubUrl(githubUrl);

    const [previousSubmission] = await db
      .select()
      .from(submissions)
      .where(and(eq(submissions.assignmentId, assignmentId), eq(submissions.studentId, studentId)))
      .limit(1);

    if (previousSubmission) {
      await removeSubmissionFiles(previousSubmission.filePath);
      await db.delete(reviews).where(eq(reviews.submissionId, previousSubmission.id));
      await db.delete(submissions).where(eq(submissions.id, previousSubmission.id));
    }

    const submissionId = randomUUID();

    const [submission] = await db
      .insert(submissions)
      .values({ id: submissionId, assignmentId: assignment.id, studentId, submissionType: "github", githubUrl: normalizedUrl, filePath: null, isLate: false })
      .returning();

    return json(submission, 201);
  },

  async import(request: Request) {
    const user = (request as AuthenticatedRequest).user;
    if (user.role !== "teacher") {
      return json({ error: "Only teachers can import submissions." }, 403);
    }

    const body = await request.json().catch(() => ({})) as {
      assignmentId?: string;
      assignmentTitle?: string;
      entries?: ImportEntry[];
    };

    const entries = body.entries || [];

    if (entries.length === 0) {
      return json({ error: "At least one import entry is required." }, 400);
    }

    let assignment;

    if (body.assignmentId?.trim()) {
      assignment = await getAssignment(body.assignmentId.trim());
      if (!assignment) return json({ error: "Assignment not found." }, 404);
    } else if (body.assignmentTitle?.trim()) {
      const titleSearch = body.assignmentTitle.trim();
      const [found] = await db
        .select()
        .from(assignments)
        .where(ilike(assignments.title, `%${titleSearch}%`))
        .limit(1);
      if (!found) return json({ error: `No assignment found matching "${titleSearch}".` }, 404);
      assignment = found;
    } else {
      return json({ error: "Provide assignmentTitle to identify the assignment." }, 400);
    }

    if (!assignment.allowGithub) {
      return json({ error: "This assignment does not allow GitHub submissions." }, 400);
    }

    const results: Array<{
      email?: string;
      fullName: string;
      githubUrl: string;
      createdStudent: boolean;
      submissionId: string;
    }> = [];

    for (const entry of entries) {
      const fullName = entry.fullName?.trim();
      const githubUrl = normalizeGithubUrl(entry.githubUrl);
      const email = entry.email?.trim().toLowerCase();

      if (!fullName || !githubUrl) {
        return json({ error: "Each import row must include full name and GitHub URL." }, 400);
      }

      let student;
      let resolvedEmail = email || "";
      let mappedByFuzzy = false;

      if (email) {
        // 1. Try exact email match
        [student] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      }

      if (!student) {
        // 2. Try exact name match (case-insensitive)
        [student] = await db
          .select()
          .from(users)
          .where(and(ilike(users.fullName, fullName), eq(users.role, "student")))
          .limit(1);
      }

      if (!student) {
        // 3. Fuzzy name match — catches "Abuoma David" vs "David Abuoma", initials, typos etc.
        const fuzzyMatch = await findStudentByFuzzyName(fullName);
        if (fuzzyMatch) {
          student = fuzzyMatch;
          mappedByFuzzy = true;
        }
      }

      if (student) {
        resolvedEmail = student.email;
      } else {
        resolvedEmail = email || await createHistoricalEmail(fullName);
      }

      let createdStudent = false;

      if (student && student.role !== "student") {
        return json({ error: `The account for ${resolvedEmail} already exists and is not a student account.` }, 400);
      }

      if (!student) {
        const password = generatePassword();
        const passwordHash = await hashPassword(password);

        [student] = await db
          .insert(users)
          .values({
            email: resolvedEmail,
            fullName,
            passwordHash,
            role: "student",
          })
          .returning();

        createdStudent = true;
      }

      const [previousSubmission] = await db
        .select()
        .from(submissions)
        .where(and(eq(submissions.assignmentId, assignmentId), eq(submissions.studentId, student.id)))
        .limit(1);

      if (previousSubmission) {
        await removeSubmissionFiles(previousSubmission.filePath);
        await db.delete(reviews).where(eq(reviews.submissionId, previousSubmission.id));
        await db.delete(submissions).where(eq(submissions.id, previousSubmission.id));
      }

      const submissionId = randomUUID();
      const destDir = join(UPLOAD_DIR, submissionId);
      await cloneGithubRepo(githubUrl, destDir);

      const [submission] = await db
        .insert(submissions)
        .values({
          id: submissionId,
          assignmentId,
          studentId: student.id,
          submissionType: "github",
          githubUrl,
          filePath: destDir,
          isLate: false,
        })
        .returning();

      results.push({
        email: email || (resolvedEmail && !isHistoricalEmail(resolvedEmail) ? resolvedEmail : undefined),
        fullName: student.fullName, // use the matched student's canonical name
        githubUrl,
        createdStudent,
        mappedByFuzzy,
        submissionId: submission.id,
      });
    }

    return json({ imported: results }, 201);
  },
};
