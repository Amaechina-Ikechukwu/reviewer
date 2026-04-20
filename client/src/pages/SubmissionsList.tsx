import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import TeacherShell from "../components/TeacherShell";
import { toast } from "../components/Toast";
import { Avatar } from "../components/ui/Avatar";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Icon } from "../components/ui/Icons";
import { Label, Select, Input } from "../components/ui/Input";
import { PageHeader } from "../components/ui/PageHeader";
import { ReviewStatusPill } from "../components/ui/StatusPill";
import { Table, TBody, TD, TH, THead, TR, EmptyRow } from "../components/ui/Table";
import { api } from "../api";
import { formatDateTime } from "../lib/format";
import type { Assignment, Review } from "../types";

type SubmissionRow = {
  submission: {
    id: string;
    submittedAt: string;
    submissionType: "github" | "file_upload";
    isLate: boolean;
  };
  studentName: string | null;
  studentEmail: string | null;
  assignmentTitle: string | null;
};

export default function SubmissionsList() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedAssignment, setSelectedAssignment] = useState("");
  const [date, setDate] = useState("");
  const [rows, setRows] = useState<SubmissionRow[]>([]);
  const [reviews, setReviews] = useState<Record<string, Review>>({});
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    api<Assignment[]>("/assignments").then(setAssignments).catch(() => {
      setAssignments([]);
      toast().error("Failed to load assignments");
    });
  }, [refreshKey]);

  useEffect(() => {
    const search = new URLSearchParams();
    if (selectedAssignment) search.set("assignment_id", selectedAssignment);
    if (date) search.set("date", date);

    api<SubmissionRow[]>(`/submissions${search.size ? `?${search.toString()}` : ""}`)
      .then(async (nextRows) => {
        setRows(nextRows);
        const entries = await Promise.all(
          nextRows.map(async (row) => {
            try {
              return [row.submission.id, await api<Review>(`/reviews/${row.submission.id}`)] as const;
            } catch {
              return null;
            }
          }),
        );
        setReviews(Object.fromEntries(entries.filter(Boolean) as Array<readonly [string, Review]>));
      })
      .catch(() => {
        setRows([]);
        setReviews({});
      });
  }, [date, selectedAssignment, refreshKey]);

  return (
    <TeacherShell section="submissions">
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Submissions"
          description="All incoming student work across your assignments."
          actions={
            <Button variant="secondary" size="sm" onClick={() => setRefreshKey((k) => k + 1)}>
              <Icon.Refresh className="h-3.5 w-3.5" />
              Refresh
            </Button>
          }
        />

        <Card className="p-4">
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr_auto]">
            <Label>Assignment
              <Select value={selectedAssignment} onChange={(e) => setSelectedAssignment(e.target.value)}>
                <option value="">All assignments</option>
                {assignments.map((assignment) => (
                  <option key={assignment.id} value={assignment.id}>{assignment.title}</option>
                ))}
              </Select>
            </Label>
            <Label>Date
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Label>
            <div className="flex items-end">
              {(selectedAssignment || date) && (
                <Button variant="ghost" size="sm" onClick={() => { setSelectedAssignment(""); setDate(""); }}>
                  Clear
                </Button>
              )}
            </div>
          </div>
        </Card>

        {/* Desktop table */}
        <Card className="hidden md:block">
          <Table>
            <THead>
              <TR>
                <TH>Student</TH>
                <TH>Assignment</TH>
                <TH>Submitted</TH>
                <TH>Status</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((row) => (
                <TR key={row.submission.id}>
                  <TD>
                    <div className="flex items-center gap-3">
                      <Avatar name={row.studentName || "Student"} size="sm" />
                      <div className="min-w-0">
                        <div className="truncate font-medium">{row.studentName || "Student"}</div>
                        <div className="truncate text-xs text-[var(--fg-muted)]">{row.studentEmail}</div>
                      </div>
                    </div>
                  </TD>
                  <TD>
                    <div className="text-sm">{row.assignmentTitle || "—"}</div>
                    <div className="mt-0.5">
                      {row.submission.isLate ? <Badge tone="warn">Late</Badge> : <Badge tone="success">On time</Badge>}
                    </div>
                  </TD>
                  <TD className="text-xs text-[var(--fg-muted)]">{formatDateTime(row.submission.submittedAt)}</TD>
                  <TD><ReviewStatusPill status={reviews[row.submission.id]?.status} /></TD>
                  <TD className="text-right">
                    <Link to={`/teacher/review/${row.submission.id}`}>
                      <Button variant="ghost" size="sm">
                        Open
                        <Icon.ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  </TD>
                </TR>
              ))}
              {rows.length === 0 && <EmptyRow cols={5}>No submissions match your filters.</EmptyRow>}
            </TBody>
          </Table>
        </Card>

        {/* Mobile cards */}
        <div className="flex flex-col gap-2 md:hidden">
          {rows.length === 0 && (
            <Card className="p-6 text-center text-sm text-[var(--fg-muted)]">
              No submissions match your filters.
            </Card>
          )}
          {rows.map((row) => (
            <Link
              key={row.submission.id}
              to={`/teacher/review/${row.submission.id}`}
              className="group block rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-sm transition-colors hover:border-[var(--accent)]/40 hover:bg-[var(--surface-muted)]/60"
            >
              <div className="flex items-start gap-3">
                <Avatar name={row.studentName || "Student"} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{row.studentName || "Student"}</div>
                      <div className="truncate text-[11px] text-[var(--fg-muted)]">{row.assignmentTitle || "—"}</div>
                    </div>
                    <Icon.ChevronRight className="h-4 w-4 shrink-0 text-[var(--fg-subtle)] transition-colors group-hover:text-[var(--accent)]" />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <ReviewStatusPill status={reviews[row.submission.id]?.status} />
                    {row.submission.isLate ? <Badge tone="warn">Late</Badge> : <Badge tone="success">On time</Badge>}
                    <span className="ml-auto text-[11px] text-[var(--fg-muted)]">
                      {formatDateTime(row.submission.submittedAt)}
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </TeacherShell>
  );
}
