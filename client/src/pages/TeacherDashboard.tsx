import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import TeacherShell from "../components/TeacherShell";
import { toast } from "../components/Toast";
import { Avatar } from "../components/ui/Avatar";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Icon } from "../components/ui/Icons";
import { Modal } from "../components/ui/Modal";
import { PageHeader } from "../components/ui/PageHeader";
import { ReviewStatusPill } from "../components/ui/StatusPill";
import { Label, Select, Input } from "../components/ui/Input";
import { Table, TBody, TD, TH, THead, TR, EmptyRow } from "../components/ui/Table";
import { api } from "../api";
import { formatRelative, formatDateTime } from "../lib/format";
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

function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "accent",
}: {
  label: string;
  value: number | string;
  hint?: string;
  icon: React.ReactNode;
  tone?: "accent" | "success" | "warn" | "neutral";
}) {
  const toneBg: Record<string, string> = {
    accent: "bg-[var(--accent-soft)] text-[var(--accent)]",
    success: "bg-[var(--success-soft)] text-[var(--success)]",
    warn: "bg-[var(--warn-soft)] text-[var(--warn)]",
    neutral: "bg-[var(--surface-muted)] text-[var(--fg-muted)]",
  };
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-wider text-[var(--fg-muted)]">{label}</div>
          <div className="mt-2 text-3xl font-semibold tracking-tight text-[var(--fg)]">{value}</div>
          {hint && <div className="mt-1 text-xs text-[var(--fg-muted)]">{hint}</div>}
        </div>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${toneBg[tone]}`}>{icon}</div>
      </CardContent>
    </Card>
  );
}

export default function TeacherDashboard() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [reviews, setReviews] = useState<Record<string, Review>>({});

  const [deleteTarget, setDeleteTarget] = useState<Assignment | null>(null);
  const [deleteAction, setDeleteAction] = useState<"delete_all" | "move">("delete_all");
  const [moveTargetId, setMoveTargetId] = useState("");
  const [moveNewTitle, setMoveNewTitle] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    api<Assignment[]>("/assignments").then(setAssignments).catch(() => setAssignments([]));
    api<SubmissionRow[]>("/submissions")
      .then(async (rows) => {
        setSubmissions(rows);
        const entries = await Promise.all(
          rows.slice(0, 12).map(async (row) => {
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
        setSubmissions([]);
        setReviews({});
      });
  }, []);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleteError("");
    setDeleting(true);
    try {
      const body: Record<string, string> = { action: deleteAction };
      if (deleteAction === "move") {
        if (moveTargetId) body.targetAssignmentId = moveTargetId;
        else if (moveNewTitle.trim()) body.newAssignmentTitle = moveNewTitle.trim();
        else {
          setDeleteError("Pick an assignment or type a new title to move submissions to.");
          setDeleting(false);
          return;
        }
      }
      await api(`/assignments/${deleteTarget.id}`, { method: "DELETE", body: JSON.stringify(body) });
      setAssignments((prev) => prev.filter((a) => a.id !== deleteTarget.id));
      toast().success(`"${deleteTarget.title}" deleted.`);
      setDeleteTarget(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  const recentSubmissions = useMemo(() => submissions.slice(0, 6), [submissions]);
  const upcomingAssignments = useMemo(
    () => [...assignments].sort((a, b) => new Date(a.closesAt).getTime() - new Date(b.closesAt).getTime()).slice(0, 5),
    [assignments],
  );
  const completedReviews = Object.values(reviews).filter((review) => review.status === "completed").length;
  const pendingReviews = submissions.length - completedReviews;

  return (
    <TeacherShell section="dashboard">
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Dashboard"
          description="Overview of assignments, submissions, and recent activity."
          actions={
            <>
              <Link to="/teacher/import">
                <Button variant="secondary" size="sm">
                  <Icon.Upload className="h-3.5 w-3.5" />
                  Import
                </Button>
              </Link>
              <Link to="/teacher/assignments/new">
                <Button size="sm">
                  <Icon.Plus className="h-3.5 w-3.5" />
                  New assignment
                </Button>
              </Link>
            </>
          }
        />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Assignments"
            value={assignments.length}
            hint={`${upcomingAssignments.length} upcoming`}
            icon={<Icon.FilePlus className="h-5 w-5" />}
            tone="accent"
          />
          <StatCard
            label="Submissions"
            value={submissions.length}
            hint="All time"
            icon={<Icon.Inbox className="h-5 w-5" />}
            tone="neutral"
          />
          <StatCard
            label="Reviews completed"
            value={completedReviews}
            hint={`${submissions.length ? Math.round((completedReviews / submissions.length) * 100) : 0}% of submissions`}
            icon={<Icon.Check className="h-5 w-5" />}
            tone="success"
          />
          <StatCard
            label="Pending"
            value={pendingReviews < 0 ? 0 : pendingReviews}
            hint="Awaiting review"
            icon={<Icon.Clock className="h-5 w-5" />}
            tone="warn"
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Recent submissions</CardTitle>
              <Link to="/teacher/submissions" className="text-xs font-medium text-[var(--accent)] hover:underline">
                View all
              </Link>
            </CardHeader>
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
                {recentSubmissions.map((row) => {
                  const review = reviews[row.submission.id];
                  return (
                    <TR key={row.submission.id}>
                      <TD label="Student">
                        <div className="flex items-center gap-3">
                          <Avatar name={row.studentName || "Student"} size="sm" />
                          <div className="min-w-0">
                            <div className="font-medium">{row.studentName || "Student"}</div>
                            <div className="truncate text-xs text-[var(--fg-muted)]">{row.studentEmail}</div>
                          </div>
                        </div>
                      </TD>
                      <TD label="Assignment" className="text-sm">{row.assignmentTitle || "—"}</TD>
                      <TD label="Submitted" className="text-xs text-[var(--fg-muted)]">{formatRelative(row.submission.submittedAt)}</TD>
                      <TD label="Status"><ReviewStatusPill status={review?.status} /></TD>
                      <TD label="Actions" className="text-right">
                        <Link to={`/teacher/review/${row.submission.id}`}>
                          <Button variant="ghost" size="sm">
                            Open
                            <Icon.ChevronRight className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                      </TD>
                    </TR>
                  );
                })}
                {recentSubmissions.length === 0 && (
                  <EmptyRow cols={5}>No submissions yet. Share an assignment link with your class.</EmptyRow>
                )}
              </TBody>
            </Table>
          </Card>

          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Upcoming deadlines</CardTitle>
                <Badge tone="accent">{upcomingAssignments.length}</Badge>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {upcomingAssignments.length === 0 && (
                  <p className="text-xs text-[var(--fg-muted)]">No active deadlines yet.</p>
                )}
                {upcomingAssignments.map((assignment) => (
                  <div key={assignment.id} className="flex items-start justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--surface-muted)]/50 p-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-[var(--fg)]">{assignment.title}</div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-[var(--fg-muted)]">
                        <Icon.Clock className="h-3 w-3" />
                        {formatDateTime(assignment.closesAt)}
                      </div>
                    </div>
                    <button
                      type="button"
                      title="Delete assignment"
                      onClick={() => {
                        setDeleteTarget(assignment);
                        setDeleteAction("delete_all");
                        setMoveTargetId("");
                        setMoveNewTitle("");
                        setDeleteError("");
                      }}
                      className="shrink-0 rounded-md p-1 text-[var(--fg-subtle)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
                    >
                      <Icon.Trash className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Quick actions</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <Link to="/teacher/assignments/new">
                  <Button variant="secondary" className="w-full justify-start">
                    <Icon.Plus className="h-4 w-4" />
                    Create new assignment
                  </Button>
                </Link>
                <Link to="/teacher/students">
                  <Button variant="secondary" className="w-full justify-start">
                    <Icon.Users className="h-4 w-4" />
                    Manage students
                  </Button>
                </Link>
                <Link to="/teacher/gradebook">
                  <Button variant="secondary" className="w-full justify-start">
                    <Icon.Book className="h-4 w-4" />
                    Open gradebook
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={deleteTarget ? `Delete "${deleteTarget.title}"` : ""}
        description="What should happen to the submissions for this assignment?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" loading={deleting} onClick={handleDelete}>
              {deleting ? "Deleting..." : "Confirm delete"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-[var(--border)] p-3 transition-colors has-[:checked]:border-[var(--accent)] has-[:checked]:bg-[var(--accent-soft)]/40">
            <input
              type="radio"
              name="del-action"
              value="delete_all"
              checked={deleteAction === "delete_all"}
              onChange={() => setDeleteAction("delete_all")}
              className="mt-0.5"
            />
            <div className="text-sm">
              <div className="font-medium">Delete all submissions</div>
              <p className="text-xs text-[var(--fg-muted)]">Permanently removes the assignment and every submission under it.</p>
            </div>
          </label>

          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-[var(--border)] p-3 transition-colors has-[:checked]:border-[var(--accent)] has-[:checked]:bg-[var(--accent-soft)]/40">
            <input
              type="radio"
              name="del-action"
              value="move"
              checked={deleteAction === "move"}
              onChange={() => setDeleteAction("move")}
              className="mt-0.5"
            />
            <div className="flex-1 text-sm">
              <div className="font-medium">Move submissions to another assignment</div>
              <p className="text-xs text-[var(--fg-muted)]">Submissions are re-linked, then this assignment is deleted.</p>
            </div>
          </label>

          {deleteAction === "move" && deleteTarget && (
            <div className="flex flex-col gap-3 rounded-md bg-[var(--surface-muted)] p-3">
              <Label>Move to existing assignment
                <Select value={moveTargetId} onChange={(e) => { setMoveTargetId(e.target.value); setMoveNewTitle(""); }}>
                  <option value="">— Select —</option>
                  {assignments.filter((a) => a.id !== deleteTarget.id).map((a) => (
                    <option key={a.id} value={a.id}>{a.title}</option>
                  ))}
                </Select>
              </Label>
              <div className="text-center text-[11px] uppercase tracking-wider text-[var(--fg-subtle)]">or create new</div>
              <Label>New assignment title
                <Input
                  placeholder="e.g. Final Project Archive"
                  value={moveNewTitle}
                  onChange={(e) => { setMoveNewTitle(e.target.value); setMoveTargetId(""); }}
                />
              </Label>
            </div>
          )}

          {deleteError && (
            <div className="rounded-md border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger)]">
              {deleteError}
            </div>
          )}
        </div>
      </Modal>
    </TeacherShell>
  );
}
