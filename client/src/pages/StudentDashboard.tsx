import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import StudentShell from "../components/StudentShell";
import { api } from "../api";
import type { Assignment, Review } from "../types";

type SubmissionRow = {
  submission: {
    id: string;
    submittedAt: string;
  };
  assignmentTitle: string | null;
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

export default function StudentDashboard() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [reviews, setReviews] = useState<Record<string, Review>>({});

  useEffect(() => {
    api<Assignment[]>("/assignments").then(setAssignments).catch(() => setAssignments([]));

    api<SubmissionRow[]>("/submissions").then(async (rows) => {
      setSubmissions(rows);
      const reviewEntries = await Promise.all(rows.map(async (row) => {
        try {
          return [row.submission.id, await api<Review>(`/reviews/${row.submission.id}`)] as const;
        } catch {
          return null;
        }
      }));
      setReviews(Object.fromEntries(reviewEntries.filter(Boolean) as Array<readonly [string, Review]>));
    }).catch(() => {
      setSubmissions([]);
      setReviews({});
    });
  }, []);

  const now = new Date();
  const openAssignments = useMemo(
    () => assignments
      .filter((a) => new Date(a.closesAt) > now && new Date(a.opensAt) <= now)
      .sort((a, b) => new Date(a.closesAt).getTime() - new Date(b.closesAt).getTime()),
    [assignments],
  );
  const recentSubmissions = useMemo(() => submissions.slice(0, 4), [submissions]);
  const selectedAssignment = openAssignments[0] || null;

  return (
    <StudentShell section="dashboard">
      <div className="page">
        <div className="student-layout-grid">
          <div className="stack">
            <div className="stack" style={{ gap: 6 }}>
              <h1 className="student-page-title">My Learning Portal</h1>
              <p className="muted" style={{ margin: 0, fontSize: "1rem" }}>Track open assignments and check the status of your submitted work.</p>
            </div>

            <section className="stack">
              <div className="section-header">
                <h2 className="section-title">Open Assignments</h2>
                <span className="tag">{openAssignments.length} Active</span>
              </div>

              <div className="assignment-list">
                {openAssignments.map((assignment) => (
                  <article className="student-assignment-card" key={assignment.id}>
                    <div className="stack" style={{ gap: 10 }}>
                      <h3 style={{ margin: 0, fontSize: "1.45rem", lineHeight: 1.2 }}>{assignment.title}</h3>
                      <p style={{ margin: 0, fontSize: "0.98rem", lineHeight: 1.65 }}>
                        {assignment.description}
                      </p>
                      <div className="pill-row">
                        <span className="tag">{assignment.sourceType}</span>
                        {assignment.allowGithub && <span className="tag">GitHub</span>}
                        {assignment.allowFileUpload && <span className="tag">ZIP Upload</span>}
                      </div>
                    </div>
                    <div className="student-status-block">
                      <div style={{ color: "#d62828", fontWeight: 800, fontSize: "1.15rem" }}>
                        Due
                      </div>
                      <div className="muted" style={{ marginTop: 8 }}>{formatDateTime(assignment.closesAt)}</div>
                      <Link className="action-link" to={`/student/submit/${assignment.id}`}>Submit</Link>
                    </div>
                  </article>
                ))}

                {openAssignments.length === 0 && (
                  <article className="card">
                    <strong>No assignments available</strong>
                    <p className="muted" style={{ margin: 0 }}>Assignments from your teacher will appear here.</p>
                  </article>
                )}
              </div>
            </section>

            <section className="stack">
              <div className="section-header">
                <h2 className="section-title">Past Submissions</h2>
                <Link className="action-link" to="/student/results">View All</Link>
              </div>

              <div className="history-list">
                {recentSubmissions.map((row) => {
                  const review = reviews[row.submission.id];
                  const score = review?.teacherOverrideScore ?? review?.aiScore;

                  return (
                    <article className="history-card" key={row.submission.id}>
                      <div className="initials-badge" style={{ background: review?.status === "completed" ? "#efe4ff" : "#dfe7f4", color: review?.status === "completed" ? "#6a1fd2" : "#4a5975" }}>
                        {review?.status === "completed" ? "OK" : "..."}
                      </div>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: "1rem" }}>{row.assignmentTitle || "Assignment"}</div>
                        <div className="muted">Submitted {formatDateTime(row.submission.submittedAt)}</div>
                      </div>
                      <div>
                        <div className="eyebrow">Grade</div>
                        <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "#1848b8" }}>
                          {typeof score === "number" ? `${score}/${review?.maxScore}` : "--"}
                        </div>
                      </div>
                      <div className="tag">{review?.status || "pending"}</div>
                    </article>
                  );
                })}

                {recentSubmissions.length === 0 && (
                  <article className="card">
                    <strong>No submissions yet</strong>
                    <p className="muted" style={{ margin: 0 }}>Your submitted assignments will appear here after you send them.</p>
                  </article>
                )}
              </div>
            </section>
          </div>

          <aside className="student-panel stack">
            <div className="stack" style={{ gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: "1.6rem" }}>Quick Submit</h2>
              {selectedAssignment ? (
                <>
                  <div className="field">
                    <span>Selected Assignment</span>
                    <div className="input-shell">{selectedAssignment.title}</div>
                  </div>
                  <div className="feedback-box">
                    <strong>Due</strong>
                    <p style={{ marginTop: 8 }}>{formatDateTime(selectedAssignment.closesAt)}</p>
                    <strong>Submission Methods</strong>
                    <div className="pill-row" style={{ marginTop: 8 }}>
                      {selectedAssignment.allowGithub && <span className="tag">GitHub Repo</span>}
                      {selectedAssignment.allowFileUpload && <span className="tag">ZIP Upload</span>}
                    </div>
                  </div>
                  <Link className="button" to={`/student/submit/${selectedAssignment.id}`}>Open Submission Form</Link>
                </>
              ) : (
                <div className="feedback-box">
                  No assignment is ready for submission yet.
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </StudentShell>
  );
}
