import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { marked } from "marked";
import TeacherShell from "../components/TeacherShell";
import { toast } from "../components/Toast";
import { Avatar } from "../components/ui/Avatar";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Icon } from "../components/ui/Icons";
import { PageHeader } from "../components/ui/PageHeader";
import { ReviewStatusPill } from "../components/ui/StatusPill";
import { Table, TBody, TD, TH, THead, TR, EmptyRow } from "../components/ui/Table";
import { api, deleteSubmission } from "../api";
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

export default function AssignmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [reviews, setReviews] = useState<Record<string, Review>>({});
  const [error, setError] = useState("");
  const [pdfBriefUrl, setPdfBriefUrl] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleDelete = async (submissionId: string, studentName: string | null) => {
    if (!confirm(`Delete submission from ${studentName || "student"}? They will be able to resubmit.`)) return;
    try {
      await deleteSubmission(submissionId);
      toast().success("Submission deleted");
      setRefreshKey((k) => k + 1);
    } catch (err) {
      toast().error(err instanceof Error ? err.message : "Failed to delete submission");
    }
  };

  useEffect(() => {
    if (!id) return;
    api<Assignment>(`/assignments/${id}`)
      .then((a) => {
        setAssignment(a);
        if (a.sourceType === "pdf" && a.sourcePdfPath) {
          const token = localStorage.getItem("token");
          fetch(`/v2/api/assignments/${a.id}/brief`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          })
            .then((r) => r.blob())
            .then((blob) => setPdfBriefUrl(URL.createObjectURL(blob)))
            .catch(() => {});
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Assignment not found"));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    api<SubmissionRow[]>(`/submissions?assignment_id=${id}`)
      .then(async (rows) => {
        setSubmissions(rows);
        const entries = await Promise.all(
          rows.map(async (row) => {
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
  }, [id, refreshKey]);

  if (error) {
    return (
      <TeacherShell section="assignments">
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--danger)]">{error}</div>
      </TeacherShell>
    );
  }

  if (!assignment) {
    return (
      <TeacherShell section="assignments">
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--fg-muted)]">Loading...</div>
      </TeacherShell>
    );
  }

  const now = new Date();
  const isClosed = new Date(assignment.closesAt) <= now;
  const sentCount = submissions.length;
  const reviewedCount = Object.values(reviews).filter((r) => r.status === "completed").length;

  return (
    <TeacherShell section="assignments">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Link
            to="/teacher/assignments"
            className="inline-flex w-fit items-center gap-1 text-xs font-medium text-[var(--fg-muted)] hover:text-[var(--accent)]"
          >
            <Icon.ChevronLeft className="h-3 w-3" />
            All assignments
          </Link>
          <PageHeader
            title={assignment.title}
            description={assignment.description || undefined}
            actions={
              <div className="flex items-center gap-2">
                <Link to={`/teacher/assignments/${assignment.id}/edit`}>
                  <Button variant="secondary" size="sm">
                    <Icon.Edit className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                </Link>
                {assignment.isGroupAssignment && (
                  <Link to={`/teacher/assignments/${assignment.id}/groups`}>
                    <Button variant="secondary" size="sm">
                      <Icon.Users className="h-3.5 w-3.5" />
                      Groups
                    </Button>
                  </Link>
                )}
              </div>
            }
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
                <Icon.FileText className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-wider text-[var(--fg-muted)]">Status</div>
                <div className="mt-1 text-base font-semibold">{isClosed ? "Closed" : "Open"}</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--warn-soft)] text-[var(--warn)]">
                <Icon.Clock className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-wider text-[var(--fg-muted)]">Deadline</div>
                <div className="mt-1 text-base font-semibold">{formatDateTime(assignment.closesAt)}</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--success-soft)] text-[var(--success)]">
                <Icon.Inbox className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-wider text-[var(--fg-muted)]">Submissions</div>
                <div className="mt-1 text-base font-semibold">{sentCount}</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-muted)] text-[var(--fg-muted)]">
                <Icon.Check className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-wider text-[var(--fg-muted)]">Reviewed</div>
                <div className="mt-1 text-base font-semibold">{reviewedCount}/{sentCount}</div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <span className="text-xs font-medium uppercase tracking-wider text-[var(--fg-muted)]">Max score</span>
              <p className="mt-1">{assignment.maxScore}</p>
            </div>
            <div>
              <span className="text-xs font-medium uppercase tracking-wider text-[var(--fg-muted)]">Source type</span>
              <p className="mt-1 capitalize">{assignment.sourceType}</p>
            </div>
            <div>
              <span className="text-xs font-medium uppercase tracking-wider text-[var(--fg-muted)]">Submission methods</span>
              <p className="mt-1 flex gap-2">
                {assignment.allowGithub && <Badge tone="accent">GitHub</Badge>}
                {assignment.allowFileUpload && <Badge tone="accent">ZIP/PDF</Badge>}
              </p>
            </div>
            {assignment.isGroupAssignment && (
              <div>
                <span className="text-xs font-medium uppercase tracking-wider text-[var(--fg-muted)]">Group project</span>
                <p className="mt-1">{assignment.groupCount} groups · {assignment.groupQuestionMode === "per_group" ? "Different per team" : "Same for all teams"}</p>
              </div>
            )}
            {assignment.track && (
              <div>
                <span className="text-xs font-medium uppercase tracking-wider text-[var(--fg-muted)]">Track</span>
                <p className="mt-1 capitalize">{assignment.track.replace(/_/g, " ")}</p>
              </div>
            )}
            {assignment.rubric && (
              <div className="sm:col-span-2">
                <span className="text-xs font-medium uppercase tracking-wider text-[var(--fg-muted)]">Rubric</span>
                <p className="mt-1 whitespace-pre-wrap text-[var(--fg-muted)]">{assignment.rubric}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Assignment brief */}
        {assignment.sourceType === "pdf" ? (
          <Card>
            <CardHeader>
              <CardTitle>
                <span className="inline-flex items-center gap-2">
                  <Icon.FileText className="h-4 w-4 text-[var(--fg-muted)]" />
                  Assignment brief
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {pdfBriefUrl ? (
                <iframe src={pdfBriefUrl} className="h-[600px] w-full rounded-b-xl border-0" title="Assignment brief" />
              ) : (
                <div className="flex h-32 items-center justify-center text-sm text-[var(--fg-muted)]">Loading brief…</div>
              )}
            </CardContent>
          </Card>
        ) : assignment.sourceMarkdown ? (
          <Card>
            <CardHeader>
              <CardTitle>
                <span className="inline-flex items-center gap-2">
                  <Icon.FileText className="h-4 w-4 text-[var(--fg-muted)]" />
                  Assignment brief
                </span>
              </CardTitle>
              {assignment.sourceUrl && (
                <a
                  href={assignment.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--accent)] hover:underline"
                >
                  <Icon.External className="h-3 w-3" />
                  Open source
                </a>
              )}
            </CardHeader>
            <CardContent>
              <div
                className="mdcontent text-sm leading-relaxed text-[var(--fg)]"
                dangerouslySetInnerHTML={{ __html: marked(assignment.sourceMarkdown) as string }}
              />
            </CardContent>
          </Card>
        ) : assignment.sourceUrl ? (
          <Card>
            <CardHeader>
              <CardTitle>
                <span className="inline-flex items-center gap-2">
                  <Icon.External className="h-4 w-4 text-[var(--fg-muted)]" />
                  Assignment brief
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <a
                href={assignment.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--fg)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                <Icon.External className="h-3.5 w-3.5" />
                Open assignment brief
              </a>
            </CardContent>
          </Card>
        ) : null}

        {/* Questions */}
        {assignment.questions && (
          <Card>
            <CardHeader>
              <CardTitle>
                <span className="inline-flex items-center gap-2">
                  <Icon.FileCode className="h-4 w-4 text-[var(--fg-muted)]" />
                  Questions
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className="mdcontent text-sm leading-relaxed text-[var(--fg)]"
                dangerouslySetInnerHTML={{ __html: marked(assignment.questions) as string }}
              />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Submissions ({sentCount})</CardTitle>
          </CardHeader>
          <Table>
            <THead>
              <TR>
                <TH>Student</TH>
                <TH>Submitted</TH>
                <TH>Type</TH>
                <TH>Status</TH>
                <TH className="text-right">Review</TH>
              </TR>
            </THead>
            <TBody>
              {submissions.length === 0 && (
                <EmptyRow cols={5}>No submissions yet for this assignment.</EmptyRow>
              )}
              {submissions.map((row) => {
                const review = reviews[row.submission.id];
                return (
                  <TR key={row.submission.id}>
                    <TD>
                      <div className="flex items-center gap-3">
                        <Avatar name={row.studentName || "Student"} size="sm" />
                        <div>
                          <div className="truncate font-medium">{row.studentName || "Student"}</div>
                          <div className="truncate text-xs text-[var(--fg-muted)]">{row.studentEmail}</div>
                        </div>
                      </div>
                    </TD>
                    <TD className="text-xs text-[var(--fg-muted)]">
                      {formatDateTime(row.submission.submittedAt)}
                      {row.submission.isLate && <Badge tone="warn" className="ml-2">Late</Badge>}
                    </TD>
                    <TD className="text-xs capitalize">{row.submission.submissionType === "github" ? "GitHub" : "File"}</TD>
                    <TD><ReviewStatusPill status={review?.status} /></TD>
                    <TD className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link to={`/teacher/review/${row.submission.id}`}>
                          <Button variant="ghost" size="sm">
                            {review?.status === "completed" ? "View" : "Review"}
                            <Icon.ChevronRight className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(row.submission.id, row.studentName)}
                          className="text-[var(--danger)] hover:text-[var(--danger)]"
                        >
                          <Icon.Trash className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </Card>
      </div>
    </TeacherShell>
  );
}
