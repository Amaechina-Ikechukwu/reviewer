import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import TeacherShell from "../components/TeacherShell";
import { toast } from "../components/Toast";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Icon } from "../components/ui/Icons";
import { PageHeader } from "../components/ui/PageHeader";
import { api } from "../api";
import { formatDateTime } from "../lib/format";
import type { Assignment } from "../types";

export default function AssignmentsPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Assignment[]>("/assignments")
      .then(setAssignments)
      .catch(() => {
        setAssignments([]);
        toast().error("Failed to load assignments");
      })
      .finally(() => setLoading(false));
  }, []);

  const [now] = useState(() => new Date());
  const upcomingAssignments = useMemo(
    () => assignments.filter((a) => new Date(a.closesAt) > now).sort((a, b) => new Date(a.closesAt).getTime() - new Date(b.closesAt).getTime()),
    [assignments, now],
  );
  const pastAssignments = useMemo(
    () => assignments.filter((a) => new Date(a.closesAt) <= now).sort((a, b) => new Date(b.closesAt).getTime() - new Date(a.closesAt).getTime()),
    [assignments, now],
  );

  return (
    <TeacherShell section="assignments">
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Assignments"
          description="Manage your assignments, view details, and track submissions."
          actions={
            <Link to="/teacher/assignments/new">
              <Button size="sm">
                <Icon.Plus className="h-3.5 w-3.5" />
                New assignment
              </Button>
            </Link>
          }
        />

        {loading ? (
          <div className="text-sm text-[var(--fg-muted)]">Loading assignments...</div>
        ) : (
          <>
            <Card>
          <CardHeader>
            <CardTitle>Upcoming</CardTitle>
            <Badge tone="accent">{upcomingAssignments.length}</Badge>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {upcomingAssignments.length === 0 && (
              <p className="py-6 text-center text-sm text-[var(--fg-muted)]">No upcoming assignments.</p>
            )}
            {upcomingAssignments.map((a) => (
              <AssignmentCard key={a.id} assignment={a} />
            ))}
          </CardContent>
        </Card>

        {pastAssignments.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Past</CardTitle>
              <Badge tone="neutral">{pastAssignments.length}</Badge>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {pastAssignments.map((a) => (
                <AssignmentCard key={a.id} assignment={a} closed />
              ))}
            </CardContent>
            </Card>
          )}
        </>
        )}
      </div>
    </TeacherShell>
  );
}

function AssignmentCard({ assignment, closed }: { assignment: Assignment; closed?: boolean }) {
  return (
    <Link
      to={`/teacher/assignments/${assignment.id}`}
      className="group flex items-center justify-between gap-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 transition-colors hover:border-[var(--accent)]/40 hover:bg-[var(--surface-muted)]/60"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-[var(--fg)]">{assignment.title}</span>
          {assignment.isGroupAssignment && <Icon.Users className="h-3.5 w-3.5 shrink-0 text-[var(--fg-muted)]" />}
        </div>
        <div className="mt-1 flex items-center gap-3 text-xs text-[var(--fg-muted)]">
          <span className="inline-flex items-center gap-1">
            <Icon.Clock className="h-3 w-3" />
            {closed ? "Closed " : "Due "}{formatDateTime(assignment.closesAt)}
          </span>
          {assignment.allowGithub && <span>GitHub</span>}
          {assignment.allowFileUpload && <span>ZIP/PDF</span>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {closed ? <Badge tone="neutral">Closed</Badge> : <Badge tone="success">Open</Badge>}
        <Icon.ChevronRight className="h-4 w-4 text-[var(--fg-subtle)] transition-colors group-hover:text-[var(--accent)]" />
      </div>
    </Link>
  );
}
