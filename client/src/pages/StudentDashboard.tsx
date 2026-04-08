import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import StudentShell from "../components/StudentShell";
import { api } from "../api";
import type { Assignment, Review } from "../types";

type SubmissionRow = {
  submission: { id: string; submittedAt: string };
  assignmentTitle: string | null;
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

export default function StudentDashboard() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [overrideIds, setOverrideIds] = useState<Set<string>>(new Set());
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [reviews, setReviews] = useState<Record<string, Review>>({});

  useEffect(() => {
    api<Assignment[]>("/assignments").then(setAssignments).catch(() => setAssignments([]));
    api<{ assignmentIds: string[] }>("/students/my-overrides")
      .then((r) => setOverrideIds(new Set(r.assignmentIds)))
      .catch(() => setOverrideIds(new Set()));

    api<SubmissionRow[]>("/submissions").then(async (rows) => {
      setSubmissions(rows);
      const entries = await Promise.all(rows.map(async (row) => {
        try {
          return [row.submission.id, await api<Review>(`/reviews/${row.submission.id}`)] as const;
        } catch { return null; }
      }));
      setReviews(Object.fromEntries(entries.filter(Boolean) as Array<readonly [string, Review]>));
    }).catch(() => { setSubmissions([]); setReviews({}); });
  }, []);

  const now = new Date();
  const openAssignments = useMemo(
    () => assignments.filter((a) => {
      const withinWindow = new Date(a.opensAt) <= now && new Date(a.closesAt) > now;
      return withinWindow || overrideIds.has(a.id);
    }).sort((a, b) => new Date(a.closesAt).getTime() - new Date(b.closesAt).getTime()),
    [assignments, overrideIds],
  );

  const upcomingDeadlines = useMemo(
    () => openAssignments.slice(0, 5),
    [openAssignments],
  );

  const completedReviews = Object.values(reviews).filter((r) => r.status === "completed").length;
  const recentSubmissions = useMemo(() => submissions.slice(0, 4), [submissions]);

  return (
    <StudentShell section="dashboard">
      <div className="page">
        <div className="dashboard-grid">
          <div className="dashboard-main">

            {/* Hero + stats */}
            <div className="stats-row">
              <section className="hero-card">
                <div className="stack">
                  <h1>{submissions.length} submissions · {openAssignments.length} open</h1>
                  <div className="hero-actions">
                    <Link className="button secondary" to="/student/results">My Submissions</Link>
                  </div>
                </div>
              </section>
              <div className="stats-row">
                <section className="card stat-card">
                  <p className="eyebrow">Open</p>
                  <p className="metric">{openAssignments.length}</p>
                </section>
                <section className="card stat-card">
                  <p className="eyebrow">Graded</p>
                  <p className="metric">{completedReviews}</p>
                </section>
              </div>
            </div>

            {/* Open assignments grid */}
            <section className="stack">
              <div className="section-header">
                <h2 className="section-title">Open Assignments</h2>
                <span className="tag">{openAssignments.length} Active</span>
              </div>
              <div className="assignment-strip">
                {openAssignments.map((assignment) => (
                  <article className="card assignment-card" key={assignment.id}>
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      {assignment.sourceUrl ? (
                        <a className="tag tag-link" href={assignment.sourceUrl} target="_blank" rel="noreferrer">
                          {assignment.sourceType} ↗
                        </a>
                      ) : (
                        <span className="tag">{assignment.sourceType}</span>
                      )}
                      <span className="muted">{new Date(assignment.closesAt).toLocaleDateString()}</span>
                    </div>
                    <div className="stack" style={{ gap: 6 }}>
                      <h3 style={{ margin: 0, fontSize: "1.4rem", lineHeight: 1.2 }}>{assignment.title}</h3>
                      {assignment.description && (
                        <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>{assignment.description}</p>
                      )}
                    </div>
                    <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginTop: "auto" }}>
                      <div className="pill-row">
                        {assignment.allowGithub && <span className="tag">GitHub</span>}
                        {assignment.allowFileUpload && <span className="tag">ZIP</span>}
                      </div>
                      <Link className="action-link" to={`/student/submit/${assignment.id}`}>Submit →</Link>
                    </div>
                  </article>
                ))}
                {openAssignments.length === 0 && (
                  <article className="card assignment-card">
                    <h3 style={{ margin: 0 }}>No open assignments</h3>
                    <p className="muted">Your teacher hasn't opened any assignments yet.</p>
                  </article>
                )}
              </div>
            </section>

            {/* Recent submissions */}
            <section className="stack">
              <div className="section-header">
                <h2 className="section-title">Recent Submissions</h2>
                <Link className="action-link" to="/student/results">View All</Link>
              </div>
              <div className="card table-card">
                <div className="table-head" style={{ gridTemplateColumns: "1.5fr 1fr 0.8fr 0.6fr" }}>
                  <span>Assignment</span>
                  <span>Submitted</span>
                  <span>Grade</span>
                  <span>Status</span>
                </div>
                {recentSubmissions.map((row) => {
                  const review = reviews[row.submission.id];
                  const score = review?.teacherOverrideScore ?? review?.aiScore;
                  return (
                    <div className="table-row" key={row.submission.id} style={{ gridTemplateColumns: "1.5fr 1fr 0.8fr 0.6fr" }}>
                      <div style={{ fontWeight: 700 }}>{row.assignmentTitle || "Assignment"}</div>
                      <div className="muted" style={{ fontSize: "0.88rem" }}>{formatDateTime(row.submission.submittedAt)}</div>
                      <div style={{ fontWeight: 800, color: "#1848b8" }}>
                        {typeof score === "number" ? `${score}/${review?.maxScore}` : "—"}
                      </div>
                      <span className={`status-pill ${review?.status || "pending"}`}>{review?.status || "pending"}</span>
                    </div>
                  );
                })}
                {recentSubmissions.length === 0 && (
                  <div className="table-row"><span className="muted">No submissions yet.</span></div>
                )}
              </div>
            </section>

          </div>

          {/* Right sidebar — upcoming deadlines */}
          <aside className="dashboard-sidebar">
            <section className="queue-panel">
              <h3 className="eyebrow" style={{ margin: 0 }}>Upcoming Deadlines</h3>
              {upcomingDeadlines.map((assignment) => (
                <Link
                  className="history-card deadline-item"
                  key={assignment.id}
                  to={`/student/submit/${assignment.id}`}
                  style={{ gridTemplateColumns: "1fr", background: "#fff", textDecoration: "none" }}
                >
                  <strong>{assignment.title}</strong>
                  <span className="muted">Due {formatDateTime(assignment.closesAt)}</span>
                </Link>
              ))}
              {upcomingDeadlines.length === 0 && (
                <p className="muted" style={{ margin: 0 }}>No upcoming deadlines.</p>
              )}
            </section>
          </aside>

        </div>
      </div>
    </StudentShell>
  );
}
