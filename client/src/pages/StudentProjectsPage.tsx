import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listProjects, createProject, submitProject } from "../api";
import StudentShell from "../components/StudentShell";
import { ProjectBriefField } from "../components/ProjectBriefField";
import { toast } from "../components/Toast";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Icon } from "../components/ui/Icons";
import { Input } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import type { Project } from "../types";

export default function StudentProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createDeadline, setCreateDeadline] = useState("");
  const [createBriefPdfPath, setCreateBriefPdfPath] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [submitTarget, setSubmitTarget] = useState<Project | null>(null);
  const [submitUrl, setSubmitUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    try {
      const p = await listProjects();
      setProjects(p);
    } catch (err) {
      toast().error(err instanceof Error ? err.message : "Failed to load projects");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load() }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!createTitle.trim()) return;
    setSaving(true);
    try {
      await createProject({
        title: createTitle.trim(),
        description: createDescription.trim() || null,
        deadline: createDeadline || null,
        briefPdfPath: createBriefPdfPath,
      });
      setCreateOpen(false);
      setCreateTitle("");
      setCreateDescription("");
      setCreateDeadline("");
      setCreateBriefPdfPath(null);
      await load();
    } catch (err) {
      toast().error(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit() {
    if (!submitTarget || !submitUrl.trim()) return;
    setSubmitting(true);
    try {
      let url = submitUrl.trim();
      if (!/^https?:\/\//i.test(url)) {
        url = `https://${url}`;
      }
      const updated = await submitProject(submitTarget.id, url);
      setProjects((prev) => prev.map((p) => (p.id === submitTarget.id ? updated : p)));
      setSubmitTarget(null);
      setSubmitUrl("");
    } catch (err) {
      toast().error(err instanceof Error ? err.message : "Failed to submit project");
    } finally {
      setSubmitting(false);
    }
  }

  function formatDate(d: string | null): string {
    if (!d) return "";
    return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  return (
    <StudentShell section="projects">
      <div className="max-w-4xl space-y-8">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight text-[var(--fg)]">My Projects</h1>
            <p className="text-sm text-[var(--fg-muted)]">{projects.length} {projects.length === 1 ? "project" : "projects"}</p>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="shrink-0">
            <Icon.Plus className="h-4 w-4" />
            New Project
          </Button>
        </div>

        {loading ? (
          <div className="text-sm text-[var(--fg-muted)]">Loading...</div>
        ) : projects.length === 0 ? (
          <Card className="flex flex-col items-center gap-4 px-5 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[var(--accent-soft)]">
              <Icon.Folder className="h-7 w-7 text-[var(--accent)]" />
            </div>
            <div>
              <p className="font-semibold text-[var(--fg)]">No projects yet</p>
              <p className="mt-0.5 text-sm text-[var(--fg-muted)]">Create your first project to get started.</p>
            </div>
            <Button onClick={() => setCreateOpen(true)}>New Project</Button>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="divide-y divide-[var(--border)]">
              {projects.map((project) => {
                const isCompleted = project.status === "completed" && project.reviewStatus !== "declined";
                return (
                  <div
                    key={project.id}
                    className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-[var(--surface-muted)]/30"
                  >
                    <Link
                      to={`/student/projects/${project.id}`}
                      className={`min-w-0 flex-1 text-sm font-medium ${
                        isCompleted ? "text-[var(--fg-muted)] line-through" : "text-[var(--fg)]"
                      } transition-colors hover:text-[var(--accent)]`}
                    >
                      {project.title}
                    </Link>
                    {project.deadline && (
                      <span className="shrink-0 text-xs text-[var(--fg-muted)]">{formatDate(project.deadline)}</span>
                    )}
                    {project.reviewStatus === "declined" ? (
                      <div className="flex items-center gap-2">
                        <Badge tone="danger" dot>Declined</Badge>
                        <Button size="sm" onClick={() => { setSubmitTarget(project); setSubmitUrl(""); }}>
                          Resubmit
                        </Button>
                      </div>
                    ) : isCompleted ? (
                      <Badge tone="success" dot>Submitted</Badge>
                    ) : (
                      <Button size="sm" onClick={() => { setSubmitTarget(project); setSubmitUrl(""); }}>
                        Submit
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>

      <Modal
        open={!!submitTarget}
        onClose={() => setSubmitTarget(null)}
        title={`Submit "${submitTarget?.title ?? ""}"`}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setSubmitTarget(null)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={submitting || !submitUrl.trim()}>
              {submitting ? "Submitting..." : "Submit"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--fg)]">Deployed URL</label>
            <Input
              value={submitUrl}
              onChange={(e) => setSubmitUrl(e.target.value)}
              placeholder="https://your-project.vercel.app"
            />
            <p className="mt-1 text-xs text-[var(--fg-muted)]">
              Enter the URL where this project is deployed and accessible.
            </p>
          </div>
        </div>
      </Modal>

      <Modal
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          setCreateTitle("");
          setCreateDescription("");
          setCreateDeadline("");
          setCreateBriefPdfPath(null);
        }}
        title="New Project"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--fg)]">Title *</label>
            <Input value={createTitle} onChange={(e) => setCreateTitle(e.target.value)} placeholder="e.g. Portfolio Website" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--fg)]">Description</label>
            <textarea
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)]"
              rows={3}
              value={createDescription}
              onChange={(e) => setCreateDescription(e.target.value)}
              placeholder="Brief description..."
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--fg)]">Deadline</label>
            <Input type="datetime-local" value={createDeadline} onChange={(e) => setCreateDeadline(e.target.value)} />
          </div>
          <ProjectBriefField briefPdfPath={createBriefPdfPath} onChange={setCreateBriefPdfPath} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saving || !createTitle.trim()}>{saving ? "Creating..." : "Create"}</Button>
          </div>
        </form>
      </Modal>
    </StudentShell>
  );
}
