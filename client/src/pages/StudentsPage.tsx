import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import TeacherShell from "../components/TeacherShell";
import { toast } from "../components/Toast";
import { Avatar } from "../components/ui/Avatar";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Icon } from "../components/ui/Icons";
import { Input, Label, Select } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { PageHeader } from "../components/ui/PageHeader";
import { Table, TBody, TD, TH, THead, TR, EmptyRow } from "../components/ui/Table";
import { api } from "../api";
import { formatDate } from "../lib/format";
import type { Assignment, StudentRecord } from "../types";

type StudentWithPending = StudentRecord & { pending?: boolean };

function isPlaceholderEmail(email: string) {
  return email.endsWith("@historical.reviewai.local");
}

function RowMenu({
  student,
  onAction,
}: {
  student: StudentWithPending;
  onAction: (action: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const normalItems: Array<{ key: string; label: string }> = [
    { key: "open", label: "Open submission" },
    { key: "submit-for", label: "Submit for student" },
    { key: "edit", label: "Edit details" },
  ];

  const warnItems: Array<{ key: string; label: string }> = [
    { key: "reset", label: "Reset password" },
  ];

  const dangerItems: Array<{ key: string; label: string }> = [
    { key: "merge", label: "Merge into another…" },
    { key: "delete", label: "Delete student" },
  ];

  const menuBtn = (key: string, label: string, tone: "normal" | "warn" | "danger") => (
    <button
      key={key}
      type="button"
      onClick={() => { setOpen(false); onAction(key); }}
      className={
        tone === "danger"
          ? "block w-full px-3 py-2 text-left text-xs font-medium transition-colors text-[var(--danger)] hover:bg-[var(--danger-soft)]"
          : tone === "warn"
          ? "block w-full px-3 py-2 text-left text-xs font-medium transition-colors text-[var(--warn)] hover:bg-[var(--warn-soft)]"
          : "block w-full px-3 py-2 text-left text-xs font-medium transition-colors text-[var(--fg)] hover:bg-[var(--surface-muted)]"
      }
    >
      {label}
    </button>
  );

  return (
    <div className="relative" ref={ref}>
      <Button variant="ghost" size="icon" onClick={() => setOpen((o) => !o)} aria-label={`Actions for ${student.fullName}`}>
        <Icon.MoreHorizontal className="h-4 w-4" />
      </Button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-52 overflow-hidden border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-lg)] animate-fade-in">
          <div className="py-1">
            {normalItems.map((i) => menuBtn(i.key, i.label, "normal"))}
          </div>
          <div className="border-t border-[var(--border)] py-1">
            {warnItems.map((i) => menuBtn(i.key, i.label, "warn"))}
          </div>
          <div className="border-t border-[var(--border)] py-1">
            {dangerItems.map((i) => menuBtn(i.key, i.label, "danger"))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function StudentsPage() {
  const [students, setStudents] = useState<StudentWithPending[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [query, setQuery] = useState("");

  const [showAdd, setShowAdd] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [addError, setAddError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [confirmReset, setConfirmReset] = useState<StudentWithPending | null>(null);
  const [resetting, setResetting] = useState(false);

  const [openSubFor, setOpenSubFor] = useState<StudentWithPending | null>(null);
  const [openSubAssignmentId, setOpenSubAssignmentId] = useState("");
  const [openSubError, setOpenSubError] = useState("");
  const [opening, setOpening] = useState(false);

  const [editStudent, setEditStudent] = useState<StudentWithPending | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editError, setEditError] = useState("");
  const [editing, setEditing] = useState(false);

  const [submitForStudent, setSubmitForStudent] = useState<StudentWithPending | null>(null);
  const [submitAssignmentId, setSubmitAssignmentId] = useState("");
  const [submitGithubUrl, setSubmitGithubUrl] = useState("");
  const [submitForError, setSubmitForError] = useState("");
  const [submittingFor, setSubmittingFor] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState<StudentWithPending | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [showMerge, setShowMerge] = useState(false);
  const [mergeSourceId, setMergeSourceId] = useState("");
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [mergeError, setMergeError] = useState("");
  const [merging, setMerging] = useState(false);

  useEffect(() => {
    api<StudentWithPending[]>("/students").then(setStudents).catch(() => setStudents([]));
    api<Assignment[]>("/assignments").then(setAssignments).catch(() => setAssignments([]));
  }, [refreshKey]);

  const sortedStudents = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = [...students].sort((a, b) => a.fullName.localeCompare(b.fullName));
    if (!q) return base;
    return base.filter((s) => s.fullName.toLowerCase().includes(q) || s.email.toLowerCase().includes(q));
  }, [students, query]);

  function openAdd() {
    setFullName("");
    setEmail("");
    setAddError("");
    setShowAdd(true);
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setAddError("");
    setSubmitting(true);
    try {
      const res = await api<{ student: StudentWithPending }>("/students", {
        method: "POST",
        body: JSON.stringify({ fullName, email }),
      });
      setStudents((prev) => [...prev, res.student]);
      setShowAdd(false);
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
      toast().success("Join link copied");
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
      toast().success(`Reset email sent to ${confirmReset.fullName}`);
    } catch {
      toast().error("Failed to send reset email");
    } finally {
      setResetting(false);
      setConfirmReset(null);
    }
  }

  async function handleMerge(e: FormEvent) {
    e.preventDefault();
    if (!mergeSourceId || !mergeTargetId) return;
    setMergeError("");
    setMerging(true);
    try {
      const res = await api<{ merged: boolean; transferredSubmissions: number; skipped: number }>("/students/merge", {
        method: "POST",
        body: JSON.stringify({ sourceId: mergeSourceId, targetId: mergeTargetId }),
      });
      setStudents((prev) => prev.filter((s) => s.id !== mergeSourceId));
      toast().success(`Merged. ${res.transferredSubmissions} submission(s) transferred${res.skipped > 0 ? `, ${res.skipped} skipped` : ""}.`);
      setShowMerge(false);
    } catch (err) {
      setMergeError(err instanceof Error ? err.message : "Merge failed");
    } finally {
      setMerging(false);
    }
  }

  async function handleSubmitForStudent(e: FormEvent) {
    e.preventDefault();
    if (!submitForStudent) return;
    setSubmitForError("");
    setSubmittingFor(true);
    try {
      await api("/submissions/submit-for-student", {
        method: "POST",
        body: JSON.stringify({ studentId: submitForStudent.id, assignmentId: submitAssignmentId, githubUrl: submitGithubUrl }),
      });
      toast().success(`Submission created for ${submitForStudent.fullName}`);
      setSubmitForStudent(null);
    } catch (err) {
      setSubmitForError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmittingFor(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await api(`/students/${confirmDelete.id}`, { method: "DELETE" });
      setStudents((prev) => prev.filter((s) => s.id !== confirmDelete.id));
      toast().success(`${confirmDelete.fullName} deleted`);
      setConfirmDelete(null);
    } catch (err) {
      toast().error(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeleting(false);
    }
  }

  async function handleEdit(e: FormEvent) {
    e.preventDefault();
    if (!editStudent) return;
    setEditError("");
    setEditing(true);
    try {
      const updated = await api<StudentWithPending>(`/students/${editStudent.id}`, {
        method: "PATCH",
        body: JSON.stringify({ fullName: editName, email: editEmail || undefined }),
      });
      setStudents((prev) => prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)));
      toast().success("Student updated");
      setEditStudent(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setEditing(false);
    }
  }

  async function handleOpenSubmission(e: FormEvent) {
    e.preventDefault();
    if (!openSubFor) return;
    setOpenSubError("");
    setOpening(true);
    try {
      await api(`/students/${openSubFor.id}/open-submission`, {
        method: "POST",
        body: JSON.stringify({ assignmentId: openSubAssignmentId }),
      });
      toast().success(`Submission opened for ${openSubFor.fullName}`);
      setOpenSubFor(null);
    } catch (err) {
      setOpenSubError(err instanceof Error ? err.message : "Failed to open submission");
    } finally {
      setOpening(false);
    }
  }

  function handleRowAction(action: string, student: StudentWithPending) {
    switch (action) {
      case "open":
        setOpenSubFor(student);
        setOpenSubAssignmentId(assignments[0]?.id || "");
        setOpenSubError("");
        break;
      case "submit-for":
        setSubmitForStudent(student);
        setSubmitAssignmentId(assignments[0]?.id || "");
        setSubmitGithubUrl("");
        setSubmitForError("");
        break;
      case "edit":
        setEditStudent(student);
        setEditName(student.fullName);
        setEditEmail(isPlaceholderEmail(student.email) ? "" : student.email);
        setEditError("");
        break;
      case "reset":
        setConfirmReset(student);
        break;
      case "merge":
        setMergeSourceId(student.id);
        setMergeTargetId("");
        setMergeError("");
        setShowMerge(true);
        break;
      case "delete":
        setConfirmDelete(student);
        break;
    }
  }

  return (
    <TeacherShell section="students">
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Students"
          description={`${students.length} students in your workspace.`}
          actions={
            <>
              <Button variant="secondary" size="sm" onClick={() => setRefreshKey((k) => k + 1)}>
                <Icon.Refresh className="h-3.5 w-3.5" />
                Refresh
              </Button>
              <Button variant="secondary" size="sm" onClick={handleCopyJoinLink}>
                <Icon.Link className="h-3.5 w-3.5" />
                Copy join link
              </Button>
              <Button variant="secondary" size="sm" onClick={() => { setMergeSourceId(""); setMergeTargetId(""); setMergeError(""); setShowMerge(true); }}>
                Merge students
              </Button>
              <Button size="sm" onClick={openAdd}>
                <Icon.Plus className="h-3.5 w-3.5" />
                Add student
              </Button>
            </>
          }
        />

        <Card className="p-3">
          <div className="relative">
            <Icon.Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--fg-muted)]" />
            <Input
              placeholder="Search by name or email..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </Card>

        <Card className="overflow-visible">
          <Table overflowVisible>
            <THead>
              <TR>
                <TH>Student</TH>
                <TH>Email</TH>
                <TH>Joined</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {sortedStudents.map((student) => (
                <TR key={student.id}>
                  <TD label="Student">
                    <div className="flex items-center gap-3">
                      <Avatar name={student.fullName} size="sm" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium">{student.fullName}</span>
                          {student.pending && <Badge tone="warn">Invite pending</Badge>}
                        </div>
                      </div>
                    </div>
                  </TD>
                  <TD label="Email" className="text-sm text-[var(--fg-muted)]">
                    {isPlaceholderEmail(student.email) ? "—" : student.email}
                  </TD>
                  <TD label="Joined" className="text-xs text-[var(--fg-muted)]">{formatDate(student.createdAt)}</TD>
                  <TD label="Actions" className="text-right">
                    <RowMenu student={student} onAction={(a) => handleRowAction(a, student)} />
                  </TD>
                </TR>
              ))}
              {sortedStudents.length === 0 && <EmptyRow cols={4}>No students match your search.</EmptyRow>}
            </TBody>
          </Table>
        </Card>
      </div>

      {/* Add student */}
      <Modal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        title="Add student"
        description="An invite email is sent so the student can set their own password."
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button type="submit" form="add-student-form" loading={submitting}>
              {submitting ? "Sending..." : "Add & send invite"}
            </Button>
          </>
        }
      >
        <form id="add-student-form" className="flex flex-col gap-4" onSubmit={handleCreate}>
          <Label required>Full name
            <Input autoFocus value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </Label>
          <Label required>Email
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Label>
          {addError && (
            <div className="rounded-md border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger)]">
              {addError}
            </div>
          )}
        </form>
      </Modal>

      {/* Open submission */}
      <Modal
        open={!!openSubFor}
        onClose={() => setOpenSubFor(null)}
        title={openSubFor ? `Open submission for ${openSubFor.fullName}` : ""}
        description="The student will be able to submit for this assignment themselves, even if it's closed."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpenSubFor(null)}>Cancel</Button>
            <Button type="submit" form="open-sub-form" loading={opening} disabled={assignments.length === 0}>
              {opening ? "Opening..." : "Open for student"}
            </Button>
          </>
        }
      >
        <form id="open-sub-form" className="flex flex-col gap-4" onSubmit={handleOpenSubmission}>
          <Label required>Assignment
            <Select value={openSubAssignmentId} onChange={(e) => setOpenSubAssignmentId(e.target.value)} required>
              {assignments.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
              {assignments.length === 0 && <option disabled value="">No assignments available</option>}
            </Select>
          </Label>
          {openSubError && (
            <div className="rounded-md border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger)]">
              {openSubError}
            </div>
          )}
        </form>
      </Modal>

      {/* Merge */}
      <Modal
        open={showMerge}
        onClose={() => setShowMerge(false)}
        title="Merge students"
        description="All submissions from the source are transferred to the target. The source is deleted. Conflicting submissions are skipped."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowMerge(false)}>Cancel</Button>
            <Button type="submit" form="merge-form" variant="danger" loading={merging} disabled={!mergeSourceId || !mergeTargetId}>
              {merging ? "Merging..." : "Merge & delete source"}
            </Button>
          </>
        }
      >
        <form id="merge-form" className="flex flex-col gap-4" onSubmit={handleMerge}>
          <Label required>Source student <span className="font-normal text-[var(--fg-subtle)]">(will be deleted)</span>
            <Select value={mergeSourceId} onChange={(e) => setMergeSourceId(e.target.value)} required>
              <option value="">— Select source —</option>
              {sortedStudents.filter((s) => s.id !== mergeTargetId).map((s) => (
                <option key={s.id} value={s.id}>{s.fullName}</option>
              ))}
            </Select>
          </Label>
          <Label required>Target student <span className="font-normal text-[var(--fg-subtle)]">(will be kept)</span>
            <Select value={mergeTargetId} onChange={(e) => setMergeTargetId(e.target.value)} required>
              <option value="">— Select target —</option>
              {sortedStudents.filter((s) => s.id !== mergeSourceId).map((s) => (
                <option key={s.id} value={s.id}>{s.fullName}</option>
              ))}
            </Select>
          </Label>
          {mergeError && (
            <div className="rounded-md border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger)]">
              {mergeError}
            </div>
          )}
        </form>
      </Modal>

      {/* Edit */}
      <Modal
        open={!!editStudent}
        onClose={() => setEditStudent(null)}
        title="Edit student"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditStudent(null)}>Cancel</Button>
            <Button type="submit" form="edit-student-form" loading={editing}>
              {editing ? "Saving..." : "Save changes"}
            </Button>
          </>
        }
      >
        <form id="edit-student-form" className="flex flex-col gap-4" onSubmit={handleEdit}>
          <Label required>Full name
            <Input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)} required />
          </Label>
          <Label>Email <span className="font-normal text-[var(--fg-subtle)]">(blank to keep current)</span>
            <Input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="student@example.com" />
          </Label>
          {editError && (
            <div className="rounded-md border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger)]">
              {editError}
            </div>
          )}
        </form>
      </Modal>

      {/* Submit for student */}
      <Modal
        open={!!submitForStudent}
        onClose={() => setSubmitForStudent(null)}
        title={submitForStudent ? `Submit for ${submitForStudent.fullName}` : ""}
        description="Creates a GitHub submission on behalf of this student. The student is not notified."
        footer={
          <>
            <Button variant="ghost" onClick={() => setSubmitForStudent(null)}>Cancel</Button>
            <Button type="submit" form="submit-for-form" loading={submittingFor} disabled={assignments.length === 0}>
              {submittingFor ? "Submitting..." : "Create submission"}
            </Button>
          </>
        }
      >
        <form id="submit-for-form" className="flex flex-col gap-4" onSubmit={handleSubmitForStudent}>
          <Label required>Assignment
            <Select value={submitAssignmentId} onChange={(e) => setSubmitAssignmentId(e.target.value)} required>
              {assignments.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
              {assignments.length === 0 && <option disabled value="">No assignments available</option>}
            </Select>
          </Label>
          <Label required>GitHub URL
            <Input
              placeholder="https://github.com/owner/repo"
              value={submitGithubUrl}
              onChange={(e) => setSubmitGithubUrl(e.target.value)}
              required
            />
          </Label>
          {submitForError && (
            <div className="rounded-md border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger)]">
              {submitForError}
            </div>
          )}
        </form>
      </Modal>

      {/* Delete */}
      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete student?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="danger" onClick={handleDelete} loading={deleting}>
              {deleting ? "Deleting..." : "Delete permanently"}
            </Button>
          </>
        }
      >
        {confirmDelete && (
          <p className="text-sm text-[var(--fg-muted)]">
            This will permanently delete <strong className="text-[var(--fg)]">{confirmDelete.fullName}</strong> and all
            their submissions and reviews. This cannot be undone.
          </p>
        )}
      </Modal>

      {/* Reset password */}
      <Modal
        open={!!confirmReset}
        onClose={() => setConfirmReset(null)}
        title="Reset password?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmReset(null)}>Cancel</Button>
            <Button onClick={confirmResetPassword} loading={resetting}>
              {resetting ? "Sending..." : "Send reset email"}
            </Button>
          </>
        }
      >
        {confirmReset && (
          <p className="text-sm text-[var(--fg-muted)]">
            A reset email will be sent to <strong className="text-[var(--fg)]">{confirmReset.fullName}</strong>
            {!isPlaceholderEmail(confirmReset.email) && <> at <strong className="text-[var(--fg)]">{confirmReset.email}</strong></>}.
            The link expires in 2 hours.
          </p>
        )}
      </Modal>
    </TeacherShell>
  );
}
