import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { listProjects, listStudents } from "../api";
import TeacherShell from "../components/TeacherShell";
import { Avatar } from "../components/ui/Avatar";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Icon } from "../components/ui/Icons";
import { Table, TBody, TD, TH, THead, TR, EmptyRow } from "../components/ui/Table";
import type { StudentRecord } from "../types";

export default function TeacherProjectsPage() {
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([listProjects(), listStudents()])
      .then(([p, s]) => {
        const counts: Record<string, number> = {};
        for (const student of s) counts[student.id] = 0;
        for (const project of p) {
          for (const sid of project.studentIds ?? []) {
            if (counts[sid] !== undefined) counts[sid]++;
          }
        }
        setStudents(
          [...s]
            .sort((a, b) => a.fullName.localeCompare(b.fullName))
            .map((s) => ({ ...s, projectCount: counts[s.id] ?? 0 } as StudentRecord & { projectCount: number })),
        );
      })
      .finally(() => setLoading(false));
  }, []);

  const studentsWithProjects = useMemo(() =>
    students.filter((s: any) => (s as any).projectCount > 0),
    [students],
  );

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
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight text-[var(--fg)]">Projects</h1>
            <p className="text-sm text-[var(--fg-muted)]">
              {studentsWithProjects.length} of {students.length} students have projects
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="secondary" onClick={() => navigate("/teacher/projects/new")}>
              <Icon.Plus className="h-4 w-4" />
              New Project
            </Button>
            <Button onClick={() => navigate("/teacher/projects/new?mode=bulk")}>
              Bulk Import
            </Button>
          </div>
        </div>

        <Card className="overflow-hidden">
          <Table>
            <THead>
              <TR>
                <TH>Student</TH>
                <TH>Email</TH>
                <TH className="text-right">Projects</TH>
              </TR>
            </THead>
            <TBody>
              {students.map((s) => {
                const count = (s as any).projectCount;
                return (
                  <TR key={s.id} className="transition-colors hover:bg-[var(--surface-muted)]/30">
                    <TD label="Student">
                      <Link
                        to={`/teacher/projects/student/${s.id}`}
                        className="flex items-center gap-3 text-sm font-medium text-[var(--fg)] transition-colors hover:text-[var(--accent)]"
                      >
                        <Avatar name={s.fullName} size="xs" />
                        {s.fullName}
                      </Link>
                    </TD>
                    <TD label="Email" className="text-sm text-[var(--fg-muted)]">{s.email}</TD>
                    <TD label="Projects" className="text-right">
                      <Link to={`/teacher/projects/student/${s.id}`}>
                        <Badge tone={count > 0 ? "success" : "neutral"} className="cursor-pointer">{count}</Badge>
                      </Link>
                    </TD>
                  </TR>
                );
              })}
              {students.length === 0 && <EmptyRow cols={3}>No students found.</EmptyRow>}
            </TBody>
          </Table>
        </Card>
      </div>
    </TeacherShell>
  );
}
