import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
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

  // Row action popover
  const [openPopoverId, setOpenPopoverId] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpenPopoverId(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Edit student
  const [editStudent, setEditStudent] = useState<StudentWithPending | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editError, setEditError] = useState("");
  const [editing, setEditing] = useState(false);

  // Merge students
  const [showMerge, setShowMerge] = useState(false);
  const [mergeSourceId, setMergeSourceId] = useState("");
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [mergeError, setMergeError] = useState("");
  const [merging, setMerging] = useState(false);

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

  async function handleMerge(event: FormEvent) {
    event.preventDefault();
    if (!mergeSourceId || !mergeTargetId) return;
    setMergeError("");
    setMerging(true);
    try {
      const res = await api<{ merged: boolean; transferredSubmissions: number; skipped: number }>("/students/merge", {
        method: "POST",
        body: JSON.stringify({ sourceId: mergeSourceId, targetId: mergeTargetId }),
      });
      setStudents((prev) => prev.filter((s) => s.id !== mergeSourceId));
      toast().success(`Students merged. ${res.transferredSubmissions} submission(s) transferred${res.skipped > 0 ? `, ${res.skipped} skipped (conflict)` : ""}.`);
      setShowMerge(false);
    } catch (err) {
      setMergeError(err instanceof Error ? err.message : "Merge failed");
    } finally {
      setMerging(false);
    }
  }

  async function handleEditStudent(event: FormEvent) {
    event.preventDefault();
    if (!editStudent) return;
    setEditError("");
    setEditing(true);
    try {
      const updated = await api<StudentWithPending>(`/students/${editStudent.id}`, {
        method: "PATCH",
        body: JSON.stringify({ fullName: editName, email: editEmail || undefined }),
      });
      setStudents((prev) => prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)));
      toast().success("Student details updated");
      setEditStudent(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setEditing(false);
    }
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
              onClick={() => { setMergeSourceId(""); setMergeTargetId(""); setMergeError(""); setShowMerge(true); }}
            >
              Merge students
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
                <div style={{ position: "relative" }} ref={openPopoverId === student.id ? popoverRef : undefined}>
                  <button
                    type="button"
                    style={{ background: "none", border: "1.5px solid var(--border)", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontWeight: 700, fontSize: "1rem", color: "#5d6d89", lineHeight: 1 }}
                    onClick={() => setOpenPopoverId(openPopoverId === student.id ? null : student.id)}
                  >
                    ···
                  </button>
                  {openPopoverId === student.id && (
                    <div style={{ position: "absolute", left: 0, top: "calc(100% + 6px)", background: "#fff", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "0 8px 24px rgba(13,40,100,0.13)", zIndex: 200, minWidth: 180, overflow: "hidden" }}>
                      <button type="button" className="popover-action" onClick={() => { setOpenPopoverId(null); openSubmitFor(student); }}>Open submission</button>
                      <button type="button" className="popover-action" onClick={() => { setOpenPopoverId(null); setEditStudent(student); setEditName(student.fullName); setEditEmail(isPlaceholderEmail(student.email) ? "" : student.email); setEditError(""); }}>Edit details</button>
                      <button type="button" className="popover-action" onClick={() => { setOpenPopoverId(null); setConfirmReset(student); }}>Reset password</button>
                      <button type="button" className="popover-action danger" onClick={() => { setOpenPopoverId(null); setMergeSourceId(student.id); setMergeTargetId(""); setMergeError(""); setShowMerge(true); }}>Merge student</button>
                    </div>
                  )}
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

      {/* Merge students modal */}
      {showMerge && createPortal(
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowMerge(false)}>
          <div className="modal">
            <div className="modal-header">
              <h2 style={{ margin: 0, fontSize: "1.3rem" }}>Merge students</h2>
              <button className="modal-close" type="button" onClick={() => setShowMerge(false)}>✕</button>
            </div>
            <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
              All submissions from the <strong>source</strong> student will be transferred to the <strong>target</strong> student. The source record will be permanently deleted. Submissions that would conflict (same assignment) are skipped.
            </p>
            <form className="stack" style={{ gap: 14 }} onSubmit={handleMerge}>
              <label className="field">
                <span>Source student <span className="muted">(will be deleted)</span></span>
                <select value={mergeSourceId} onChange={(e) => setMergeSourceId(e.target.value)} required>
                  <option value="">— Select source —</option>
                  {sortedStudents.filter((s) => s.id !== mergeTargetId).map((s) => (
                    <option key={s.id} value={s.id}>{s.fullName}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Target student <span className="muted">(will be kept)</span></span>
                <select value={mergeTargetId} onChange={(e) => setMergeTargetId(e.target.value)} required>
                  <option value="">— Select target —</option>
                  {sortedStudents.filter((s) => s.id !== mergeSourceId).map((s) => (
                    <option key={s.id} value={s.id}>{s.fullName}</option>
                  ))}
                </select>
              </label>
              {mergeError && <div style={{ color: "var(--danger)", fontSize: "0.88rem" }}>{mergeError}</div>}
              <div className="confirm-actions">
                <button className="button subtle" type="button" onClick={() => setShowMerge(false)}>Cancel</button>
                <button
                  className="button"
                  type="submit"
                  disabled={!mergeSourceId || !mergeTargetId || merging}
                  style={{ background: "var(--danger, #b91c1c)" }}
                >
                  {merging ? "Merging..." : "Merge & delete source"}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )}

      {/* Edit student modal */}
      {editStudent && createPortal(
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setEditStudent(null)}>
          <div className="modal">
            <div className="modal-header">
              <h2 style={{ margin: 0, fontSize: "1.3rem" }}>Edit student</h2>
              <button className="modal-close" type="button" onClick={() => setEditStudent(null)}>✕</button>
            </div>
            <form className="stack" style={{ gap: 14 }} onSubmit={handleEditStudent}>
              <label className="field">
                <span>Full name</span>
                <input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)} required />
              </label>
              <label className="field">
                <span>Email <span className="muted">(leave blank to keep current)</span></span>
                <input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="student@example.com" />
              </label>
              {editError && <div style={{ color: "var(--danger)", fontSize: "0.88rem" }}>{editError}</div>}
              <div className="confirm-actions">
                <button className="button subtle" type="button" onClick={() => setEditStudent(null)}>Cancel</button>
                <button className="button" type="submit" disabled={editing}>
                  {editing ? "Saving..." : "Save changes"}
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
