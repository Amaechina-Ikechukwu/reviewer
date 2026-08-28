import { randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { AuthenticatedRequest } from "../../middleware/auth";
import { isStaff } from "../../utils/jwt";
import { audit } from "../services/audit";
import { readSubmissionFiles } from "../../services/code-reader";
import { sendGradeRelease, sendSubmissionNotification, sendResubmissionNotification } from "../../services/email";
import { extractZipBuffer, savePdfBuffer } from "../../services/file-extractor";
import { cloneGithubRepo } from "../../services/github";
import { isWithinDeadline } from "../../utils/deadline";
import { json } from "../../utils/json";
import { hashPassword } from "../../utils/password";
import { data } from "../data";
import { COLLECTIONS, storageUpload, storageDownload, storageDelete } from "../firebase";

const TMP_DIR = "/tmp/submissions";
const MAX_FILE_SIZE = Number(process.env.MAX_FILE_SIZE || 104_857_600);

type ImportEntry = { fullName?: string; email?: string; githubUrl?: string };

function generatePassword() {
  return `Std-${randomBytes(5).toString("base64url")}`;
}

function slugifyName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "") || "student";
}

function normalizeGithubUrl(value?: string | null) {
  const trimmed = value?.trim() || "";
  if (!trimmed) return "";
  const noLabel = trimmed.replace(/^(link|github|repo|repository)\s*:\s*/i, "").trim();
  if (/^https?:\/\/github\.com\/[^\s]+$/i.test(noLabel)) return noLabel;
  const m1 = noLabel.match(/^([a-z0-9_.-]+\/[a-z0-9_.-]+(?:\.git)?)$/i);
  if (m1) return `https://github.com/${m1[1]}`;
  const m2 = noLabel.match(/github\.com\/([a-z0-9_.-]+\/[a-z0-9_.-]+(?:\.git)?)/i);
  if (m2) return `https://github.com/${m2[1]}`;
  return noLabel;
}

async function createHistoricalEmail(fullName: string) {
  const base = slugifyName(fullName);
  for (let i = 1; i <= 100; i++) {
    const email = i === 1 ? `${base}@historical.reviewai.local` : `${base}.${i}@historical.reviewai.local`;
    const exists = await data.findOne(COLLECTIONS.users, [["email", "==", email]]);
    if (!exists) return email;
  }
  return `${base}.${randomUUID()}@historical.reviewai.local`;
}

const isHistorical = (e: string) => e.endsWith("@historical.reviewai.local");

function normalizeName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}
function nameMatchScore(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return 1;
  const ta = new Set(na.split(" "));
  const tb = new Set(nb.split(" "));
  const inter = [...ta].filter((t) => tb.has(t)).length;
  const union = new Set([...ta, ...tb]).size;
  return inter / union;
}
async function findStudentByFuzzyName(fullName: string) {
  const all = await data.findMany<any>(COLLECTIONS.users, { where: [["role", "==", "student"]] });
  let best: any = null;
  let bestScore = 0;
  for (const s of all) {
    const score = nameMatchScore(fullName, s.fullName);
    if (score > bestScore) { bestScore = score; best = s; }
  }
  return bestScore >= 0.4 ? best : null;
}

async function removeFiles(filePath?: string | null) {
  if (!filePath || !existsSync(filePath)) return;
  await rm(filePath, { recursive: true, force: true });
}

/** Students may read their own submission, and any submission belonging to a
 * group they are a member of. Staff may read all of them. */
async function canReadSubmission(user: { userId: string; role: string }, submission: any) {
  if (isStaff(user.role)) return true;
  if (submission.studentId === user.userId) return true;
  if (!submission.groupId) return false;
  const group = await data.getById<any>(COLLECTIONS.assignmentGroups, submission.groupId);
  return !!group && (group.memberIds || []).includes(user.userId);
}

/**
 * The students an assignment is set for: its cohort, or everyone when the
 * assignment is global, minus anyone the teacher excluded. Students with a
 * pending invite stay on the list — they are still expected to do the work.
 */
async function assignmentAudience(assignment: any) {
  const where: any[] = [["role", "==", "student"]];
  if (assignment.cohortId) where.push(["cohortId", "==", assignment.cohortId]);
  const students = await data.findMany<any>(COLLECTIONS.users, { where });
  const excluded = new Set<string>(assignment.excludedStudentIds ?? []);
  return students.filter((student) => !excluded.has(student.id));
}

const byFullName = (a: any, b: any) => String(a.fullName || "").localeCompare(String(b.fullName || ""));

/**
 * Reads the submission's files, restoring them from object storage or
 * re-cloning the repo when the ephemeral /tmp copy is gone.
 */
