import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import StudentShell from "../components/StudentShell";
import { toast } from "../components/Toast";
import { Badge } from "../components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Icon } from "../components/ui/Icons";
import { ReviewStatusPill } from "../components/ui/StatusPill";
import { api } from "../api";
import { cn } from "../lib/cn";
import { formatDateTime } from "../lib/format";
import type { Review } from "../types";

type SubmissionResponse = {
  submission: {
    id: string;
    submittedAt: string;
    submissionType: "github" | "file_upload";
    githubUrl: string | null;
    isLate: boolean;
  };
  assignment: {
    id: string;
    title: string;
    description: string;
    maxScore: number;
  };
};

function scoreTone(score: number, max: number) {
  const pct = max > 0 ? score / max : 0;
  if (pct >= 0.8) return "text-[var(--success)]";
  if (pct >= 0.6) return "text-[var(--warn)]";
  return "text-[var(--danger)]";
}

export default function StudentResultDetail() {
  const { submissionId } = useParams();
  const [data, setData] = useState<SubmissionResponse | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!submissionId) return;
    setLoading(true);
    Promise.all([
      api<SubmissionResponse>(`/submissions/${submissionId}`).catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load submission");
        return null;
      }),
      api<Review>(`/reviews/${submissionId}`).catch(() => null),
    ])
      .then(([s, r]) => {
        if (s) setData(s);
        if (r) setReview(r);
      })
      .catch(() => toast().error("Failed to load result"))
      .finally(() => setLoading(false));
  }, [submissionId]);

  if (loading) {
    return (
      <StudentShell section="submissions">
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--fg-muted)]">
          Loading...
        </div>
      </StudentShell>
    );
  }

  if (error || !data) {
    return (
      <StudentShell section="submissions">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--danger-soft)] text-[var(--danger)]">
              <Icon.AlertTriangle className="h-5 w-5" />
            </div>
            <div className="text-sm font-medium">{error || "Result not available"}</div>
            <Link to="/student/results" className="text-xs font-medium text-[var(--accent)] hover:underline">
              Back to submissions
            </Link>
          </CardContent>
        </Card>
      </StudentShell>
    );
  }

  const { submission, assignment } = data;
  const maxScore = review?.maxScore ?? assignment.maxScore ?? 100;
  const score = review?.teacherOverrideScore ?? review?.aiScore;
  const released = typeof review?.teacherOverrideScore === "number";
  const feedback = review?.feedback;

  return (
    <StudentShell section="submissions">
      <div className="flex flex-col gap-6">
        <Link
          to="/student/results"
          className="inline-flex w-fit items-center gap-1 text-xs font-medium text-[var(--fg-muted)] hover:text-[var(--accent)]"
        >
          <Icon.ChevronLeft className="h-3 w-3" />
          All submissions
        </Link>

        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{assignment.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--fg-muted)]">
              <span>Submitted {formatDateTime(submission.submittedAt)}</span>
              {submission.isLate && (
                <>
                  <span>·</span>
                  <Badge tone="warn">Late</Badge>
                </>
              )}
              <span>·</span>
              <Badge tone="neutral">
                <span className="inline-flex items-center gap-1">
                  {submission.submissionType === "github" ? (
                    <Icon.Github className="h-3 w-3" />
                  ) : (
                    <Icon.Upload className="h-3 w-3" />
                  )}
                  {submission.submissionType === "github" ? "GitHub" : "ZIP"}
                </span>
              </Badge>
              <ReviewStatusPill status={review?.status} />
            </div>
            {submission.githubUrl && (
              <a
                href={submission.githubUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--accent)] hover:underline"
              >
                <Icon.Github className="h-3.5 w-3.5" />
                {submission.githubUrl}
                <Icon.External className="h-3 w-3" />
              </a>
            )}
          </div>

          <div className="shrink-0 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-6 py-4 text-center shadow-[var(--shadow-sm)]">
            <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--fg-muted)]">
              {released ? "Final Grade" : "AI Score"}
            </div>
            {typeof score === "number" ? (
              <div className={cn("mt-1 text-4xl font-bold tabular-nums", scoreTone(score, maxScore))}>
                {score}
                <span className="text-lg font-medium text-[var(--fg-subtle)]">/{maxScore}</span>
              </div>
            ) : (
              <div className="mt-1 text-4xl font-bold text-[var(--fg-subtle)]">—</div>
            )}
          </div>
        </div>

        {feedback?.summary && (
          <Card>
            <CardHeader>
              <CardTitle>
                <span className="inline-flex items-center gap-2">
                  <Icon.Sparkles className="h-4 w-4 text-[var(--accent)]" />
                  Scholar Insight
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed text-[var(--fg)]">{feedback.summary}</p>
            </CardContent>
          </Card>
        )}

        {feedback?.criteria && feedback.criteria.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Criteria breakdown</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {feedback.criteria.map((c) => (
                <div
                  key={c.name}
                  className="flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)]/40 p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold">{c.name}</div>
                    <div className={cn("text-sm font-bold tabular-nums", scoreTone(c.score, c.maxScore))}>
                      {c.score}
                      <span className="text-xs text-[var(--fg-subtle)]">/{c.maxScore}</span>
                    </div>
                  </div>
                  {c.comment && <p className="text-xs leading-relaxed text-[var(--fg-muted)]">{c.comment}</p>}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {feedback?.suggestions && feedback.suggestions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Suggestions</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-2 pl-5 text-sm leading-relaxed text-[var(--fg)]">
                {feedback.suggestions.map((s, i) => (
                  <li key={i} className="list-disc">{s}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {feedback?.codeQualityNotes && (
          <Card>
            <CardHeader>
              <CardTitle>Code quality notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--fg)]">
                {feedback.codeQualityNotes}
              </p>
            </CardContent>
          </Card>
        )}

        {feedback?.fileScores && feedback.fileScores.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>File scores</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {feedback.fileScores.map((f) => (
                <div
                  key={f.filename}
                  className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-xs font-semibold">{f.filename}</div>
                    <div className="mt-0.5 truncate text-[11px] text-[var(--fg-muted)]">{f.summary}</div>
                  </div>
                  <div className={cn("shrink-0 text-sm font-bold tabular-nums", scoreTone(f.score, f.maxScore))}>
                    {f.score}
                    <span className="text-xs text-[var(--fg-subtle)]">/{f.maxScore}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {!feedback && (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface-muted)] text-[var(--fg-muted)]">
                <Icon.Clock className="h-5 w-5" />
              </div>
              <div className="text-sm font-medium">Feedback not ready yet</div>
              <div className="text-xs text-[var(--fg-muted)]">
                Your teacher hasn't released feedback for this submission.
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </StudentShell>
  );
}
