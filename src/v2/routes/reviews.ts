import { existsSync } from "node:fs";
import { join } from "node:path";
import type { AuthenticatedRequest } from "../../middleware/auth";
import { isStaffOrGranted } from "../../utils/permissions";
import { audit } from "../services/audit";
import { getAvailableProviders, reviewCode, type ProviderName } from "../../services/ai/reviewer";
import type { ReviewAttachment } from "../../services/ai/provider";
import { readCodeFiles } from "../../services/code-reader";
import { extractZipBuffer, savePdfBuffer } from "../../services/file-extractor";
import { sendGradeRelease } from "../../services/email";
import { cloneGithubRepo } from "../../services/github";
import { json } from "../../utils/json";
import { randomUUID } from "node:crypto";
import { data } from "../data";
import { COLLECTIONS, storageDownload } from "../firebase";

const TMP_DIR = "/tmp/submissions";

export const reviewRoutes = {
  async providers() {
    return json(getAvailableProviders());
  },

  async run(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    if (!isStaffOrGranted(user, "reviews.run")) return json({ error: "Access denied." }, 403);

    const body = await request.json().catch(() => ({})) as { provider?: string; model?: string };

    const submission = await data.getById<any>(COLLECTIONS.submissions, params.submissionId);
    if (!submission) return json({ error: "Submission not found." }, 404);

    const assignment = await data.getById<any>(COLLECTIONS.assignments, submission.assignmentId);
    if (!assignment) return json({ error: "Assignment not found." }, 404);

    let filePath = submission.filePath;
    if (!filePath || !existsSync(filePath)) {
      if (submission.storageKey) {
        const dest = join(TMP_DIR, submission.id);
        const rawBuffer = await storageDownload(submission.storageKey);
        if (submission.storageKey.endsWith(".pdf")) {
          await savePdfBuffer(rawBuffer, "submission.pdf", dest);
        } else {
          await extractZipBuffer(rawBuffer, dest);
        }
        filePath = dest;
        await data.update(COLLECTIONS.submissions, submission.id, { filePath });
      } else if (submission.githubUrl) {
        const dest = join(TMP_DIR, submission.id);
        await cloneGithubRepo(submission.githubUrl, dest);
        filePath = dest;
        await data.update(COLLECTIONS.submissions, submission.id, { filePath });
      } else {
        return json({ error: "Submission has no files and no GitHub URL to re-clone from." }, 400);
      }
    }

    const codeFiles = await readCodeFiles(filePath);
    if (codeFiles.length === 0) return json({ error: "No readable code files were found in this submission." }, 400);

    let review = await data.findOne<any>(COLLECTIONS.reviews, [["submissionId", "==", submission.id]]);

    if (!review) {
      const newId = randomUUID();
      review = await data.insert<any>(COLLECTIONS.reviews, newId, {
        submissionId: submission.id,
        status: "reviewing",
        maxScore: assignment.maxScore,
        aiScore: null,
        teacherOverrideScore: null,
        feedback: null,
        rawAiResponse: null,
        reviewedAt: null,
      });
    } else {
      await data.update(COLLECTIONS.reviews, review.id, { status: "reviewing", rawAiResponse: null });
    }

    // Resolve the effective brief: for group submissions, the group's own brief overrides the assignment-level one.
    let group: any = null;
    if (submission.groupId) {
      group = await data.getById<any>(COLLECTIONS.assignmentGroups, submission.groupId);
    }
    const briefPdfId: string | null =
      (group?.sourceType === "pdf" && group?.sourcePdfPath) ||
      (assignment.sourceType === "pdf" && assignment.sourcePdfPath) ||
      assignment.sourcePdfPath ||
      null;

    const attachments: ReviewAttachment[] = [];
    if (briefPdfId) {
      const buf = await storageDownload(`briefs/${briefPdfId}.pdf`).catch((err) => {
        console.error(`[v2.review.run] failed to download brief PDF ${briefPdfId}:`, err);
        return null;
      });
      if (buf) {
        attachments.push({
          filename: "assignment-brief.pdf",
          mimeType: "application/pdf",
          data: buf.toString("base64"),
        });
      }
    }

    const reviewInput = {
      assignmentTitle: assignment.title,
      assignmentDescription: assignment.description,
      rubric: assignment.rubric,
      maxScore: assignment.maxScore,
      assignmentSourceType: assignment.sourceType,
      assignmentSourceMarkdown: assignment.sourceMarkdown,
      assignmentSourceUrl: assignment.sourceUrl,
      groupContext: group
        ? {
            name: group.name,
            description: group.description ?? null,
            rubric: group.rubric ?? null,
            sourceType: group.sourceType ?? null,
            sourceUrl: group.sourceUrl ?? null,
          }
        : null,
      hasPdfBrief: attachments.length > 0,
      codeFiles,
    };

    try {
      const requestedProvider = body.provider || assignment.defaultProvider;
      const providerName: ProviderName =
        requestedProvider === "nvidia"
          ? "nvidia"
          : requestedProvider === "gemini"
            ? "gemini"
            : "openrouter";
      // Only Gemini can read attached PDFs; nvidia/openrouter ignore attachments.
      const result = await reviewCode(
        reviewInput,
        providerName,
        providerName === "gemini" ? attachments : [],
        body.model,
      );

      await data.update(COLLECTIONS.reviews, review.id, {
        status: "completed",
        aiScore: Math.round(result.totalScore),
        maxScore: assignment.maxScore,
        feedback: { ...result.feedback, provider: result.provider, model: result.model, durationMs: result.durationMs },
        rawAiResponse: result.rawResponse,
        reviewedAt: new Date(),
      });

      const updated = await data.findOne<any>(COLLECTIONS.reviews, [["submissionId", "==", submission.id]]);
      audit({ actorId: user.userId, action: "review.run", targetType: "submission", targetId: submission.id, details: { score: result.totalScore } });
      return json(updated);
    } catch (err) {
      const message = err instanceof Error ? err.message : "AI review failed.";
      console.error(`[v2.review.run] FAILED submission=${submission.id}`, message);
      await data.update(COLLECTIONS.reviews, review.id, { status: "failed", rawAiResponse: message });
      return json({ error: "AI review failed.", details: message }, 500);
    }
  },

  async get(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    const review = await data.findOne<any>(COLLECTIONS.reviews, [["submissionId", "==", params.submissionId]]);
    if (!review) return json({ error: "Review not found." }, 404);

    if (!isStaffOrGranted(user, "grades.edit")) {
      const submission = await data.getById<any>(COLLECTIONS.submissions, params.submissionId);
      if (!submission) return json({ error: "Forbidden" }, 403);
      let allowed = submission.studentId === user.userId;
      if (!allowed && submission.groupId) {
        const group = await data.getById<any>(COLLECTIONS.assignmentGroups, submission.groupId);
        if (group && (group.memberIds || []).includes(user.userId)) allowed = true;
      }
      if (!allowed) return json({ error: "Forbidden" }, 403);
    }
    return json(review);
  },

  async override(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    if (!isStaffOrGranted(user, "grades.edit")) return json({ error: "Access denied." }, 403);

    const body = await request.json().catch(() => ({})) as { score?: number; feedback?: string };
    const score = Number(body.score);
    const feedbackText = body.feedback?.trim() || null;
    if (!Number.isFinite(score) || score < 0) return json({ error: "Please provide a valid override score." }, 400);

    const submission = await data.getById<any>(COLLECTIONS.submissions, params.submissionId);
    if (!submission) return json({ error: "Submission not found." }, 404);

    const assignment = await data.getById<any>(COLLECTIONS.assignments, submission.assignmentId);
    if (score > (assignment?.maxScore ?? 100)) return json({ error: "Override score cannot exceed the assignment max score." }, 400);

    let existing = await data.findOne<any>(COLLECTIONS.reviews, [["submissionId", "==", params.submissionId]]);
    if (!existing) {
      const newId = randomUUID();
      existing = await data.insert<any>(COLLECTIONS.reviews, newId, {
        submissionId: params.submissionId,
        status: "completed",
        maxScore: assignment?.maxScore ?? 100,
        aiScore: null,
        teacherOverrideScore: null,
        feedback: null,
        rawAiResponse: null,
        reviewedAt: null,
      });
    }

    const updatedFeedback = {
      ...(existing.feedback ?? {}),
      ...(feedbackText ? { summary: feedbackText } : {}),
    };

    await data.update(COLLECTIONS.reviews, existing.id, {
      teacherOverrideScore: Math.round(score),
      status: "completed",
      feedback: updatedFeedback,
      reviewedAt: new Date(),
    });
    const review = await data.getById<any>(COLLECTIONS.reviews, existing.id);

    const recipientIds = new Set<string>();
    if (submission.studentId) recipientIds.add(submission.studentId);
    if (submission.groupId) {
      const group = await data.getById<any>(COLLECTIONS.assignmentGroups, submission.groupId);
      for (const id of group?.memberIds || []) recipientIds.add(id);
    }
    const recipients = await Promise.all([...recipientIds].map((id) => data.getById<any>(COLLECTIONS.users, id)));
    for (const r of recipients) {
      if (!r || String(r.email).endsWith("@historical.reviewai.local")) continue;
      sendGradeRelease(
        { email: r.email, fullName: r.fullName },
        { title: assignment?.title ?? "Assignment", id: submission.assignmentId },
        {
          score: Math.round(score),
          maxScore: assignment?.maxScore ?? 100,
          feedback: feedbackText || (existing.feedback?.summary ?? null),
          suggestions: existing.feedback?.suggestions ?? [],
        },
      ).catch(console.error);
    }

    audit({ actorId: user.userId, action: "review.grade_released", targetType: "submission", targetId: params.submissionId, details: { score: Math.round(score), maxScore: assignment?.maxScore ?? 100 } });
    return json(review);
  },
};