async function resolveSubmissionFiles(submission: any): Promise<{ files: any[]; warning?: string }> {
  // Nothing was ever uploaded when a teacher marked the work complete.
  if (submission.submissionType === "manual") {
    return { files: [], warning: "Marked complete by an instructor — no files were submitted." };
  }

  let filePath = submission.filePath;

  if (!filePath || !existsSync(filePath)) {
    const dest = join(TMP_DIR, submission.id);

    if (submission.storageKey) {
      try {
        const rawBuffer = await storageDownload(submission.storageKey);
        if (submission.storageKey.endsWith(".pdf")) {
          await savePdfBuffer(rawBuffer, "submission.pdf", dest);
        } else {
          await extractZipBuffer(rawBuffer, dest);
        }
      } catch (err) {
        console.error("[v2.submissions] Storage restore failed:", err);
        return { files: [], warning: "Uploaded files could not be restored from storage." };
      }
    } else if (submission.githubUrl) {
      try {
        await cloneGithubRepo(submission.githubUrl, dest);
      } catch (err) {
        console.error("[v2.submissions] Re-clone failed:", err instanceof Error ? err.message : String(err));
        return { files: [], warning: "Could not fetch files — repository may be private or unavailable." };
      }
    } else {
      return { files: [], warning: "Uploaded files are no longer available on this server." };
    }

    filePath = dest;
    await data.update(COLLECTIONS.submissions, submission.id, { filePath });
  }

  return { files: await readSubmissionFiles(filePath) };
}

