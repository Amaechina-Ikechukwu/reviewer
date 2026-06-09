import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { listProjects, listStudents } from "../api";
import TeacherShell from "../components/TeacherShell";
import { Avatar } from "../components/ui/Avatar";
import { Badge } from "../components/ui/Badge";
import { Card } from "../components/ui/Card";
import { Icon } from "../components/ui/Icons";
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

export default function TeacherStudentProjectsPage() {
  const { studentId } = useParams<{ studentId: string }>();
  const [projects, setProjects] = useState<Project[]>([]);
  const [student, setStudent] = useState<StudentRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!studentId) return;
    Promise.all([listProjects(studentId), listStudents()])
      .then(([p, s]) => {
        setProjects(p);
        setStudent(s.find((st) => st.id === studentId) ?? null);
      })
      .finally(() => setLoading(false));
  }, [studentId]);

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
                const isSubmitted = project.status === "completed" && project.reviewStatus !== "declined";
                return (
                  <Link
                    key={project.id}
                    to={`/teacher/projects/${project.id}`}
                    className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-[var(--surface-muted)]/30"
                  >
                    <span
                      className={`min-w-0 flex-1 text-sm font-medium ${
                        isSubmitted ? "text-[var(--fg-muted)] line-through" : "text-[var(--fg)]"
                      }`}
                    >
                      {project.title}
                    </span>
                    {project.deadline && (
                      <span className="shrink-0 text-xs text-[var(--fg-muted)]">{formatDate(project.deadline)}</span>
                    )}
                    {project.reviewStatus === "declined" ? (
                      <Badge tone="danger">Declined</Badge>
                    ) : (
                      <Badge tone={STATUS_TONES[project.status]}>{STATUS_LABELS[project.status]}</Badge>
                    )}
                    <Icon.ChevronRight className="h-4 w-4 shrink-0 text-[var(--fg-subtle)]" />
                  </Link>
                );
              })}
            </div>
          </Card>
        )}
      </div>
    </TeacherShell>
  );
}
