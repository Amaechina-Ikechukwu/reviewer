import type { AuthenticatedRequest } from "../../middleware/auth";
import { json } from "../../utils/json";
import { data } from "../data";
import { COLLECTIONS } from "../firebase";

export const gradebookRoutes = {
  async get(request: Request) {
    const user = (request as AuthenticatedRequest).user;
    if (user.role !== "teacher") return json({ error: "Only teachers can view the gradebook." }, 403);

    const [allStudents, allAssignments, allSubmissions, allReviews] = await Promise.all([
      data.findMany<any>(COLLECTIONS.users, { where: [["role", "==", "student"]] }),
      data.findMany<any>(COLLECTIONS.assignments, { orderBy: ["createdAt", "asc"] }),
      data.findMany<any>(COLLECTIONS.submissions, {}),
      data.findMany<any>(COLLECTIONS.reviews, {}),
    ]);

    const reviewBySubmission = new Map(allReviews.map((r) => [r.submissionId, r]));
    const submissionsByStudentAssignment = new Map<string, any>();
    for (const sub of allSubmissions) submissionsByStudentAssignment.set(`${sub.studentId}:${sub.assignmentId}`, sub);

    const assignmentsLite = allAssignments.map((a) => ({ id: a.id, title: a.title, maxScore: a.maxScore }));

    const rows = allStudents
      .sort((a, b) => String(a.fullName).localeCompare(String(b.fullName)))
      .map((student) => {
        let grandTotal = 0;
        let grandMaxTotal = 0;
        const scores: Record<string, any> = {};

        for (const assignment of assignmentsLite) {
          const sub = submissionsByStudentAssignment.get(`${student.id}:${assignment.id}`);
          if (!sub) { scores[assignment.id] = null; continue; }
          const review = reviewBySubmission.get(sub.id);
          const score = review?.teacherOverrideScore ?? review?.aiScore ?? null;
          const maxScore = review?.maxScore ?? assignment.maxScore;
          scores[assignment.id] = { score, maxScore, status: review?.status ?? "no_review", submissionId: sub.id };
          if (typeof score === "number") { grandTotal += score; grandMaxTotal += maxScore; }
        }

        return {
          student: { id: student.id, fullName: student.fullName, email: student.email },
          scores, grandTotal, grandMaxTotal,
        };
      });

    return json({ assignments: assignmentsLite, rows });
  },
};
