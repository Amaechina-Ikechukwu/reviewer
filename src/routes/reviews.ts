import { eq } from "drizzle-orm";
import { join } from "node:path";
import { db } from "../db/connection";
import { assignments, reviews, submissions, users } from "../db/schema";
import type { AuthenticatedRequest } from "../middleware/auth";
import { getAvailableProviders, reviewCode } from "../services/ai/reviewer";
import { readCodeFiles } from "../services/code-reader";
import { cloneGithubRepo } from "../services/github";
import { sendGradeRelease } from "../services/email";
import { json } from "../utils/json";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";

export const reviewRoutes = {
  async providers() {
    return json(getAvailableProviders());
  },

  async run(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    if (user.role !== "teacher") {
      return json({ error: "Only teachers can trigger reviews." }, 403);
    }

    const body = await request.json().catch(() => ({})) as {
      provider?: string;
    };

    const [submission] = await db.select().from(submissions).where(eq(submissions.id, params.submissionId)).limit(1);
    if (!submission) {
      return json({ error: "Submission not found." }, 404);
    }

    const [assignment] = await db.select().from(assignments).where(eq(assignments.id, submission.assignmentId)).limit(1);
    if (!assignment) {
      return json({ error: "Assignment not found." }, 404);
    }

    let filePath = submission.filePath;

    if (!filePath) {
      if (!submission.githubUrl) {
        return json({ error: "Submission has no files and no GitHub URL." }, 400);
      }
      const destDir = join(UPLOAD_DIR, submission.id);
      await cloneGithubRepo(submission.githubUrl, destDir);
      filePath = destDir;
      await db.update(submissions).set({ filePath }).where(eq(submissions.id, submission.id));
    }

    const codeFiles = await readCodeFiles(filePath);
    if (codeFiles.length === 0) {
      return json({ error: "No readable code files were found in this submission." }, 400);
    }

    let [review] = await db.select().from(reviews).where(eq(reviews.submissionId, submission.id)).limit(1);

    if (!review) {
      [review] = await db
        .insert(reviews)
        .values({
          submissionId: submission.id,
          status: "reviewing",
          maxScore: assignment.maxScore,
        })
        .returning();
    } else {
      await db
        .update(reviews)
        .set({
          status: "reviewing",
          rawAiResponse: null,
        })
        .where(eq(reviews.id, review.id));
    }

    const reviewInput = {
      assignmentTitle: assignment.title,
      assignmentDescription: assignment.description,
      rubric: assignment.rubric,
      maxScore: assignment.maxScore,
      assignmentSourceType: assignment.sourceType,
      assignmentSourceMarkdown: assignment.sourceMarkdown,
      assignmentSourceUrl: assignment.sourceUrl,
      codeFiles,
    };

    try {
      const result = await reviewCode(reviewInput);

      await db
        .update(reviews)
        .set({
          status: "completed",
          aiScore: result.totalScore,
          maxScore: assignment.maxScore,
          feedback: {
            ...result.feedback,
            provider: result.provider,
            model: result.model,
            durationMs: result.durationMs,
          },
          rawAiResponse: result.rawResponse,
          reviewedAt: new Date(),
        })
        .where(eq(reviews.id, review.id));

      const [updated] = await db.select().from(reviews).where(eq(reviews.submissionId, submission.id)).limit(1);
      return json(updated);
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI review failed.";

      await db
        .update(reviews)
        .set({
          status: "failed",
          rawAiResponse: message,
        })
        .where(eq(reviews.id, review.id));

      return json({ error: "AI review failed.", details: message }, 500);
    }
  },

  async get(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;

    const [review] = await db.select().from(reviews).where(eq(reviews.submissionId, params.submissionId)).limit(1);

    if (!review) {
      return json({ error: "Review not found." }, 404);
    }

    if (user.role === "student") {
      const [submission] = await db
        .select()
        .from(submissions)
        .where(eq(submissions.id, params.submissionId))
        .limit(1);

      if (!submission || submission.studentId !== user.userId) {
        return json({ error: "Forbidden" }, 403);
      }
    }

    return json(review);
  },

  async override(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    if (user.role !== "teacher") {
      return json({ error: "Only teachers can override scores." }, 403);
    }

    const body = await request.json().catch(() => ({})) as { score?: number; feedback?: string };
    const score = Number(body.score);
    const feedbackText = body.feedback?.trim() || null;

    if (!Number.isFinite(score) || score < 0) {
      return json({ error: "Please provide a valid override score." }, 400);
    }

    const [submission] = await db.select().from(submissions).where(eq(submissions.id, params.submissionId)).limit(1);
    if (!submission) return json({ error: "Submission not found." }, 404);

    const [assignment] = await db.select().from(assignments).where(eq(assignments.id, submission.assignmentId)).limit(1);

    if (score > (assignment?.maxScore ?? 100)) {
      return json({ error: "Override score cannot exceed the assignment max score." }, 400);
    }

    let [existingReview] = await db
      .select()
      .from(reviews)
      .where(eq(reviews.submissionId, params.submissionId))
      .limit(1);

    if (!existingReview) {
      // Create a manual review record so teacher can release a grade without running AI first
      [existingReview] = await db
        .insert(reviews)
        .values({
          submissionId: params.submissionId,
          status: "completed",
          maxScore: assignment?.maxScore ?? 100,
        })
        .returning();
    }

    // Merge teacher feedback into the existing AI feedback object (keep AI criteria/suggestions)
    const updatedFeedback = {
      ...(existingReview.feedback ?? {}),
      ...(feedbackText ? { summary: feedbackText } : {}),
    };

    const [review] = await db
      .update(reviews)
      .set({
        teacherOverrideScore: Math.round(score),
        status: "completed",
        feedback: updatedFeedback as typeof existingReview.feedback,
        reviewedAt: new Date(),
      })
      .where(eq(reviews.submissionId, params.submissionId))
      .returning();

    // Email the student their grade
    const [student] = await db
      .select({ email: users.email, fullName: users.fullName })
      .from(users)
      .where(eq(users.id, submission.studentId))
      .limit(1);

    if (student && !student.email.endsWith("@historical.reviewai.local")) {
      sendGradeRelease(
        student,
        { title: assignment?.title ?? "Assignment", id: submission.assignmentId },
        {
          score: Math.round(score),
          maxScore: assignment?.maxScore ?? 100,
          feedback: feedbackText || (existingReview.feedback?.summary ?? null),
          suggestions: existingReview.feedback?.suggestions ?? [],
        },
      ).catch(console.error);
    }

    return json(review);
  },
};
