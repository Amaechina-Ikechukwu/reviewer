import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import TeacherShell from "../components/TeacherShell";
import { toast } from "../components/Toast";
import { Badge } from "../components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Icon } from "../components/ui/Icons";
import { PageHeader } from "../components/ui/PageHeader";
import { Table, TBody, TD, TH, THead, TR, EmptyRow } from "../components/ui/Table";
import { api } from "../api";
import { formatRelative } from "../lib/format";
import type { Assignment } from "../types";

export default function GroupProjectsPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Assignment[]>("/assignments")
      .then((rows) => setAssignments(rows.filter((a) => a.isGroupAssignment)))
      .catch((err) => toast().error(err instanceof Error ? err.message : "Failed to load group projects."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <TeacherShell section="groupProjects">
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PageHeader
            title="Group Projects"
            description="All assignments configured as group projects. Manage teams, set per-team questions, and re-shuffle members."
          />
          <Link
            to="/teacher/group-projects/new"
            className="text-xs font-medium text-[var(--accent)] hover:underline"
          >
            New group project →
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Your group projects</CardTitle>
          </CardHeader>
          <Table>
            <THead>
              <TR>
                <TH>Title</TH>
                <TH>Teams</TH>
                <TH>Question mode</TH>
                <TH>Deadline</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {assignments.map((a) => {
                const mode = a.groupQuestionMode === "per_group" ? "Per team" : "Shared";
                return (
                  <TR key={a.id}>
                    <TD label="Title">
                      <Link
                        to={`/teacher/assignments/${a.id}`}
                        className="font-medium hover:text-[var(--accent)]"
                      >
                        {a.title}
                      </Link>
                    </TD>
                    <TD label="Teams">
                      <Badge tone="neutral">{a.groupCount ?? 0}</Badge>
                    </TD>
                    <TD label="Question mode" className="text-xs text-[var(--fg-muted)]">
                      {mode}
                    </TD>
                    <TD label="Deadline" className="text-xs text-[var(--fg-muted)]">
                      {formatRelative(a.closesAt)}
                    </TD>
                    <TD label="Actions" className="text-right">
                      <Link
                        to={`/teacher/assignments/${a.id}/groups`}
                        title="Re-shuffle & edit teams"
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--fg-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--fg)]"
                      >
                        <Icon.Users className="h-3.5 w-3.5" />
                        Teams
                      </Link>
                    </TD>
                  </TR>
                );
              })}
              {!loading && assignments.length === 0 && (
                <EmptyRow cols={5}>
                  No group projects yet. Create an assignment and tick "Group project" to get started.
                </EmptyRow>
              )}
              {loading && <EmptyRow cols={5}>Loading…</EmptyRow>}
            </TBody>
          </Table>
        </Card>
      </div>
    </TeacherShell>
  );
}
