import { useEffect, useState } from "react";
import StudentShell from "../components/StudentShell";
import { api } from "../api";
import type { Review } from "../types";

type SubmissionRow = {
  submission: {
    id: string;
    submittedAt: string;
  };
  assignmentTitle: string | null;
};

export default function StudentResults() {
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [reviews, setReviews] = useState<Record<string, Review>>({});

  useEffect(() => {
    api<SubmissionRow[]>("/submissions").then(async (rows) => {
      setSubmissions(rows);
      const entries = await Promise.all(rows.map(async (row) => {
        try {
          return [row.submission.id, await api<Review>(`/reviews/${row.submission.id}`)] as const;
        } catch {
          return null;
        }
      }));
      setReviews(Object.fromEntries(entries.filter(Boolean) as Array<readonly [string, Review]>));
    }).catch(() => {
      setSubmissions([]);
      setReviews({});
    });
  }, []);

  return (
    <StudentShell section="submissions">
      <div className="page stack">
        <div>
          <h1 className="student-page-title">Past Submissions</h1>
          <p className="muted" style={{ margin: 0, fontSize: "1rem" }}>See completed reviews, Gemini feedback, and released grades.</p>
        </div>

        <div className="history-list">
          {submissions.map((row) => {
            const review = reviews[row.submission.id];
            const score = review?.teacherOverrideScore ?? review?.aiScore;

            return (
              <article className="history-card" key={row.submission.id}>
                <div className="initials-badge" style={{ background: review?.status === "completed" ? "#efe4ff" : "#dde8f9", color: review?.status === "completed" ? "#6a1fd2" : "#456" }}>
                  {review?.status === "completed" ? "OK" : "..."}
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: "1rem" }}>{row.assignmentTitle || "Assignment"}</div>
                  <div className="muted">
                    Submitted {new Date(row.submission.submittedAt).toLocaleString()} • {review?.feedback?.provider || review?.status || "Awaiting review"}
                  </div>
                  {review?.feedback?.summary && (
                    <div className="muted" style={{ marginTop: 6 }}>{review.feedback.summary}</div>
                  )}
                </div>
                <div>
                  <div className="eyebrow">Grade</div>
                  <div style={{ fontSize: "1.45rem", fontWeight: 800, color: "#1848b8" }}>{typeof score === "number" ? `${score}/${review?.maxScore}` : "--"}</div>
                </div>
                <div className="tag">{review?.status || "pending"}</div>
              </article>
            );
          })}
          {submissions.length === 0 && <div className="card">No submissions yet.</div>}
        </div>
      </div>
    </StudentShell>
  );
}
