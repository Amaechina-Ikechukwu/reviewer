import { useEffect, useState } from "react";
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

function statusLabel(review?: Review | null) {
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

export default function SubmissionsList() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedAssignment, setSelectedAssignment] = useState("");
  const [date, setDate] = useState("");
  const [rows, setRows] = useState<SubmissionRow[]>([]);
  const [reviews, setReviews] = useState<Record<string, Review>>({});

  useEffect(() => {
    api<Assignment[]>("/assignments").then(setAssignments).catch(() => {
      setAssignments([]);
      toast().error("Failed to load assignments");
    });
  }, []);

  useEffect(() => {
    const search = new URLSearchParams();
    if (selectedAssignment) search.set("assignment_id", selectedAssignment);
    if (date) search.set("date", date);

    api<SubmissionRow[]>(`/submissions${search.size ? `?${search.toString()}` : ""}`).then(async (nextRows) => {
      setRows(nextRows);
      const reviewEntries = await Promise.all(nextRows.map(async (row) => {
        try {
          return [row.submission.id, await api<Review>(`/reviews/${row.submission.id}`)] as const;
        } catch {
          return null;
        }
      }));
      setReviews(Object.fromEntries(reviewEntries.filter(Boolean) as Array<readonly [string, Review]>));
    }).catch(() => {
      setRows([]);
      setReviews({});
    });
  }, [date, selectedAssignment]);

  return (
    <TeacherShell section="submissions" searchPlaceholder="Search entries...">
      <div className="page stack">
        <h1 className="page-title">Submissions</h1>

        <div className="card grid two">
          <label className="field">
            <span>Assignment</span>
            <select value={selectedAssignment} onChange={(event) => setSelectedAssignment(event.target.value)}>
              <option value="">All assignments</option>
              {assignments.map((assignment) => (
                <option key={assignment.id} value={assignment.id}>{assignment.title}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Date</span>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
        </div>

        <div className="card table-card">
          <div className="table-head">
            <span>Student</span>
            <span>Assignment</span>
            <span>Submitted</span>
            <span>Review Status</span>
            <span>Action</span>
          </div>

          {rows.map((row) => {
            const status = statusLabel(reviews[row.submission.id]);
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
                <div>
                  <div style={{ fontSize: "0.92rem" }}>{row.assignmentTitle || "Assignment"}</div>
                  <div className="muted" style={{ fontSize: "0.82rem" }}>{row.submission.isLate ? "Late" : "On time"}</div>
                </div>
                <div className="muted" style={{ fontSize: "0.88rem" }}>{formatDateTime(row.submission.submittedAt)}</div>
                <div><span className={`status-pill ${status.pill}`}>{status.label}</span></div>
                <Link className="open-button" to={`/teacher/review/${row.submission.id}`}>Open →</Link>
              </div>
            );
          })}

          {rows.length === 0 && <div className="table-row"><span>No submissions found.</span></div>}
        </div>
      </div>
    </TeacherShell>
  );
}
