import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getProject, listProjects, listStudents, updateProject, deleteProject } from "../api";
import TeacherShell from "../components/TeacherShell";
import { Avatar } from "../components/ui/Avatar";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Icon } from "../components/ui/Icons";
import { Input } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import type { Project, ProjectStatus, StudentRecord } from "../types";

const STATUS_LABELS: Record<ProjectStatus, string> = {
  active: "Active",
  completed: "Completed",
  archived: "Archived",
};

const STATUS_TONES: Record<ProjectStatus, "success" | "info" | "neutral"> = {
  active: "success",
  completed: "info",
  archived: "neutral",
};

const STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "archived", label: "Archived" },
];

export default function TeacherStudentProjectsPage() {
  const { studentId } = useParams<{ studentId: string }>();
  const [projects, setProjects] = useState<Project[]>([]);
  const [student, setStudent] = useState<StudentRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  const [editTarget, setEditTarget] = useState<Project | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDeadline, setEditDeadline] = useState("");
  const [editStatus, setEditStatus] = useState<ProjectStatus>("active");
  const [saving, setSaving] = useState(false);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!studentId) return;
    Promise.all([listProjects(studentId), listStudents()])
      .then(([p, s]) => {
        setProjects(p);
        setStudent(s.find((st) => st.id === studentId) ?? null);
      })
      .finally(() => setLoading(false));
  }, [studentId]);

  async function handleToggle(project: Project) {
    setToggling(project.id);
    try {
      const newStatus = project.status === "active" ? "completed" : "active";
      await updateProject(project.id, { status: newStatus });
      setProjects((prev) =>
        prev.map((p) => (p.id === project.id ? { ...p, status: newStatus } : p)),
      );
    } finally {
      setToggling(null);
    }
  }

  function openEdit(project: Project) {
    setEditTarget(project);
    setEditTitle(project.title);
    setEditDescription(project.description ?? "");
    setEditDeadline(project.deadline ?? "");
    setEditStatus(project.status);
  }

  async function handleSave() {
    if (!editTarget) return;
    setSaving(true);
    try {
      const updated = await updateProject(editTarget.id, {
        title: editTitle,
        description: editDescription || null,
        deadline: editDeadline || null,
        status: editStatus,
      });
      setProjects((prev) =>
        prev.map((p) => (p.id === editTarget.id ? updated : p)),
      );
      setEditTarget(null);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!editTarget) return;
    setDeleting(true);
    try {
      await deleteProject(editTarget.id);
      setProjects((prev) => prev.filter((p) => p.id !== editTarget.id));
      setEditTarget(null);
      setDeleteConfirmOpen(false);
    } finally {
      setDeleting(false);
    }
  }

  function formatDate(d: string | null): string {
    if (!d) return "";
    return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  if (loading) {
    return (
      <TeacherShell section="projects">
        <div className="text-sm text-[var(--fg-muted)]">Loading...</div>
      </TeacherShell>
    );
  }

  return (
    <TeacherShell section="projects">
      <div className="max-w-4xl space-y-8">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-xs text-[var(--fg-muted)]">
          <Link to="/teacher/projects" className="transition-colors hover:text-[var(--fg)]">Projects</Link>
          <Icon.ChevronRight className="h-3 w-3" />
          <span className="font-medium text-[var(--fg)]">{student?.fullName ?? "Student"}</span>
        </nav>

        <div className="flex items-center gap-4">
          {student && <Avatar name={student.fullName} size="md" />}
          <div className="space-y-0.5">
            <h1 className="text-3xl font-bold tracking-tight text-[var(--fg)]">{student?.fullName ?? "Student"}</h1>
            <p className="text-sm text-[var(--fg-muted)]">
              {projects.length} {projects.length === 1 ? "project" : "projects"}
            </p>
          </div>
        </div>

        {projects.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 px-5 py-14 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--accent-soft)]">
              <Icon.Folder className="h-6 w-6 text-[var(--accent)]" />
            </div>
            <div>
              <p className="font-medium text-[var(--fg)]">No projects</p>
              <p className="mt-0.5 text-sm text-[var(--fg-muted)]">This student hasn't been assigned any projects yet.</p>
            </div>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="divide-y divide-[var(--border)]">
              {projects.map((project) => {
                const checked = project.status === "completed" && project.reviewStatus !== "declined";
                return (
                  <div
                    key={project.id}
                    className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-[var(--surface-muted)]/30"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={toggling === project.id}
                      onChange={() => handleToggle(project)}
                      className="h-4 w-4 rounded border-[var(--border)] text-[var(--accent)] accent-[var(--accent)]"
                    />
                    <button
                      onClick={() => openEdit(project)}
                      className={`min-w-0 flex-1 text-left text-sm font-medium ${
                        checked ? "text-[var(--fg-muted)] line-through" : "text-[var(--fg)]"
                      } transition-colors hover:text-[var(--accent)]`}
                    >
                      {project.title}
                    </button>
                    {project.deadline && (
                      <span className="shrink-0 text-xs text-[var(--fg-muted)]">{formatDate(project.deadline)}</span>
                    )}
                    {project.reviewStatus === "declined" ? (
                      <Badge tone="danger">Declined</Badge>
                    ) : (
                      <Badge tone={STATUS_TONES[project.status]}>{STATUS_LABELS[project.status]}</Badge>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>

      <Modal
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title={editTarget?.title ?? "Edit Project"}
        footer={
          <div className="flex w-full items-center justify-between">
            <Button variant="danger" onClick={() => setDeleteConfirmOpen(true)}>
              Delete
            </Button>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setEditTarget(null)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving || !editTitle.trim()}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        }
      >
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
        </div>
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
        {editTarget && (
          <p className="text-sm text-[var(--fg-muted)]">
            This will permanently delete <strong className="text-[var(--fg)]">{editTarget.title}</strong>.
            This cannot be undone.
          </p>
        )}
      </Modal>
    </TeacherShell>
  );
}
