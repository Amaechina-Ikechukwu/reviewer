import { eq } from "drizzle-orm";
import { db } from "../db/connection";
import { assignments, reviews, submissions, users } from "../db/schema";
import type { AuthenticatedRequest } from "../middleware/auth";
import { json } from "../utils/json";

export const gradebookRoutes = {
  async get(request: Request) {
    const user = (request as AuthenticatedRequest).user;
    if (user.role !== "teacher") return json({ error: "Only teachers can view the gradebook." }, 403);

    const [allStudents, allAssignments, allSubmissions, allReviews] = await Promise.all([
      db.select({ id: users.id, fullName: users.fullName, email: users.email })
        .from(users).where(eq(users.role, "student")),
      db.select({ id: assignments.id, title: assignments.title, maxScore: assignments.maxScore })
        .from(assignments).orderBy(assignments.createdAt),
      db.select({ id: submissions.id, studentId: submissions.studentId, assignmentId: submissions.assignmentId })
        .from(submissions),
      db.select({
        submissionId: reviews.submissionId,
        status: reviews.status,
        aiScore: reviews.aiScore,
        teacherOverrideScore: reviews.teacherOverrideScore,
        maxScore: reviews.maxScore,
      }).from(reviews),
    ]);

    const reviewBySubmission = new Map(allReviews.map((r) => [r.submissionId, r]));
    const submissionsByStudentAssignment = new Map<string, typeof allSubmissions[0]>();
    for (const sub of allSubmissions) {
      submissionsByStudentAssignment.set(`${sub.studentId}:${sub.assignmentId}`, sub);
    }

    const rows = allStudents
      .sort((a, b) => a.fullName.localeCompare(b.fullName))
      .map((student) => {
        let grandTotal = 0;
        let grandMaxTotal = 0;

        const scores: Record<string, {
          score: number | null;
          maxScore: number | null;
          status: string;
          submissionId: string;
        } | null> = {};

        for (const assignment of allAssignments) {
          const sub = submissionsByStudentAssignment.get(`${student.id}:${assignment.id}`);
          if (!sub) {
            scores[assignment.id] = null;
            continue;
          }
          const review = reviewBySubmission.get(sub.id);
          const score = review?.teacherOverrideScore ?? review?.aiScore ?? null;
          const maxScore = review?.maxScore ?? assignment.maxScore;
          scores[assignment.id] = {
            score,
            maxScore,
            status: review?.status ?? "no_review",
            submissionId: sub.id,
          };
          if (typeof score === "number") {
            grandTotal += score;
            grandMaxTotal += maxScore;
          }
        }

        return { student, scores, grandTotal, grandMaxTotal };
      });

    return json({ assignments: allAssignments, rows });
  },
};
