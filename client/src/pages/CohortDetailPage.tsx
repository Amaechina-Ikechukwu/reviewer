import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  addStudentsToCohort,
  api,
  deleteCohort,
  getCohort,
  removeStudentFromCohort,
  updateCohort,
} from "../api";
import TeacherShell from "../components/TeacherShell";
import { toast } from "../components/Toast";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icons";
import { Input, Select } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import type { Cohort, StudentRecord, Track } from "../types";
import { TRACKS } from "../types";

const TRACK_COLORS: Record<Track, string> = {
  frontend: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  backend: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  data_analytics: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  product_design: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
  digital_marketing: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  cyber_security: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

function TrackBadge({ track }: { track: Track }) {
  const label = TRACKS.find((t) => t.value === track)?.label ?? track;
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${TRACK_COLORS[track]}`}>
      {label}
    </span>
  );
}

type StudentInCohort = StudentRecord & { pending: boolean };

type GradebookRow = {
  student: { id: string; fullName: string; email: string };
  scores: Record<string, { score: number | null; maxScore: number; submissionId: string } | null>;
  grandTotal: number;
  grandMaxTotal: number;
};

type GradebookData = {
  assignments: { id: string; title: string; maxScore: number }[];
  rows: GradebookRow[];
};

export default function CohortDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [cohort, setCohort] = useState<Cohort | null>(null);
  const [cohortStudents, setCohortStudents] = useState<StudentInCohort[]>([]);
  const [allStudents, setAllStudents] = useState<StudentRecord[]>([]);
  const [gradebook, setGradebook] = useState<GradebookData | null>(null);
  const [loading, setLoading] = useState(true);

  // Edit cohort modal
  const [editOpen, setEditOpen] = useState(false);
  const [formName, setFormName] = useState("");
  const [formTrack, setFormTrack] = useState<Track>("frontend");
  const [formDesc, setFormDesc] = useState("");
  const [saving, setSaving] = useState(false);

  // Delete cohort modal
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Add students modal (multi-select)
  const [addOpen, setAddOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [addingStudents, setAddingStudents] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");

  // Remove student confirmation
  const [removeTarget, setRemoveTarget] = useState<StudentInCohort | null>(null);
  const [removing, setRemoving] = useState(false);

  // Student performance modal
  const [perfStudent, setPerfStudent] = useState<StudentInCohort | null>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      getCohort(id),
      api<StudentRecord[]>("/students"),
      api<GradebookData>("/gradebook"),
    ])
      .then(([cohortData, students, gb]) => {
        setCohort(cohortData as unknown as Cohort);
        setCohortStudents((cohortData as any).students ?? []);
        setAllStudents(students);
        setGradebook(gb);
      })
      .catch(() => toast().error("Failed to load cohort"))
      .finally(() => setLoading(false));
  }, [id]);

  function openEdit() {
    if (!cohort) return;
    setFormName(cohort.name);
    setFormTrack(cohort.track);
    setFormDesc(cohort.description ?? "");
    setEditOpen(true);
  }

  async function handleEditSave() {
    if (!cohort || !formName.trim()) return;
    setSaving(true);
    try {
      const updated = await updateCohort(cohort.id, { name: formName, track: formTrack, description: formDesc || null });
      setCohort((prev) => prev ? { ...prev, ...updated } : prev);
      toast().success("Cohort updated");
      setEditOpen(false);
    } catch (err: any) {
      toast().error(err.message ?? "Failed to update cohort");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteCohort() {
    if (!cohort) return;
    setDeleting(true);
    try {
      await deleteCohort(cohort.id);
      toast().success("Cohort deleted");
      navigate("/teacher/cohorts");
    } catch (err: any) {
      toast().error(err.message ?? "Failed to delete cohort");
    } finally {
      setDeleting(false);
    }
  }

  function openAddStudents() {
    setSelectedIds(new Set());
    setStudentSearch("");
    setAddOpen(true);
  }

  function toggleStudent(studentId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  }

  async function handleAddStudents() {
    if (!id || selectedIds.size === 0) return;
    setAddingStudents(true);
    try {
      await addStudentsToCohort(id, [...selectedIds]);
      // Refresh cohort students
      const updated = await getCohort(id);
      setCohortStudents((updated as any).students ?? []);
      toast().success(`${selectedIds.size} student${selectedIds.size !== 1 ? "s" : ""} added`);
      setAddOpen(false);
    } catch (err: any) {
      toast().error(err.message ?? "Failed to add students");
    } finally {
      setAddingStudents(false);
    }
  }

  async function handleRemoveStudent() {
    if (!id || !removeTarget) return;
    setRemoving(true);
    try {
      await removeStudentFromCohort(id, removeTarget.id);
      setCohortStudents((prev) => prev.filter((s) => s.id !== removeTarget.id));
      toast().success("Student removed from cohort");
      setRemoveTarget(null);
    } catch (err: any) {
      toast().error(err.message ?? "Failed to remove student");
    } finally {
      setRemoving(false);
    }
  }

  // Students not already in this cohort
  const cohortMemberIds = new Set(cohortStudents.map((s) => s.id));
  const availableStudents = allStudents.filter((s) => !cohortMemberIds.has(s.id));
  const filteredAvailable = availableStudents.filter((s) => {
    const q = studentSearch.toLowerCase();
    return !q || s.fullName.toLowerCase().includes(q) || s.email.toLowerCase().includes(q);
  });

  function getStudentPerf(studentId: string) {
    if (!gradebook) return null;
    return gradebook.rows.find((r) => r.student.id === studentId) ?? null;
  }

  if (loading) {
    return (
      <TeacherShell section="cohorts">
        <p className="text-sm text-[var(--fg-muted)]">Loading…</p>
      </TeacherShell>
    );
  }

  if (!cohort) {
    return (
      <TeacherShell section="cohorts">
        <p className="text-sm text-[var(--fg-muted)]">Cohort not found.</p>
      </TeacherShell>
    );
  }

  return (
    <TeacherShell section="cohorts">
      <div className="space-y-6">
        {/* Back link */}
        <Link
          to="/teacher/cohorts"
          className="inline-flex items-center gap-1 text-xs font-medium text-[var(--fg-muted)] hover:text-[var(--accent)]"
        >
          <Icon.ChevronLeft className="h-3 w-3" />
          All cohorts
        </Link>

        {/* Cohort header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-[var(--fg)]">{cohort.name}</h1>
              <TrackBadge track={cohort.track} />
            </div>
            {cohort.description && (
              <p className="mt-1 text-sm text-[var(--fg-muted)]">{cohort.description}</p>
            )}
            <p className="mt-1 text-xs text-[var(--fg-subtle)]">
              {cohortStudents.length} student{cohortStudents.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={openEdit}>
              <Icon.Edit className="h-3.5 w-3.5 mr-1" /> Edit
            </Button>
            <Button variant="secondary" size="sm" onClick={openAddStudents}>
              <Icon.Plus className="h-3.5 w-3.5 mr-1" /> Add students
            </Button>
            <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}>
              <Icon.Trash className="h-3.5 w-3.5 mr-1" /> Delete cohort
            </Button>
          </div>
        </div>

        {/* Student list */}
        {cohortStudents.length === 0 ? (
          <div className="rounded border border-dashed border-[var(--border)] py-12 text-center">
            <Icon.Users className="mx-auto mb-3 h-8 w-8 text-[var(--fg-subtle)]" />
            <p className="text-sm font-medium text-[var(--fg)]">No students yet</p>
            <p className="mt-1 text-xs text-[var(--fg-muted)]">Add students to this cohort to get started.</p>
            <Button className="mt-4" onClick={openAddStudents}>Add students</Button>
          </div>
        ) : (
          <div className="rounded border border-[var(--border)] bg-[var(--surface)] divide-y divide-[var(--border)]">
            {cohortStudents.map((student) => {
              const perf = getStudentPerf(student.id);
              const pct = perf && perf.grandMaxTotal > 0
                ? Math.round((perf.grandTotal / perf.grandMaxTotal) * 100)
                : null;
              return (
                <div
                  key={student.id}
                  className="flex cursor-pointer items-center gap-4 px-4 py-3 hover:bg-[var(--surface-muted)] transition-colors"
                  onClick={() => setPerfStudent(student)}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/10 text-xs font-semibold text-[var(--accent)]">
                    {student.fullName.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[var(--fg)]">{student.fullName}</span>
                      {student.pending && (
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--fg-subtle)] border border-[var(--border)] rounded px-1">
                          Pending
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-[var(--fg-muted)]">{student.email}</span>
                  </div>
                  {pct !== null && (
                    <div className="text-right">
                      <span className="text-sm font-semibold text-[var(--fg)]">{pct}%</span>
                      <span className="block text-[10px] text-[var(--fg-subtle)]">avg score</span>
                    </div>
                  )}
                  <Icon.ChevronRight className="h-4 w-4 shrink-0 text-[var(--fg-subtle)]" />
                  <button
                    type="button"
                    title="Remove from cohort"
                    className="rounded p-1.5 text-[var(--fg-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--danger)]"
                    onClick={(e) => { e.stopPropagation(); setRemoveTarget(student); }}
                  >
                    <Icon.X className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit cohort modal */}
      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit cohort"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleEditSave} disabled={!formName.trim() || saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4 py-1">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--fg)]">Name</label>
            <Input value={formName} onChange={(e) => setFormName(e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--fg)]">Track</label>
            <Select
              value={formTrack}
              onChange={(e) => setFormTrack(e.target.value as Track)}
            >
              {TRACKS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--fg)]">Description <span className="text-[var(--fg-subtle)]">(optional)</span></label>
            <Input value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder="Brief description…" />
          </div>
        </div>
      </Modal>

      {/* Delete cohort modal */}
      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete cohort"
        description={`Delete "${cohort.name}"? Students will be unlinked but not deleted.`}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="danger" onClick={handleDeleteCohort} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete cohort"}
            </Button>
          </div>
        }
      >
        <span />
      </Modal>

      {/* Add students modal (multi-select) */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add students to cohort"
        size="md"
        footer={
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-[var(--fg-muted)]">
              {selectedIds.size} selected
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button onClick={handleAddStudents} disabled={selectedIds.size === 0 || addingStudents}>
                {addingStudents ? "Adding…" : `Add ${selectedIds.size > 0 ? selectedIds.size : ""} student${selectedIds.size !== 1 ? "s" : ""}`}
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-3 py-1">
          <Input
            placeholder="Search students…"
            value={studentSearch}
            onChange={(e) => setStudentSearch(e.target.value)}
          />
          {filteredAvailable.length === 0 ? (
            <p className="py-4 text-center text-sm text-[var(--fg-muted)]">
              {availableStudents.length === 0 ? "All students are already in this cohort." : "No students match your search."}
            </p>
          ) : (
            <div className="max-h-72 overflow-y-auto divide-y divide-[var(--border)] rounded border border-[var(--border)]">
              {filteredAvailable.map((s) => (
                <label
                  key={s.id}
                  className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-[var(--surface-muted)] transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(s.id)}
                    onChange={() => toggleStudent(s.id)}
                    className="h-4 w-4 rounded border-[var(--border)] text-[var(--accent)] accent-[var(--accent)]"
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-[var(--fg)]">{s.fullName}</div>
                    <div className="text-xs text-[var(--fg-muted)]">{s.email}</div>
                  </div>
                  {s.cohortId && (
                    <span className="ml-auto shrink-0 text-[10px] text-[var(--fg-subtle)]">in another cohort</span>
                  )}
                </label>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* Remove student confirmation */}
      <Modal
        open={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        title="Remove student from cohort"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRemoveTarget(null)}>Cancel</Button>
            <Button variant="danger" onClick={handleRemoveStudent} disabled={removing}>
              {removing ? "Removing…" : "Remove student"}
            </Button>
          </div>
        }
      >
        {removeTarget && (
          <p className="text-sm text-[var(--fg-muted)]">
            Remove <strong className="text-[var(--fg)]">{removeTarget.fullName}</strong> from this cohort? They will not be deleted.
          </p>
        )}
      </Modal>

      {/* Student performance modal */}
      <Modal
        open={!!perfStudent}
        onClose={() => setPerfStudent(null)}
        title={perfStudent?.fullName ?? "Student"}
        size="lg"
        footer={
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setPerfStudent(null)}>Close</Button>
          </div>
        }
      >
        {perfStudent && (() => {
          const perf = getStudentPerf(perfStudent.id);
          return (
            <div className="space-y-4 py-1">
              {/* Profile */}
              <div className="flex items-center gap-3 rounded border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/10 text-sm font-semibold text-[var(--accent)]">
                  {perfStudent.fullName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[var(--fg)]">{perfStudent.fullName}</span>
                    {perfStudent.pending && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--fg-subtle)] border border-[var(--border)] rounded px-1">Pending</span>
                    )}
                  </div>
                  <span className="text-xs text-[var(--fg-muted)]">{perfStudent.email}</span>
                </div>
                {perf && perf.grandMaxTotal > 0 && (
                  <div className="ml-auto text-right">
                    <span className="text-lg font-bold text-[var(--fg)]">
                      {Math.round((perf.grandTotal / perf.grandMaxTotal) * 100)}%
                    </span>
                    <span className="block text-xs text-[var(--fg-muted)]">
                      {perf.grandTotal}/{perf.grandMaxTotal} pts overall
                    </span>
                  </div>
                )}
              </div>

              {/* Assignment scores */}
              {perf && gradebook && gradebook.assignments.length > 0 ? (
                <div className="rounded border border-[var(--border)] divide-y divide-[var(--border)]">
                  <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--fg-subtle)]">
                    <span>Assignment</span>
                    <span className="text-right">Score</span>
                    <span className="text-right w-16">Status</span>
                  </div>
                  {gradebook.assignments.map((a) => {
                    const s = perf.scores[a.id];
                    const score = s?.score ?? null;
                    const pct = score !== null && a.maxScore > 0 ? Math.round((score / a.maxScore) * 100) : null;
                    return (
                      <div key={a.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 px-4 py-2.5">
                        <span className="text-sm text-[var(--fg)] truncate">{a.title}</span>
                        <span className="text-sm text-right font-medium text-[var(--fg)]">
                          {score !== null ? `${score}/${a.maxScore}` : "—"}
                        </span>
                        <span className={`w-16 text-right text-xs font-medium ${
                          pct === null ? "text-[var(--fg-subtle)]" :
                          pct >= 70 ? "text-green-600 dark:text-green-400" :
                          pct >= 50 ? "text-yellow-600 dark:text-yellow-400" :
                          "text-red-600 dark:text-red-400"
                        }`}>
                          {pct !== null ? `${pct}%` : "No sub."}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-[var(--fg-muted)]">No assignment data available yet.</p>
              )}
            </div>
          );
        })()}
      </Modal>
    </TeacherShell>
  );
}
