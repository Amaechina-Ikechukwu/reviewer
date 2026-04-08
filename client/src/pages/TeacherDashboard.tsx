import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import TeacherShell from "../components/TeacherShell";
import { toast } from "../components/Toast";
import { api } from "../api";
import type { Assignment, Review } from "../types";

type SubmissionRow = {
  submission: {
    id: string;
    submittedAt: string;
    submissionType: "github" | "file_upload";
    isLate: boolean;
  };
  studentName: string | null;
  studentEmail: string | null;
  assignmentTitle: string | null;
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

function formatReviewStatus(review?: Review | null) {
  if (!review) return { label: "Not started", pill: "not-started" };
  if (review.status === "reviewing") return { label: "Reviewing", pill: "reviewing" };
  if (review.status === "completed") return { label: "Completed", pill: "completed" };
  if (review.status === "failed") return { label: "Failed", pill: "failed" };
  return { label: "Pending", pill: "pending" };
}

const BADGE_PALETTES = [
  { bg: "#d8e7ff", color: "#3764c9" },
  { bg: "#e7d8ff", color: "#6d36c9" },
  { bg: "#d8f0e7", color: "#2a8a5e" },
  { bg: "#ffd8e7", color: "#c93764" },
  { bg: "#ffe7d8", color: "#c96437" },
  { bg: "#d8f4ff", color: "#2479a8" },
];

function getBadgePalette(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return BADGE_PALETTES[Math.abs(hash) % BADGE_PALETTES.length];
}

export default function TeacherDashboard() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [reviews, setReviews] = useState<Record<string, Review>>({});

  // Delete assignment
  const [deleteTarget, setDeleteTarget] = useState<Assignment | null>(null);
  const [deleteAction, setDeleteAction] = useState<"delete_all" | "move">("delete_all");
  const [moveTargetId, setMoveTargetId] = useState("");
  const [moveNewTitle, setMoveNewTitle] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    api<Assignment[]>("/assignments").then(setAssignments).catch(() => setAssignments([]));

    api<SubmissionRow[]>("/submissions").then(async (rows) => {
      setSubmissions(rows);
      const reviewEntries = await Promise.all(rows.slice(0, 12).map(async (row) => {
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

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleteError("");
    setDeleting(true);
    try {
      const body: Record<string, string> = { action: deleteAction };
      if (deleteAction === "move") {
        if (moveTargetId) body.targetAssignmentId = moveTargetId;
        else if (moveNewTitle.trim()) body.newAssignmentTitle = moveNewTitle.trim();
        else { setDeleteError("Pick an assignment or type a new title to move submissions to."); setDeleting(false); return; }
      }
      await api(`/assignments/${deleteTarget.id}`, { method: "DELETE", body: JSON.stringify(body) });
      setAssignments((prev) => prev.filter((a) => a.id !== deleteTarget.id));
      toast().success(`"${deleteTarget.title}" deleted.`);
      setDeleteTarget(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  const recentSubmissions = useMemo(() => submissions.slice(0, 6), [submissions]);
  const upcomingAssignments = useMemo(
    () => [...assignments].sort((a, b) => new Date(a.closesAt).getTime() - new Date(b.closesAt).getTime()).slice(0, 5),
    [assignments],
  );
  const completedReviews = Object.values(reviews).filter((review) => review.status === "completed").length;

  return (
    <TeacherShell section="dashboard">
      <div className="page">
        <div className="dashboard-grid">
          <div className="dashboard-main">
            <div className="stats-row">
              <section className="hero-card">
                <div className="stack">
                  <h1>{submissions.length} submissions · {assignments.length} assignments</h1>
                  <div className="hero-actions">
                    <Link className="button secondary" to="/teacher/submissions">All Submissions</Link>
                    <Link className="button subtle" to="/teacher/import">Import</Link>
                  </div>
                </div>
              </section>

              <div className="stats-row">
                <section className="card stat-card">
                  <p className="eyebrow">Assignments</p>
                  <p className="metric">{assignments.length}</p>
                </section>

                <section className="card stat-card">
                  <p className="eyebrow">Reviews done</p>
                  <p className="metric">{completedReviews}</p>
                </section>
              </div>
            </div>

            <section className="stack">
              <div className="section-header">
                <h2 className="section-title">Assignments</h2>
                <Link className="action-link" to="/teacher/assignments/new">Create Assignment</Link>
              </div>
              <div className="assignment-strip">
                {upcomingAssignments.map((assignment) => (
                  <article className="card assignment-card" key={assignment.id}>
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <span className="tag">{assignment.sourceType}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span className="muted">{new Date(assignment.closesAt).toLocaleDateString()}</span>
                        <button
                          type="button"
                          title="Delete assignment"
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#b91c1c", fontSize: "1rem", lineHeight: 1, padding: "2px 4px" }}
                          onClick={() => { setDeleteTarget(assignment); setDeleteAction("delete_all"); setMoveTargetId(""); setMoveNewTitle(""); setDeleteError(""); }}
                        >✕</button>
                      </div>
                    </div>
                    <div className="stack" style={{ gap: 6 }}>
                      <h3 style={{ margin: 0, fontSize: "1.5rem", lineHeight: 1.2 }}>{assignment.title}</h3>
                      <p className="muted" style={{ margin: 0 }}>{assignment.description}</p>
                    </div>
                    <div className="pill-row">
                      {assignment.allowGithub && <span className="tag">GitHub</span>}
                      {assignment.allowFileUpload && <span className="tag">ZIP</span>}
                    </div>
                  </article>
                ))}

                {upcomingAssignments.length === 0 && (
                  <article className="card assignment-card">
                    <h3 style={{ margin: 0 }}>No assignments yet</h3>
                    <p className="muted">Create your first assignment to start receiving submissions.</p>
                  </article>
                )}
              </div>
            </section>

            <section className="stack">
              <div className="section-header">
                <h2 className="section-title">Recent Submissions</h2>
                <Link className="action-link" to="/teacher/submissions">View All</Link>
              </div>
              <div className="card table-card">
                <div className="table-head">
                  <span>Student</span>
                  <span>Assignment</span>
                  <span>Submitted</span>
                  <span>Review Status</span>
                  <span>Action</span>
                </div>

                {recentSubmissions.map((row) => {
                  const review = reviews[row.submission.id];
                  const status = formatReviewStatus(review);
                  const palette = getBadgePalette(row.studentName || "S");

                  return (
                    <div className="table-row" key={row.submission.id}>
                      <div className="name-cell">
                        <div className="initials-badge" style={{ background: palette.bg, color: palette.color }}>
                          {(row.studentName || "S").slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 800 }}>{row.studentName || "Student"}</div>
                          <div className="muted">{row.studentEmail}</div>
                        </div>
                      </div>
                      <div style={{ fontSize: "0.92rem" }}>{row.assignmentTitle || "Assignment"}</div>
                      <div className="muted" style={{ fontSize: "0.88rem" }}>{formatDateTime(row.submission.submittedAt)}</div>
                      <div><span className={`status-pill ${status.pill}`}>{status.label}</span></div>
                      <Link className="open-button" to={`/teacher/review/${row.submission.id}`}>Open →</Link>
                    </div>
                  );
                })}

                {recentSubmissions.length === 0 && (
                  <div className="table-row">
                    <span>No submissions yet.</span>
                  </div>
                )}
              </div>
            </section>
          </div>

          <aside className="dashboard-sidebar">
            <section className="queue-panel">
              <h3 style={{ margin: 0 }} className="eyebrow">Upcoming Deadlines</h3>
              {upcomingAssignments.map((assignment) => (
                <div className="history-card" key={assignment.id} style={{ gridTemplateColumns: "1fr", background: "#fff" }}>
                  <strong>{assignment.title}</strong>
                  <span className="muted">Due {formatDateTime(assignment.closesAt)}</span>
                </div>
              ))}
              {upcomingAssignments.length === 0 && <p className="muted" style={{ margin: 0 }}>No active deadlines yet.</p>}
            </section>
          </aside>
        </div>
      </div>
      {deleteTarget && createPortal(
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setDeleteTarget(null)}>
          <div className="modal">
            <div className="modal-header">
              <h2 style={{ margin: 0, fontSize: "1.3rem" }}>Delete "{deleteTarget.title}"</h2>
              <button className="modal-close" type="button" onClick={() => setDeleteTarget(null)}>✕</button>
            </div>
            <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
              What should happen to the submissions for this assignment?
            </p>

            <div className="stack" style={{ gap: 10 }}>
              <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
                <input type="radio" name="del-action" value="delete_all" checked={deleteAction === "delete_all"} onChange={() => setDeleteAction("delete_all")} style={{ marginTop: 3 }} />
                <div>
                  <strong>Delete all submissions</strong>
                  <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>Permanently removes the assignment and every submission under it.</p>
                </div>
              </label>

              <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
                <input type="radio" name="del-action" value="move" checked={deleteAction === "move"} onChange={() => setDeleteAction("move")} style={{ marginTop: 3 }} />
                <div style={{ flex: 1 }}>
                  <strong>Move submissions to another assignment</strong>
                  <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>Submissions are re-linked; then this assignment is deleted.</p>
                </div>
              </label>

              {deleteAction === "move" && (
                <div className="stack" style={{ gap: 8, paddingLeft: 26 }}>
                  <label className="field">
                    <span>Pick existing assignment</span>
                    <select value={moveTargetId} onChange={(e) => { setMoveTargetId(e.target.value); setMoveNewTitle(""); }}>
                      <option value="">— Select —</option>
                      {assignments.filter((a) => a.id !== deleteTarget.id).map((a) => (
                        <option key={a.id} value={a.id}>{a.title}</option>
                      ))}
                    </select>
                  </label>
                  <div className="muted" style={{ textAlign: "center", fontSize: "0.8rem" }}>— or —</div>
                  <label className="field">
                    <span>Create new assignment with title</span>
                    <input
                      placeholder="e.g. Final Project Archive"
                      value={moveNewTitle}
                      onChange={(e) => { setMoveNewTitle(e.target.value); setMoveTargetId(""); }}
                    />
                  </label>
                </div>
              )}
            </div>

            {deleteError && <div style={{ color: "var(--danger)", fontSize: "0.88rem" }}>{deleteError}</div>}

            <div className="confirm-actions">
              <button className="button subtle" type="button" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button
                className="button"
                type="button"
                disabled={deleting}
                style={{ background: "var(--danger)" }}
                onClick={handleDelete}
              >
                {deleting ? "Deleting..." : "Confirm delete"}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </TeacherShell>
  );
}