export const submissionRoutes = {
  async create(request: Request) {
    const user = (request as AuthenticatedRequest).user;
    if (user.role !== "student") return json({ error: "Only students can submit assignments." }, 403);

    const ct = request.headers.get("content-type") || "";
    let assignmentId = "";
    let submissionType: "github" | "file_upload";
    let githubUrl: string | null = null;
    let uploadedFile: File | null = null;

    if (ct.includes("multipart/form-data")) {
      const fd = await request.formData();
      assignmentId = String(fd.get("assignmentId") || "");
      submissionType = "file_upload";
      uploadedFile = fd.get("file") as File | null;
    } else {
      const body = await request.json() as { assignmentId?: string; githubUrl?: string };
      assignmentId = String(body.assignmentId || "");
      submissionType = "github";
      githubUrl = body.githubUrl?.trim() || null;
    }

    if (!assignmentId) return json({ error: "Assignment is required." }, 400);

    const assignment = await data.getById<any>(COLLECTIONS.assignments, assignmentId);
    if (!assignment) return json({ error: "Assignment not found." }, 404);

    if (submissionType === "github" && !assignment.allowGithub) return json({ error: "GitHub submissions are not enabled for this assignment." }, 400);
    if (submissionType === "file_upload" && !assignment.allowFileUpload) return json({ error: "File uploads are not enabled for this assignment." }, 400);
    if (uploadedFile && uploadedFile.size > MAX_FILE_SIZE) return json({ error: "Uploaded file is too large." }, 400);
    if (uploadedFile && !uploadedFile.name.toLowerCase().endsWith(".zip") && !uploadedFile.name.toLowerCase().endsWith(".pdf")) {
      return json({ error: "Only .zip and .pdf uploads are supported." }, 400);
    }

    const deadline = isWithinDeadline(new Date(assignment.opensAt), new Date(assignment.closesAt));
    if (!deadline.canSubmit) {
      const ov = await data.findOne<any>(COLLECTIONS.submissionOverrides, [
        ["studentId", "==", user.userId],
        ["assignmentId", "==", assignmentId],
      ]);
      if (!ov) return json({ error: deadline.reason }, 400);
      if (ov.closesAt && new Date() > new Date(ov.closesAt)) return json({ error: "Your extended deadline has also passed." }, 400);
    }

    // A teacher's completion tick stands in for a submission that was never
    // made, so it must not block the student from handing real work in later.
    // The grade already given moves across to the real submission.
    let carriedReview: any = null;
    async function replaceStandIn(previous: any) {
      carriedReview = await data.findOne<any>(COLLECTIONS.reviews, [["submissionId", "==", previous.id]]);
      await data.delMany(COLLECTIONS.reviews, [["submissionId", "==", previous.id]]);
      await data.del(COLLECTIONS.submissions, previous.id);
    }

    let groupId: string | null = null;
    if (assignment.isGroupAssignment) {
      const groups = await data.findMany<any>(COLLECTIONS.assignmentGroups, {
        where: [["assignmentId", "==", assignmentId]],
      });
      const myGroup = groups.find((g) => (g.memberIds || []).includes(user.userId));
      if (!myGroup) return json({ error: "You are not assigned to a group for this project." }, 403);
      groupId = myGroup.id;

      const previousGroup = await data.findOne<any>(COLLECTIONS.submissions, [
        ["assignmentId", "==", assignmentId],
        ["groupId", "==", groupId],
      ]);
      if (previousGroup) {
        if (previousGroup.submissionType === "manual") {
          await replaceStandIn(previousGroup);
        } else {
          if (previousGroup.studentId !== user.userId) {
            return json({ error: "Your group has already submitted. Only the original submitter can update it." }, 409);
          }
          await removeFiles(previousGroup.filePath);
          if (previousGroup.storageKey) await storageDelete(previousGroup.storageKey).catch(() => {});
          await data.delMany(COLLECTIONS.reviews, [["submissionId", "==", previousGroup.id]]);
          await data.del(COLLECTIONS.submissions, previousGroup.id);
        }
      }
    } else {
      const previous = await data.findOne<any>(COLLECTIONS.submissions, [
        ["assignmentId", "==", assignmentId],
        ["studentId", "==", user.userId],
      ]);
      if (previous) {
        if (previous.submissionType !== "manual") {
          return json({ error: "You have already submitted for this assignment." }, 409);
        }
        await replaceStandIn(previous);
      }
    }

    const submissionId = randomUUID();
    let filePath: string | null = null;
    let storageKey: string | null = null;

    if (submissionType === "file_upload") {
      if (!uploadedFile) return json({ error: "Please attach a ZIP or PDF file." }, 400);
      const isPdf = uploadedFile.name.toLowerCase().endsWith(".pdf");
      const ext = isPdf ? "pdf" : "zip";
      const rawBuffer = Buffer.from(await uploadedFile.arrayBuffer());
      const dest = join(TMP_DIR, submissionId);
      if (isPdf) {
        await savePdfBuffer(rawBuffer, uploadedFile.name, dest);
      } else {
        await extractZipBuffer(rawBuffer, dest);
      }
      filePath = dest;
      storageKey = `submissions/${submissionId}.${ext}`;
      await storageUpload(storageKey, rawBuffer, isPdf ? "application/pdf" : "application/zip").catch(console.error);
    } else {
      if (!githubUrl) return json({ error: "Please provide a GitHub URL." }, 400);
    }

    const submission = await data.insert<any>(COLLECTIONS.submissions, submissionId, {
      assignmentId,
      studentId: user.userId,
      groupId,
      submissionType,
      githubUrl,
      filePath,
      storageKey,
      submittedAt: new Date(),
      isLate: false,
    });

    if (carriedReview) {
      await data.insert<any>(COLLECTIONS.reviews, randomUUID(), {
        submissionId,
        status: "completed",
        maxScore: carriedReview.maxScore ?? assignment.maxScore,
        aiScore: null,
        teacherOverrideScore: carriedReview.teacherOverrideScore ?? null,
        feedback: carriedReview.feedback ?? null,
        rawAiResponse: null,
        reviewedAt: carriedReview.reviewedAt ?? null,
        markedDoneAt: carriedReview.markedDoneAt ?? null,
        markedDoneBy: carriedReview.markedDoneBy ?? null,
      });
    }

    const teacher = await data.getById<any>(COLLECTIONS.users, assignment.createdBy);
    if (teacher) {
      const student = await data.getById<any>(COLLECTIONS.users, user.userId);
      sendSubmissionNotification(teacher, { fullName: student?.fullName || "A student" }, assignment, submissionId).catch(console.error);
    }

    audit({ actorId: user.userId, action: "submission.created", targetType: "submission", targetId: submissionId, details: { assignmentId, submissionType } });
    return json(submission, 201);
  },

  async submitForStudent(request: Request) {
    const actor = (request as AuthenticatedRequest).user;
    if (!isStaff(actor.role)) return json({ error: "Access denied." }, 403);

    const ct = request.headers.get("content-type") || "";
    let assignmentId = "";
    let studentId = "";
    let submissionType: "github" | "file_upload";
    let githubUrl: string | null = null;
    let uploadedFile: File | null = null;

    if (ct.includes("multipart/form-data")) {
      const fd = await request.formData();
      assignmentId = String(fd.get("assignmentId") || "");
      studentId = String(fd.get("studentId") || "");
      submissionType = "file_upload";
      uploadedFile = fd.get("file") as File | null;
    } else {
      const body = await request.json() as { studentId?: string; assignmentId?: string; githubUrl?: string };
      assignmentId = String(body.assignmentId || "");
      studentId = String(body.studentId || "");
      submissionType = "github";
      githubUrl = body.githubUrl?.trim() || null;
    }

    if (!studentId || !assignmentId) return json({ error: "studentId and assignmentId are required." }, 400);

    const student = await data.getById<any>(COLLECTIONS.users, studentId);
    if (!student || student.role !== "student") return json({ error: "Student not found." }, 404);

    const assignment = await data.getById<any>(COLLECTIONS.assignments, assignmentId);
    if (!assignment) return json({ error: "Assignment not found." }, 404);

    if (submissionType === "github" && !assignment.allowGithub) return json({ error: "GitHub submissions are not enabled for this assignment." }, 400);
    if (submissionType === "file_upload" && !assignment.allowFileUpload) return json({ error: "File uploads are not enabled for this assignment." }, 400);
    if (uploadedFile && uploadedFile.size > MAX_FILE_SIZE) return json({ error: "Uploaded file is too large." }, 400);
    if (uploadedFile && !uploadedFile.name.toLowerCase().endsWith(".zip") && !uploadedFile.name.toLowerCase().endsWith(".pdf")) {
      return json({ error: "Only .zip and .pdf uploads are supported." }, 400);
    }

    let normalizedGithubUrl = null;
    if (submissionType === "github") {
      normalizedGithubUrl = normalizeGithubUrl(githubUrl);
      if (!normalizedGithubUrl) return json({ error: "A GitHub URL is required." }, 400);
    }

    let groupId: string | null = null;
    if (assignment.isGroupAssignment) {
      const groups = await data.findMany<any>(COLLECTIONS.assignmentGroups, {
        where: [["assignmentId", "==", assignmentId]],
      });
      const studentGroup = groups.find((g) => (g.memberIds || []).includes(studentId));
      if (!studentGroup) return json({ error: `${student.fullName} is not in a group for this assignment.` }, 400);
      groupId = studentGroup.id;
      const existingGroup = await data.findOne(COLLECTIONS.submissions, [["assignmentId", "==", assignmentId], ["groupId", "==", groupId]]);
      if (existingGroup) {
        await removeFiles(existingGroup.filePath);
        if (existingGroup.storageKey) await storageDelete(existingGroup.storageKey).catch(() => {});
        await data.delMany(COLLECTIONS.reviews, [["submissionId", "==", existingGroup.id]]);
        await data.del(COLLECTIONS.submissions, existingGroup.id);
      }
    } else {
      const existing = await data.findOne(COLLECTIONS.submissions, [["assignmentId", "==", assignmentId], ["studentId", "==", studentId]]);
      if (existing) {
        await removeFiles(existing.filePath);
        if (existing.storageKey) await storageDelete(existing.storageKey).catch(() => {});
        await data.delMany(COLLECTIONS.reviews, [["submissionId", "==", existing.id]]);
        await data.del(COLLECTIONS.submissions, existing.id);
      }
    }

    const submissionId = randomUUID();
    let filePath: string | null = null;
    let storageKey: string | null = null;

    if (submissionType === "file_upload") {
      if (!uploadedFile) return json({ error: "Please attach a ZIP or PDF file." }, 400);
      const isPdf = uploadedFile.name.toLowerCase().endsWith(".pdf");
      const ext = isPdf ? "pdf" : "zip";
      const rawBuffer = Buffer.from(await uploadedFile.arrayBuffer());
      const dest = join(TMP_DIR, submissionId);
      if (isPdf) {
        await savePdfBuffer(rawBuffer, uploadedFile.name, dest);
      } else {
        await extractZipBuffer(rawBuffer, dest);
      }
      filePath = dest;
      storageKey = `submissions/${submissionId}.${ext}`;
      await storageUpload(storageKey, rawBuffer, isPdf ? "application/pdf" : "application/zip").catch(console.error);
    }

    const submission = await data.insert<any>(COLLECTIONS.submissions, submissionId, {
      assignmentId,
      studentId,
      groupId,
      submissionType,
      githubUrl: normalizedGithubUrl,
      filePath,
      storageKey,
      submittedAt: new Date(),
      isLate: false,
    });

    audit({ actorId: actor.userId, action: "submission.created_by_teacher", targetType: "submission", targetId: submissionId, details: { studentId, assignmentId, submissionType, githubUrl: normalizedGithubUrl } });
    return json(submission, 201);
  },

  async list(request: Request) {
    const url = new URL(request.url);
    const user = (request as AuthenticatedRequest).user;
    const assignmentId = url.searchParams.get("assignment_id");
    const date = url.searchParams.get("date");

    const where: any[] = [];
    if (assignmentId) where.push(["assignmentId", "==", assignmentId]);
    if (date) {
      where.push(["submittedAt", ">=", new Date(`${date}T00:00:00`)]);
      where.push(["submittedAt", "<=", new Date(`${date}T23:59:59.999`)]);
    }

    let subs = await data.findMany<any>(COLLECTIONS.submissions, {
      where: where.length ? where : undefined,
      orderBy: ["submittedAt", "desc"],
    });

    if (user.role === "student") {
      const myGroups = await data.findMany<any>(COLLECTIONS.assignmentGroups, {
        where: [["memberIds", "array-contains", user.userId]],
      });
      const myGroupIds = new Set(myGroups.map((g) => g.id));
      subs = subs.filter((s) => s.studentId === user.userId || (s.groupId && myGroupIds.has(s.groupId)));
    }

    // Hydrate student + assignment fields (mirror the LEFT JOIN result shape)
    const studentIds = [...new Set(subs.map((s) => s.studentId))];
    const assignmentIds = [...new Set(subs.map((s) => s.assignmentId))];
    const [students, assignments] = await Promise.all([
      Promise.all(studentIds.map((id) => data.getById<any>(COLLECTIONS.users, id))),
      Promise.all(assignmentIds.map((id) => data.getById<any>(COLLECTIONS.assignments, id))),
    ]);
    const sMap = new Map(students.filter(Boolean).map((s) => [s!.id, s]));
    const aMap = new Map(assignments.filter(Boolean).map((a) => [a!.id, a]));

    const rows = subs.map((submission) => {
      const s = sMap.get(submission.studentId);
      const a = aMap.get(submission.assignmentId);
      return {
        submission,
        studentName: s?.fullName || null,
        studentEmail: s?.email || null,
        assignmentTitle: a?.title || null,
        assignmentDefaultProvider: a?.defaultProvider || null,
      };
    });

    return json(rows);
  },

  async get(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    const submission = await data.getById<any>(COLLECTIONS.submissions, params.id);
    if (!submission) return json({ error: "Submission not found." }, 404);
    if (!(await canReadSubmission(user, submission))) return json({ error: "Forbidden" }, 403);

    const [assignment, student] = await Promise.all([
      data.getById<any>(COLLECTIONS.assignments, submission.assignmentId),
      data.getById<any>(COLLECTIONS.users, submission.studentId),
    ]);

    return json({
      submission,
      assignment,
      studentName: student?.fullName || null,
      studentEmail: student?.email || null,
    });
  },

  async getFiles(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    const submission = await data.getById<any>(COLLECTIONS.submissions, params.id);
    if (!submission) return json({ error: "Submission not found." }, 404);
    if (!(await canReadSubmission(user, submission))) return json({ error: "Forbidden" }, 403);

    return json(await resolveSubmissionFiles(submission));
  },

  /** Mints (or returns) the unguessable token behind a submission's public link. */
  async share(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    const submission = await data.getById<any>(COLLECTIONS.submissions, params.id);
    if (!submission) return json({ error: "Submission not found." }, 404);
    if (!(await canReadSubmission(user, submission))) return json({ error: "Forbidden" }, 403);

    if (submission.shareToken) return json({ shareToken: submission.shareToken });

    const shareToken = randomBytes(16).toString("base64url");
    await data.update(COLLECTIONS.submissions, submission.id, { shareToken, sharedAt: new Date() });

    audit({ actorId: user.userId, action: "submission.shared", targetType: "submission", targetId: submission.id });
    return json({ shareToken });
  },

  async unshare(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    const submission = await data.getById<any>(COLLECTIONS.submissions, params.id);
    if (!submission) return json({ error: "Submission not found." }, 404);
    if (!(await canReadSubmission(user, submission))) return json({ error: "Forbidden" }, 403);

    await data.update(COLLECTIONS.submissions, submission.id, { shareToken: null, sharedAt: null });

    audit({ actorId: user.userId, action: "submission.unshared", targetType: "submission", targetId: submission.id });
    return json({ shareToken: null });
  },

  /**
   * Unauthenticated read of a shared submission. Only the work itself is
   * exposed — never the grade, the AI review, or the student's email.
   */
  async getPublic(_request: Request, params: Record<string, string>) {
    const token = params.token?.trim();
    if (!token) return json({ error: "Submission not found." }, 404);

    const submission = await data.findOne<any>(COLLECTIONS.submissions, [["shareToken", "==", token]]);
    if (!submission) return json({ error: "This link is no longer available." }, 404);

    const [assignment, student, { files, warning }] = await Promise.all([
      data.getById<any>(COLLECTIONS.assignments, submission.assignmentId),
      data.getById<any>(COLLECTIONS.users, submission.studentId),
      resolveSubmissionFiles(submission),
    ]);

    return json({
      id: submission.id,
      submittedAt: submission.submittedAt,
      submissionType: submission.submissionType,
      githubUrl: submission.githubUrl,
      assignmentTitle: assignment?.title || null,
      studentName: student?.fullName || null,
      files,
      warning,
    });
  },

  async import(request: Request) {
    const user = (request as AuthenticatedRequest).user;
    if (!isStaff(user.role)) return json({ error: "Access denied." }, 403);

    const body = await request.json().catch(() => ({})) as {
      assignmentId?: string; assignmentTitle?: string; entries?: ImportEntry[];
    };

    const entries = body.entries || [];
    if (entries.length === 0) return json({ error: "At least one import entry is required." }, 400);

    let assignment: any;
    if (body.assignmentId?.trim()) {
      assignment = await data.getById<any>(COLLECTIONS.assignments, body.assignmentId.trim());
      if (!assignment) return json({ error: "Assignment not found." }, 404);
    } else if (body.assignmentTitle?.trim()) {
      const titleSearch = body.assignmentTitle.trim().toLowerCase();
      const all = await data.findMany<any>(COLLECTIONS.assignments, {});
      assignment = all.find((a) => String(a.title).toLowerCase().includes(titleSearch));
      if (!assignment) return json({ error: `No assignment found matching "${body.assignmentTitle}".` }, 404);
    } else {
      return json({ error: "Provide assignmentTitle to identify the assignment." }, 400);
    }

    if (!assignment.allowGithub) return json({ error: "This assignment does not allow GitHub submissions." }, 400);

    const results: any[] = [];
    for (const entry of entries) {
      const fullName = entry.fullName?.trim();
      const githubUrl = normalizeGithubUrl(entry.githubUrl);
      const email = entry.email?.trim().toLowerCase();
      if (!fullName || !githubUrl) return json({ error: "Each import row must include full name and GitHub URL." }, 400);

      let student: any = null;
      let resolvedEmail = email || "";
      let mappedByFuzzy = false;

      if (email) student = await data.findOne<any>(COLLECTIONS.users, [["email", "==", email]]);
      if (!student) {
        const all = await data.findMany<any>(COLLECTIONS.users, { where: [["role", "==", "student"]] });
        student = all.find((u) => String(u.fullName).toLowerCase() === fullName.toLowerCase()) || null;
      }
      if (!student) {
        const fuzzy = await findStudentByFuzzyName(fullName);
        if (fuzzy) { student = fuzzy; mappedByFuzzy = true; }
      }

      if (student) resolvedEmail = student.email;
      else resolvedEmail = email || await createHistoricalEmail(fullName);

      let createdStudent = false;
      if (student && student.role !== "student") {
        return json({ error: `The account for ${resolvedEmail} already exists and is not a student account.` }, 400);
      }

      if (!student) {
        const password = generatePassword();
        const newId = randomUUID();
        student = await data.insert<any>(COLLECTIONS.users, newId, {
          email: resolvedEmail,
          fullName,
          passwordHash: await hashPassword(password),
          role: "student",
          joinCode: null,
          teacherId: null,
        });
        createdStudent = true;
      }

      const previous = await data.findOne<any>(COLLECTIONS.submissions, [["assignmentId", "==", assignment.id], ["studentId", "==", student.id]]);
      if (previous) {
        await removeFiles(previous.filePath);
        await data.delMany(COLLECTIONS.reviews, [["submissionId", "==", previous.id]]);
        await data.del(COLLECTIONS.submissions, previous.id);
      }

      const submissionId = randomUUID();
      const dest = join(TMP_DIR, submissionId);
      await cloneGithubRepo(githubUrl, dest);

      const submission = await data.insert<any>(COLLECTIONS.submissions, submissionId, {
        assignmentId: assignment.id,
        studentId: student.id,
        submissionType: "github",
        githubUrl,
        filePath: dest,
        submittedAt: new Date(),
        isLate: false,
      });

      results.push({
        email: email || (resolvedEmail && !isHistorical(resolvedEmail) ? resolvedEmail : undefined),
        fullName: student.fullName,
        githubUrl,
        createdStudent,
        mappedByFuzzy,
        submissionId: submission.id,
      });
    }

    return json({ imported: results }, 201);
  },

  /**
   * Every student the assignment is set for, with whatever they have so far:
   * a submission, a grade, or nothing. Assignments that are handed in offline
   * (a design critique, a presentation, a printed report) never produce a
   * submission at all, so the roster — not the submissions list — is what a
   * teacher grades from.
   */
  async roster(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    if (!isStaff(user.role)) return json({ error: "Access denied." }, 403);

    const assignment = await data.getById<any>(COLLECTIONS.assignments, params.id);
    if (!assignment) return json({ error: "Assignment not found." }, 404);

    const [audience, submissions, groups] = await Promise.all([
      assignmentAudience(assignment),
      data.findMany<any>(COLLECTIONS.submissions, { where: [["assignmentId", "==", params.id]] }),
      assignment.isGroupAssignment
        ? data.findMany<any>(COLLECTIONS.assignmentGroups, { where: [["assignmentId", "==", params.id]] })
        : Promise.resolve([] as any[]),
    ]);

    // Someone who submitted and has since moved cohort still belongs here —
    // dropping them would hide a grade that has already been given.
    const students = new Map<string, any>(audience.map((student) => [student.id, student]));
    const strays = [...new Set(submissions.map((s) => s.studentId).filter((id) => id && !students.has(id)))];
    for (const extra of await Promise.all(strays.map((id) => data.getById<any>(COLLECTIONS.users, id)))) {
      if (extra) students.set(extra.id, extra);
    }

    const reviews = await Promise.all(
      submissions.map((s) => data.findOne<any>(COLLECTIONS.reviews, [["submissionId", "==", s.id]])),
    );
    const reviewFor = new Map<string, any>(submissions.map((s, index) => [s.id, reviews[index]]));
    const groupOf = new Map<string, any>();
    for (const group of groups) for (const memberId of group.memberIds || []) groupOf.set(memberId, group);

    const rows = [...students.values()].sort(byFullName).map((student) => {
      const group = groupOf.get(student.id) || null;
      const submission =
        submissions.find((s) => s.studentId === student.id) ||
        (group ? submissions.find((s) => s.groupId === group.id) : null) ||
        null;
      const review = submission ? reviewFor.get(submission.id) : null;
      const score = review ? review.teacherOverrideScore ?? review.aiScore : null;

      return {
        studentId: student.id,
        fullName: student.fullName,
        email: student.email,
        groupId: group?.id ?? null,
        groupName: group?.name ?? null,
        submissionId: submission?.id ?? null,
        submissionType: submission?.submissionType ?? null,
        submittedAt: submission?.submittedAt ?? null,
        isLate: submission?.isLate ?? false,
        /** The grade comes from a teammate's upload, not this student's own. */
        viaGroup: !!(submission && group && submission.studentId !== student.id),
        reviewStatus: review?.status ?? "not_started",
        score: typeof score === "number" ? score : null,
        scoredByTeacher: typeof review?.teacherOverrideScore === "number",
        markedDone: !!review?.markedDoneAt,
        maxScore: review?.maxScore ?? assignment.maxScore,
      };
    });

    return json({ maxScore: assignment.maxScore, students: rows });
  },

  /**
   * Marks students' work complete, with or without a score. Where nothing was
   * submitted this stands in a `manual` submission so the grade hangs off the
   * same record every other part of the app already reads.
   */
  async mark(request: Request, params: Record<string, string>) {
    const actor = (request as AuthenticatedRequest).user;
    if (!isStaff(actor.role)) return json({ error: "Access denied." }, 403);

    const body = (await request.json().catch(() => ({}))) as {
      studentIds?: string[];
      studentId?: string;
      score?: number | string | null;
      note?: string;
      notify?: boolean;
    };

    const studentIds = [...new Set((body.studentIds ?? (body.studentId ? [body.studentId] : [])).filter(Boolean))];
    if (studentIds.length === 0) return json({ error: "Select at least one student to mark." }, 400);

    const assignment = await data.getById<any>(COLLECTIONS.assignments, params.id);
    if (!assignment) return json({ error: "Assignment not found." }, 404);

    const maxScore = assignment.maxScore ?? 100;
    const rawScore = body.score;
    const hasScore = rawScore !== undefined && rawScore !== null && String(rawScore).trim() !== "";
    const score = hasScore ? Number(rawScore) : null;
    if (hasScore && (!Number.isFinite(score) || score! < 0)) return json({ error: "Please provide a valid score." }, 400);
    if (hasScore && score! > maxScore) return json({ error: `Score cannot exceed the max score of ${maxScore}.` }, 400);

    const note = body.note?.trim() || null;
    const groups = assignment.isGroupAssignment
      ? await data.findMany<any>(COLLECTIONS.assignmentGroups, { where: [["assignmentId", "==", params.id]] })
      : [];

    const marked: any[] = [];
    const skipped: { studentId: string; reason: string }[] = [];

    for (const studentId of studentIds) {
      const student = await data.getById<any>(COLLECTIONS.users, studentId);
      if (!student || student.role !== "student") {
        skipped.push({ studentId, reason: "Student not found." });
        continue;
      }

      const group = groups.find((g) => (g.memberIds || []).includes(studentId)) || null;
      let submission =
        (await data.findOne<any>(COLLECTIONS.submissions, [
          ["assignmentId", "==", params.id],
          ["studentId", "==", studentId],
        ])) ||
        (group
          ? await data.findOne<any>(COLLECTIONS.submissions, [
              ["assignmentId", "==", params.id],
              ["groupId", "==", group.id],
            ])
          : null);

      if (!submission) {
        submission = await data.insert<any>(COLLECTIONS.submissions, randomUUID(), {
          assignmentId: params.id,
          studentId,
          groupId: group?.id ?? null,
          submissionType: "manual",
          githubUrl: null,
          filePath: null,
          storageKey: null,
          submittedAt: new Date(),
          isLate: false,
          markedBy: actor.userId,
        });
      }

      let review = await data.findOne<any>(COLLECTIONS.reviews, [["submissionId", "==", submission.id]]);
      if (!review) {
        review = await data.insert<any>(COLLECTIONS.reviews, randomUUID(), {
          submissionId: submission.id,
          status: "completed",
          maxScore,
          aiScore: null,
          teacherOverrideScore: null,
          feedback: null,
          rawAiResponse: null,
          reviewedAt: null,
        });
      }

      await data.update(COLLECTIONS.reviews, review.id, {
        status: "completed",
        maxScore,
        markedDoneAt: new Date(),
        markedDoneBy: actor.userId,
        reviewedAt: new Date(),
        ...(hasScore ? { teacherOverrideScore: Math.round(score!) } : {}),
        ...(note ? { feedback: { ...(review.feedback ?? {}), summary: note } } : {}),
      });

      // A completion tick is not news worth emailing about; a grade is.
      if (hasScore && body.notify !== false && !String(student.email).endsWith("@historical.reviewai.local")) {
        sendGradeRelease(
          { email: student.email, fullName: student.fullName },
          { title: assignment.title ?? "Assignment", id: params.id },
          {
            score: Math.round(score!),
            maxScore,
            feedback: note || (review.feedback?.summary ?? null),
            suggestions: review.feedback?.suggestions ?? [],
          },
        ).catch(console.error);
      }

      marked.push({ studentId, submissionId: submission.id, score: hasScore ? Math.round(score!) : null });
    }

    audit({
      actorId: actor.userId,
      action: hasScore ? "submission.marked_scored" : "submission.marked_done",
      targetType: "assignment",
      targetId: params.id,
      details: { studentIds, score: hasScore ? Math.round(score!) : null, count: marked.length },
    });

    return json({ marked, skipped });
  },

  /**
   * Undoes a mark. A stand-in submission goes away entirely; a real one keeps
   * its files and only loses the grade the teacher put on top of it.
   */
  async unmark(request: Request, params: Record<string, string>) {
    const actor = (request as AuthenticatedRequest).user;
    if (!isStaff(actor.role)) return json({ error: "Access denied." }, 403);

    const groups = await data.findMany<any>(COLLECTIONS.assignmentGroups, {
      where: [["assignmentId", "==", params.id]],
    });
    const group = groups.find((g) => (g.memberIds || []).includes(params.studentId)) || null;
    const submission =
      (await data.findOne<any>(COLLECTIONS.submissions, [
        ["assignmentId", "==", params.id],
        ["studentId", "==", params.studentId],
      ])) ||
      (group
        ? await data.findOne<any>(COLLECTIONS.submissions, [
            ["assignmentId", "==", params.id],
            ["groupId", "==", group.id],
          ])
        : null);

    if (!submission) return json({ error: "Nothing to undo for this student." }, 404);

    if (submission.submissionType === "manual") {
      await data.delMany(COLLECTIONS.reviews, [["submissionId", "==", submission.id]]);
      await data.del(COLLECTIONS.submissions, submission.id);
      audit({
        actorId: actor.userId,
        action: "submission.unmarked",
        targetType: "assignment",
        targetId: params.id,
        details: { studentId: params.studentId, removedSubmission: true },
      });
      return json({ removed: true });
    }

    const review = await data.findOne<any>(COLLECTIONS.reviews, [["submissionId", "==", submission.id]]);
    if (review) {
      // With no AI result underneath, the whole review was the teacher's mark.
      if (typeof review.aiScore === "number") {
        await data.update(COLLECTIONS.reviews, review.id, {
          teacherOverrideScore: null,
          markedDoneAt: null,
          markedDoneBy: null,
        });
      } else {
        await data.del(COLLECTIONS.reviews, review.id);
      }
    }

    audit({
      actorId: actor.userId,
      action: "submission.unmarked",
      targetType: "assignment",
      targetId: params.id,
      details: { studentId: params.studentId, removedSubmission: false },
    });
    return json({ removed: false });
  },

  async delete(request: Request, params: Record<string, string>) {
    const actor = (request as AuthenticatedRequest).user;
    if (!isStaff(actor.role)) return json({ error: "Access denied." }, 403);

    const submission = await data.getById<any>(COLLECTIONS.submissions, params.id);
    if (!submission) return json({ error: "Submission not found." }, 404);

    await removeFiles(submission.filePath);
    if (submission.storageKey) await storageDelete(submission.storageKey).catch(() => {});
    await data.delMany(COLLECTIONS.reviews, [["submissionId", "==", submission.id]]);
    await data.del(COLLECTIONS.submissions, submission.id);

    const [student, assignment] = await Promise.all([
      data.getById<any>(COLLECTIONS.users, submission.studentId),
      data.getById<any>(COLLECTIONS.assignments, submission.assignmentId),
    ]);

    if (student && assignment) {
      sendResubmissionNotification(student, assignment).catch(console.error);
    }

    audit({
      actorId: actor.userId,
      action: "submission.deleted",
      targetType: "submission",
      targetId: submission.id,
      details: { studentId: submission.studentId, assignmentId: submission.assignmentId },
    });

    return json({ deleted: true });
  },
};
