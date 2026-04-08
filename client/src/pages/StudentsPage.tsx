import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import TeacherShell from "../components/TeacherShell";
import { toast } from "../components/Toast";
import { api } from "../api";
import type { Assignment, StudentRecord } from "../types";

type StudentWithPending = StudentRecord & { pending?: boolean };

function isPlaceholderEmail(email: string) {
  return email.endsWith("@historical.reviewai.local");
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

export default function StudentsPage() {
  const [students, setStudents] = useState<StudentWithPending[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [confirmReset, setConfirmReset] = useState<StudentWithPending | null>(null);
  const [submitFor, setSubmitFor] = useState<StudentWithPending | null>(null);

  // Add student form
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [addError, setAddError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Open submission form
  const [selectedAssignmentId, setSelectedAssignmentId] = useState("");
  const [openError, setOpenError] = useState("");
  const [opening, setOpening] = useState(false);

  const [resetting, setResetting] = useState(false);

  const sortedStudents = useMemo<StudentWithPending[]>(
    () => [...students].sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [students],
  );

  useEffect(() => {
    api<StudentWithPending[]>("/students").then(setStudents).catch(() => setStudents([]));
    api<Assignment[]>("/assignments").then(setAssignments).catch(() => setAssignments([]));
  }, []);

  function openAddModal() {
    setFullName("");
    setEmail("");
    setAddError("");
    setShowModal(true);
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setAddError("");
    setSubmitting(true);
    try {
      const response = await api<{ student: StudentWithPending }>("/students", {
        method: "POST",
        body: JSON.stringify({ fullName, email }),
      });
      setStudents((prev) => [...prev, response.student]);
      setShowModal(false);
      toast().success(`Invite sent to ${email}`);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to create student");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopyJoinLink() {
    try {
      const { url } = await api<{ url: string }>("/teachers/join-link");
      await navigator.clipboard.writeText(url);
      toast().success("Join link copied to clipboard");
    } catch {
      toast().error("Failed to get join link");
    }
  }

  async function confirmResetPassword() {
    if (!confirmReset) return;
    setResetting(true);
    try {
      await api("/students/reset-password", {
        method: "POST",
        body: JSON.stringify({ studentId: confirmReset.id }),
      });
      toast().success(`Password reset email sent to ${confirmReset.fullName}`);
    } catch {
      toast().error("Failed to send reset email. Try again.");
    } finally {
      setResetting(false);
      setConfirmReset(null);
    }
  }

  function openSubmitFor(student: StudentWithPending) {
    setSubmitFor(student);
    setSelectedAssignmentId(assignments[0]?.id || "");
    setOpenError("");
  }

  async function handleOpenSubmission(event: FormEvent) {
    event.preventDefault();
    if (!submitFor) return;
    setOpenError("");
    setOpening(true);
    try {
      await api(`/students/${submitFor.id}/open-submission`, {
        method: "POST",
        body: JSON.stringify({ assignmentId: selectedAssignmentId }),
      });
      toast().success(`Submission opened for ${submitFor.fullName}`);
      setSubmitFor(null);
    } catch (err) {
      setOpenError(err instanceof Error ? err.message : "Failed to open submission");
    } finally {
      setOpening(false);
    }
  }

  return (
    <TeacherShell section="students">
      <div className="page stack">
        <div className="section-header">
          <h1 className="page-title">Students</h1>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              className="button secondary"
              style={{ padding: "8px 16px", fontSize: "0.9rem" }}
              type="button"
              onClick={handleCopyJoinLink}
            >
              Copy join link
            </button>
            <button
              className="button secondary"
              style={{ padding: "8px 16px", fontSize: "0.9rem" }}
              type="button"
              onClick={openAddModal}
            >
              + Add student
            </button>
          </div>
        </div>

        <div className="card table-card">
          <div className="table-head" style={{ gridTemplateColumns: "1.4fr 1fr 0.7fr 1fr" }}>
            <span>Student</span>
            <span>Email</span>
            <span>Joined</span>
            <span>Actions</span>
          </div>

          {sortedStudents.map((student) => {
            const palette = getBadgePalette(student.fullName);
            return (
              <div className="table-row" key={student.id} style={{ gridTemplateColumns: "1.4fr 1fr 0.7fr 1fr" }}>
                <div className="name-cell">
                  <div className="initials-badge" style={{ background: palette.bg, color: palette.color }}>
                    {student.fullName.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700 }}>{student.fullName}</div>
                    {student.pending && (
                      <span className="status-pill pending" style={{ fontSize: "0.7rem", padding: "2px 7px" }}>
                        Invite pending
                      </span>
                    )}
                  </div>
                </div>
                <div className="muted" style={{ fontSize: "0.9rem" }}>
                  {isPlaceholderEmail(student.email) ? "—" : student.email}
                </div>
                <div className="muted" style={{ fontSize: "0.88rem" }}>
                  {new Date(student.createdAt).toLocaleDateString()}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    className="open-button"
                    type="button"
                    onClick={() => openSubmitFor(student)}
                  >
                    Open submission
                  </button>
                  <button
                    className="open-button"
                    type="button"
                    onClick={() => setConfirmReset(student)}
                  >
                    Reset password
                  </button>
                </div>
              </div>
            );
          })}

          {sortedStudents.length === 0 && (
            <div className="table-row" style={{ gridTemplateColumns: "1fr" }}>
              <span className="muted">No students yet.</span>
            </div>
          )}
        </div>
      </div>

      {/* Add student modal */}
      {showModal && createPortal(
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <h2 style={{ margin: 0, fontSize: "1.3rem" }}>Add student</h2>
              <button className="modal-close" type="button" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form className="stack" style={{ gap: 14 }} onSubmit={handleCreate}>
              <label className="field">
                <span>Full name</span>
                <input autoFocus value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              </label>
              <label className="field">
                <span>Email</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </label>
              <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
                An invite email will be sent so the student can set their own password.
              </p>
              {addError && <div style={{ color: "var(--danger)", fontSize: "0.88rem" }}>{addError}</div>}
              <div className="confirm-actions">
                <button className="button subtle" type="button" onClick={() => setShowModal(false)}>Cancel</button>
                <button className="button" type="submit" disabled={submitting}>
                  {submitting ? "Sending..." : "Add & send invite"}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )}

      {/* Open submission for student modal */}
      {submitFor && createPortal(
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setSubmitFor(null)}>
          <div className="modal">
            <div className="modal-header">
              <h2 style={{ margin: 0, fontSize: "1.3rem" }}>Open submission for {submitFor.fullName}</h2>
              <button className="modal-close" type="button" onClick={() => setSubmitFor(null)}>✕</button>
            </div>
            <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
              The student will be able to submit for this assignment themselves.
            </p>
            <form className="stack" style={{ gap: 14 }} onSubmit={handleOpenSubmission}>
              <label className="field">
                <span>Assignment</span>
                <select value={selectedAssignmentId} onChange={(e) => setSelectedAssignmentId(e.target.value)} required>
                  {assignments.map((a) => (
                    <option key={a.id} value={a.id}>{a.title}</option>
                  ))}
                  {assignments.length === 0 && <option disabled value="">No assignments available</option>}
                </select>
              </label>
              {openError && <div style={{ color: "var(--danger)", fontSize: "0.88rem" }}>{openError}</div>}
              <div className="confirm-actions">
                <button className="button subtle" type="button" onClick={() => setSubmitFor(null)}>Cancel</button>
                <button className="button" type="submit" disabled={opening || assignments.length === 0}>
                  {opening ? "Opening..." : "Open for student"}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )}

      {/* Reset password confirm modal */}
      {confirmReset && createPortal(
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setConfirmReset(null)}>
          <div className="modal">
            <div className="modal-header">
              <h2 style={{ margin: 0, fontSize: "1.3rem" }}>Reset password?</h2>
              <button className="modal-close" type="button" onClick={() => setConfirmReset(null)}>✕</button>
            </div>
            <p className="muted" style={{ margin: 0 }}>
              A password reset email will be sent to <strong>{confirmReset.fullName}</strong>
              {!isPlaceholderEmail(confirmReset.email) && <> at <strong>{confirmReset.email}</strong></>}.
              The link expires in 2 hours.
            </p>
            <div className="confirm-actions">
              <button className="button subtle" type="button" onClick={() => setConfirmReset(null)}>Cancel</button>
              <button className="button" type="button" disabled={resetting} onClick={confirmResetPassword}>
                {resetting ? "Sending..." : "Send reset email"}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </TeacherShell>
  );
}
