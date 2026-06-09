import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getProject, updateProject, deleteProject, assignStudentsToProject, removeStudentFromProject, reviewProject } from "../api";
import TeacherShell from "../components/TeacherShell";
import { Avatar } from "../components/ui/Avatar";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Icon } from "../components/ui/Icons";
import { Input } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import type { Project, ProjectStatus } from "../types";

const STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "archived", label: "Archived" },
];

const STATUS_TONE: Record<ProjectStatus, "success" | "info" | "neutral"> = {
  active: "success",
  completed: "info",
  archived: "neutral",
};

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDeadline, setEditDeadline] = useState("");
  const [editStatus, setEditStatus] = useState<ProjectStatus>("active");
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignInput, setAssignInput] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineComment, setDeclineComment] = useState("");
  const [reviewing, setReviewing] = useState(false);

  const [previewHeight, setPreviewHeight] = useState(400);
  const resizing = useRef(false);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    getProject(id)
      .then((p) => {
        setProject(p);
        setEditTitle(p.title);
        setEditDescription(p.description ?? "");
        setEditDeadline(p.deadline ?? "");
        setEditStatus(p.status);
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!resizing.current || !previewRef.current) return;
      const rect = previewRef.current.getBoundingClientRect();
      const h = e.clientY - rect.top;
      setPreviewHeight(Math.max(200, Math.min(1200, h)));
    }
    function onMouseUp() {
      resizing.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  function onResizeStart(e: React.MouseEvent) {
    e.preventDefault();
    resizing.current = true;
    document.body.style.cursor = "ns-resize";
    document.body.style.userSelect = "none";
  }

  async function handleSave() {
    if (!project) return;
    const updated = await updateProject(project.id, {
      title: editTitle,
      description: editDescription || null,
      deadline: editDeadline || null,
      status: editStatus,
    });
    setProject(updated);
    setEditOpen(false);
  }

  async function handleDelete() {
    if (!project) return;
    setDeleting(true);
    try {
      await deleteProject(project.id);
      navigate("/teacher/projects");
    } finally {
      setDeleting(false);
      setDeleteConfirmOpen(false);
    }
  }

  async function handleAssign() {
    if (!project) return;
    const ids = assignInput.split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.length === 0) return;
    await assignStudentsToProject(project.id, ids);
    const refreshed = await getProject(project.id);
    setProject(refreshed);
    setAssignInput("");
    setAssignOpen(false);
  }

  async function handleRemoveStudent(studentId: string) {
    if (!project) return;
    await removeStudentFromProject(project.id, studentId);
    setProject((p) => p ? { ...p, students: p.students?.filter((s) => s.id !== studentId), studentIds: p.studentIds.filter((id) => id !== studentId) } : p);
  }

  async function handleReview(action: "accepted" | "declined") {
    if (!project) return;
    setReviewing(true);
    try {
      const updated = await reviewProject(project.id, action, action === "declined" ? declineComment || undefined : undefined);
      setProject(updated);
      setDeclineOpen(false);
      setDeclineComment("");
    } finally {
      setReviewing(false);
    }
  }

  if (loading) {
    return (
      <TeacherShell section="projects">
        <div className="text-sm text-[var(--fg-muted)]">Loading...</div>
      </TeacherShell>
    );
  }

  if (!project) {
    return (
      <TeacherShell section="projects">
        <div className="text-sm text-[var(--fg-muted)]">Project not found.</div>
      </TeacherShell>
    );
  }

  const studentCount = project.students?.length ?? 0;

  return (
    <TeacherShell section="projects">
      <div className="max-w-6xl space-y-8">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-xs text-[var(--fg-muted)]">
          <Link to="/teacher/projects" className="transition-colors hover:text-[var(--fg)]">Projects</Link>
          <Icon.ChevronRight className="h-3 w-3" />
          <span className="font-medium text-[var(--fg)]">{project.title}</span>
        </nav>

        {/* Header section */}
        <div className="space-y-1">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight text-[var(--fg)]">{project.title}</h1>
              <Badge tone={STATUS_TONE[project.status]}>
                {project.status.charAt(0).toUpperCase() + project.status.slice(1)}
              </Badge>
              {project.reviewStatus && (
                <Badge tone={project.reviewStatus === "accepted" ? "success" : "danger"} dot>
                  {project.reviewStatus === "accepted" ? "Accepted" : "Declined"}
                </Badge>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>Edit</Button>
              <Button variant="ghost" size="sm" onClick={() => setDeleteConfirmOpen(true)} className="text-[var(--fg-muted)] hover:text-[var(--danger)]">Delete</Button>
            </div>
          </div>
          {project.description && (
            <p className="max-w-prose text-sm leading-relaxed text-[var(--fg-muted)]">{project.description}</p>
          )}
          <div className="flex items-center gap-3 pt-1 text-xs text-[var(--fg-subtle)]">
            <span>Created by <strong className="font-medium text-[var(--fg-muted)]">{project.createdByName}</strong></span>
            <span className="text-[var(--border)]">·</span>
            <span>{new Date(project.createdAt).toLocaleDateString()}</span>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
          {/* ── Left column ── */}
          <div className="space-y-6">
            {/* Submission */}
            <Card className="overflow-hidden">
              <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--surface-muted)]/50 px-5 py-3">
                <Icon.Upload className="h-4 w-4 text-[var(--fg-muted)]" />
                <h2 className="text-sm font-semibold text-[var(--fg)]">Submission</h2>
              </div>

              {project.deployedUrl ? (
                <div className="space-y-5 px-5 py-5">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]">Deployed URL</label>
                    <div className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3.5 py-2.5">
                      <Icon.Link className="h-4 w-4 shrink-0 text-[var(--fg-muted)]" />
                      <a
                        href={project.deployedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--accent)] transition-colors hover:text-[var(--accent)]/80"
                      >
                        {project.deployedUrl}
                      </a>
                      <span className="shrink-0 text-xs text-[var(--fg-muted)]">↗</span>
                    </div>
                  </div>

                  {project.submittedAt && (
                    <div className="flex items-center gap-2 text-xs text-[var(--fg-muted)]">
                      <Icon.Clock className="h-3.5 w-3.5" />
                      <span>Submitted <strong className="font-medium text-[var(--fg)]">{new Date(project.submittedAt).toLocaleString()}</strong></span>
                    </div>
                  )}

                  {/* Browser preview */}
                  <div ref={previewRef} className="overflow-hidden rounded-lg border border-[var(--border)]">
                    <div className="flex items-center gap-1.5 border-b border-[var(--border)] bg-[var(--surface-muted)]/70 px-3 py-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-[var(--danger)]" />
                      <span className="h-2.5 w-2.5 rounded-full bg-[#f5c33b]" />
                      <span className="h-2.5 w-2.5 rounded-full bg-[var(--success)]" />
                      <span className="ml-2 min-w-0 flex-1 truncate rounded bg-[var(--bg)] px-2 py-0.5 text-[11px] text-[var(--fg-muted)]">
                        {project.deployedUrl}
                      </span>
                      <a
                        href={project.deployedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 rounded p-1 text-[var(--fg-subtle)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--fg)]"
                        title="Open in new tab"
                      >
                        <Icon.External className="h-3.5 w-3.5" />
                      </a>
                    </div>
                    <iframe
                      src={project.deployedUrl}
                      style={{ height: previewHeight }}
                      className="w-full border-0"
                      sandbox="allow-scripts allow-same-origin"
                      title="Project preview"
                    />
                    <div
                      className="flex cursor-ns-resize items-center justify-center border-t border-[var(--border)] bg-[var(--surface-muted)]/30 py-1 transition-colors hover:bg-[var(--surface-muted)]"
                      onMouseDown={onResizeStart}
                    >
                      <div className="h-1 w-8 rounded-full bg-[var(--border)]" />
                    </div>
                  </div>

                  {project.reviewStatus ? (
                    <div className="flex items-start gap-3 rounded-lg bg-[var(--surface-muted)] px-4 py-3">
                      <Icon.Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--success)]" />
                      <div>
                        <p className="text-sm font-medium text-[var(--fg)]">
                          {project.reviewStatus === "accepted" ? "Submission accepted" : "Submission declined"}
                        </p>
                        {project.reviewComment && (
                          <p className="mt-1 text-sm text-[var(--fg-muted)]">"{project.reviewComment}"</p>
                        )}
                      </div>
                    </div>
                  ) : project.status === "completed" && (
                    <div className="space-y-4 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)]/30 px-4 py-4">
                      <p className="text-xs font-medium text-[var(--fg-muted)]">Review this submission before marking.</p>
                      <div className="flex items-center gap-2">
                        <Button size="sm" onClick={() => handleReview("accepted")} loading={reviewing}>
                          Accept submission
                        </Button>
                        <Button size="sm" variant="outline" className="border-[var(--danger)] text-[var(--danger)] hover:bg-[var(--danger-soft)]" onClick={() => setDeclineOpen(true)}>
                          Decline submission
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 px-5 py-14 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--accent-soft)]">
                    <Icon.Folder className="h-6 w-6 text-[var(--accent)]" />
                  </div>
                  <div>
                    <p className="font-medium text-[var(--fg)]">Awaiting submission</p>
                    <p className="mt-0.5 text-sm text-[var(--fg-muted)]">This project hasn't been submitted yet.</p>
                  </div>
                </div>
              )}
            </Card>

            {/* Deadline */}
            {project.deadline && (
              <Card className="flex items-center gap-3 px-5 py-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--surface-muted)]">
                  <Icon.Clock className="h-4 w-4 text-[var(--fg-muted)]" />
                </div>
                <div>
                  <p className="text-xs font-medium text-[var(--fg)]">Deadline</p>
                  <p className="text-sm text-[var(--fg-muted)]">{new Date(project.deadline).toLocaleString()}</p>
                </div>
              </Card>
            )}
          </div>

          {/* ── Right column — Students ── */}
          <div>
            <Card className="flex h-full flex-col overflow-hidden">
              <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-muted)]/50 px-5 py-3">
                <div className="flex items-center gap-2">
                  <Icon.Users className="h-4 w-4 text-[var(--fg-muted)]" />
                  <h2 className="text-sm font-semibold text-[var(--fg)]">Students</h2>
                </div>
                <span className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-[11px] font-medium text-[var(--fg-muted)]">
                  {studentCount}
                </span>
              </div>

              {studentCount === 0 ? (
                <div className="flex flex-1 items-center justify-center px-5 py-12 text-center">
                  <div>
                    <p className="font-medium text-[var(--fg)]">No students yet</p>
                    <p className="mt-0.5 text-sm text-[var(--fg-muted)]">Assign students to this project.</p>
                  </div>
                </div>
              ) : (
                <div className="flex-1 divide-y divide-[var(--border)]">
                  {project.students!.map((student) => (
                    <div key={student.id} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-[var(--surface-muted)]/30">
                      <Avatar name={student.fullName} size="xs" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[var(--fg)]">{student.fullName}</p>
                        <p className="truncate text-xs text-[var(--fg-muted)]">{student.email}</p>
                      </div>
                      <button
                        onClick={() => handleRemoveStudent(student.id)}
                        className="shrink-0 text-xs text-[var(--fg-subtle)] transition-colors hover:text-[var(--danger)]"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="border-t border-[var(--border)] px-5 py-4">
                <Button variant="secondary" size="sm" className="w-full" onClick={() => setAssignOpen(true)}>
                  <Icon.Plus className="h-3.5 w-3.5" />
                  Add students
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Project">
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--fg)]">Title</label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--fg)]">Description</label>
              <textarea
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)]"
                rows={3}
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--fg)]">Deadline</label>
              <Input type="datetime-local" value={editDeadline} onChange={(e) => setEditDeadline(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--fg)]">Status</label>
              <select
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)]"
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value as ProjectStatus)}
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button onClick={handleSave}>Save</Button>
            </div>
          </div>
        </Modal>

      <Modal open={assignOpen} onClose={() => setAssignOpen(false)} title="Assign Students">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--fg)]">Student IDs (comma-separated)</label>
            <textarea
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)]"
              rows={3}
              placeholder="student-id-1, student-id-2"
              value={assignInput}
              onChange={(e) => setAssignInput(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setAssignOpen(false)}>Cancel</Button>
            <Button onClick={handleAssign}>Assign</Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={declineOpen}
        onClose={() => setDeclineOpen(false)}
        title="Decline project?"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeclineOpen(false)}>Cancel</Button>
            <Button variant="danger" onClick={() => handleReview("declined")} loading={reviewing}>
              {reviewing ? "Declining..." : "Decline"}
            </Button>
          </div>
        }
      >
        {project && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--fg-muted)]">
              This will mark <strong className="text-[var(--fg)]">{project.title}</strong> as declined.
            </p>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--fg)]">Comment (optional)</label>
              <textarea
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)]"
                rows={3}
                value={declineComment}
                onChange={(e) => setDeclineComment(e.target.value)}
                placeholder="What needs to be improved?"
              />
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        title="Delete project?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
            <Button variant="danger" onClick={handleDelete} loading={deleting}>
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </>
        }
      >
        {project && (
          <p className="text-sm text-[var(--fg-muted)]">
            This will permanently delete <strong className="text-[var(--fg)]">{project.title}</strong>.
            This cannot be undone.
          </p>
        )}
      </Modal>
    </TeacherShell>
  );
}
