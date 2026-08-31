import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getProject, updateProject, deleteProject } from "../api";
import { useAuth } from "../context/AuthContext";
import StudentShell from "../components/StudentShell";
import { ProjectBriefField } from "../components/ProjectBriefField";
import { ProjectBriefViewer } from "../components/ProjectBriefViewer";
import { Avatar } from "../components/ui/Avatar";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Icon } from "../components/ui/Icons";
import { Input } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import type { Project, ProjectStatus } from "../types";

const STATUS_LABELS: Record<ProjectStatus, string> = {
  active: "Active",
  completed: "Completed",
  archived: "Archived",
};

const STATUS_TONE: Record<ProjectStatus, "success" | "info" | "neutral"> = {
  active: "success",
  completed: "info",
  archived: "neutral",
};

export default function StudentProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDeadline, setEditDeadline] = useState("");
  const [editBriefPdfPath, setEditBriefPdfPath] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [previewHeight, setPreviewHeight] = useState(400);
  const [previewDevice, setPreviewDevice] = useState<"laptop" | "tablet" | "mobile">("laptop");
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
        setEditBriefPdfPath(p.briefPdfPath ?? null);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Could not load this project"))
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

  const isCreator = project && user && project.createdBy === user.id;

  async function handleSave() {
    if (!project) return;
    setSaving(true);
    try {
      const updated = await updateProject(project.id, {
        title: editTitle,
        description: editDescription || null,
        deadline: editDeadline || null,
        briefPdfPath: editBriefPdfPath,
      });
      setProject(updated);
      setEditOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!project) return;
    setDeleting(true);
    try {
      await deleteProject(project.id);
      navigate("/student/projects");
    } finally {
      setDeleting(false);
      setDeleteConfirmOpen(false);
    }
  }

  if (loading) {
    return (
      <StudentShell section="projects">
        <div className="text-sm text-[var(--fg-muted)]">Loading...</div>
      </StudentShell>
    );
  }

  if (!project) {
    return (
      <StudentShell section="projects">
        <div className="text-sm text-[var(--fg-muted)]">{loadError || "Project not found."}</div>
      </StudentShell>
    );
  }

  return (
    <StudentShell section="projects">
      <div className="max-w-4xl space-y-8">
        {/* Back + header */}
        <div>
          <button onClick={() => navigate("/student/projects")} className="mb-3 flex items-center gap-1 text-xs text-[var(--fg-muted)] transition-colors hover:text-[var(--fg)]">
            <Icon.ChevronLeft className="h-3 w-3" />
            Back to projects
          </button>

          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight text-[var(--fg)]">{project.title}</h1>
              <Badge tone={STATUS_TONE[project.status]}>
                {STATUS_LABELS[project.status]}
              </Badge>
              {project.reviewStatus && (
                <Badge tone={project.reviewStatus === "accepted" ? "success" : "danger"} dot>
                  {project.reviewStatus === "accepted" ? "Accepted" : "Declined"}
                </Badge>
              )}
            </div>
            {isCreator && (
              <div className="flex shrink-0 gap-1.5">
                <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>Edit</Button>
                <Button variant="ghost" size="sm" onClick={() => setDeleteConfirmOpen(true)} className="text-[var(--fg-muted)] hover:text-[var(--danger)]">Delete</Button>
              </div>
            )}
          </div>
          {project.description && (
            <p className="mt-2 max-w-prose text-sm leading-relaxed text-[var(--fg-muted)]">{project.description}</p>
          )}
          <p className="mt-2 text-xs text-[var(--fg-subtle)]">
            Created by <strong className="font-medium text-[var(--fg-muted)]">{project.createdByName}</strong>
            <span className="mx-1.5 text-[var(--border)]">·</span>
            {new Date(project.createdAt).toLocaleDateString()}
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
          {/* Submission */}
          <div className="space-y-6">
            {project.deployedUrl ? (
              <Card className="overflow-hidden">
                <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--surface-muted)]/50 px-5 py-3">
                  <Icon.Upload className="h-4 w-4 text-[var(--fg-muted)]" />
                  <h2 className="text-sm font-semibold text-[var(--fg)]">Submission</h2>
                </div>
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
                      <div className="flex shrink-0 items-center gap-0.5 rounded-md bg-[var(--bg)] p-0.5">
                        {([
                          ["laptop", "Laptop"],
                          ["tablet", "Tablet"],
                          ["mobile", "Mobile"],
                        ] as const).map(([key, label]) => (
                          <button
                            key={key}
                            onClick={() => setPreviewDevice(key)}
                            className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                              previewDevice === key
                                ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                                : "text-[var(--fg-muted)] hover:text-[var(--fg)]"
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
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
                    <div className="flex justify-center bg-[var(--surface-muted)]/20">
                      <div
                        className="overflow-hidden transition-all duration-200"
                        style={{
                          width: previewDevice === "laptop" ? "100%" : previewDevice === "tablet" ? 768 : 375,
                          maxWidth: "100%",
                        }}
                      >
                        <iframe
                          src={project.deployedUrl}
                          style={{ height: previewHeight, width: "100%" }}
                          className="border-0"
                          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-storage-access-by-user-activation"
                          title="Project preview"
                        />
                      </div>
                    </div>
                    <div
                      className="flex cursor-ns-resize items-center justify-center border-t border-[var(--border)] bg-[var(--surface-muted)]/30 py-1 transition-colors hover:bg-[var(--surface-muted)]"
                      onMouseDown={onResizeStart}
                    >
                      <div className="h-1 w-8 rounded-full bg-[var(--border)]" />
                    </div>
                  </div>

                  {project.reviewStatus && (
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
                  )}
                </div>
              </Card>
            ) : (
              <Card>
                <div className="flex flex-col items-center gap-3 px-5 py-14 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--accent-soft)]">
                    <Icon.Folder className="h-6 w-6 text-[var(--accent)]" />
                  </div>
                  <div>
                    <p className="font-medium text-[var(--fg)]">Awaiting submission</p>
                    <p className="mt-0.5 text-sm text-[var(--fg-muted)]">This project hasn't been submitted yet.</p>
                  </div>
                </div>
              </Card>
            )}

            <ProjectBriefViewer projectId={project.id} briefPdfPath={project.briefPdfPath} />

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

          {/* Teammates */}
          {project.students && project.students.length > 0 && (
            <div>
              <Card className="overflow-hidden">
                <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-muted)]/50 px-5 py-3">
                  <div className="flex items-center gap-2">
                    <Icon.Users className="h-4 w-4 text-[var(--fg-muted)]" />
                    <h2 className="text-sm font-semibold text-[var(--fg)]">Teammates</h2>
                  </div>
                  <span className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-[11px] font-medium text-[var(--fg-muted)]">
                    {project.students.length}
                  </span>
                </div>
                <div className="divide-y divide-[var(--border)]">
                  {project.students.map((student) => (
                    <div key={student.id} className="flex items-center gap-3 px-5 py-3">
                      <Avatar name={student.fullName} size="xs" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[var(--fg)]">{student.fullName}</p>
                        <p className="truncate text-xs text-[var(--fg-muted)]">{student.email}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}
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
          <ProjectBriefField briefPdfPath={editBriefPdfPath} onChange={setEditBriefPdfPath} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
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
        {project && (
          <p className="text-sm text-[var(--fg-muted)]">
            This will permanently delete <strong className="text-[var(--fg)]">{project.title}</strong>.
            This cannot be undone.
          </p>
        )}
      </Modal>
    </StudentShell>
  );
}
