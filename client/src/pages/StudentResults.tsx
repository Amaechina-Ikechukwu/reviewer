import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import StudentShell from "../components/StudentShell";
import { toast } from "../components/Toast";
import { Button } from "../components/ui/Button";
import { Card, CardContent } from "../components/ui/Card";
import { Icon } from "../components/ui/Icons";
import { PageHeader } from "../components/ui/PageHeader";
import { ReviewStatusPill } from "../components/ui/StatusPill";
import { api } from "../api";
import { cn } from "../lib/cn";
import { formatDateTime } from "../lib/format";
import type { Review } from "../types";

type SubmissionRow = {
  submission: { id: string; submittedAt: string };
  assignmentTitle: string | null;
};

function scoreTone(score: number, maxScore: number) {
  const pct = maxScore > 0 ? score / maxScore : 0;
  if (pct >= 0.8) return "text-[var(--success)]";
  if (pct >= 0.6) return "text-[var(--warn)]";
  return "text-[var(--danger)]";
}

export default function StudentResults() {
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [reviews, setReviews] = useState<Record<string, Review>>({});
  const [loading, setLoading] = useState(true);
  const { hash } = useLocation();
  const focusedId = hash.startsWith("#") ? hash.slice(1) : "";

  useEffect(() => {
    if (!focusedId || loading) return;
    const el = document.getElementById(`submission-${focusedId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusedId, loading]);

  const sortedSubmissions = useMemo(
    () =>
      [...submissions].sort(
        (a, b) =>
          new Date(b.submission.submittedAt).getTime() - new Date(a.submission.submittedAt).getTime(),
      ),
    [submissions],
  );

  useEffect(() => {
    setLoading(true);
    api<SubmissionRow[]>("/submissions")
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
        toast().error("Failed to load submissions");
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <StudentShell section="submissions">
      <div className="flex flex-col gap-6">
        <PageHeader
          title="My submissions"
          description="Every submission you've made and your feedback so far."
        />

        {loading && (
          <div className="text-sm text-[var(--fg-muted)]">Loading submissions...</div>
        )}

        {!loading && submissions.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface-muted)] text-[var(--fg-muted)]">
                <Icon.Inbox className="h-5 w-5" />
              </div>
              <div className="text-sm font-medium">No submissions yet</div>
              <div className="text-xs text-[var(--fg-muted)]">Head to your dashboard to submit work.</div>
              <Link to="/student" className="mt-2">
                <Button variant="secondary" size="sm">Go to dashboard</Button>
              </Link>
            </CardContent>
          </Card>
        )}

        <div className="flex flex-col gap-3">
          {sortedSubmissions.map((row) => {
            const review = reviews[row.submission.id];
            const score = review?.teacherOverrideScore ?? review?.aiScore;
            const maxScore = review?.maxScore ?? 100;
            const isFocused = focusedId === row.submission.id;
            return (
              <Card
                key={row.submission.id}
                id={`submission-${row.submission.id}`}
                className={cn(
                  "scroll-mt-20 transition-shadow",
                  isFocused && "ring-2 ring-[var(--accent)] shadow-[var(--shadow-md)]",
                )}
              >
                <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <div
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                        review?.status === "completed"
                          ? "bg-[var(--success-soft)] text-[var(--success)]"
                          : review?.status === "reviewing"
                            ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                            : "bg-[var(--surface-muted)] text-[var(--fg-muted)]",
                      )}
                    >
                      {review?.status === "completed" ? (
                        <Icon.Check className="h-5 w-5" />
                      ) : review?.status === "reviewing" ? (
                        <Icon.Sparkles className="h-5 w-5" />
                      ) : (
                        <Icon.Clock className="h-5 w-5" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-base font-semibold">{row.assignmentTitle || "Assignment"}</div>
                      <div className="text-xs text-[var(--fg-muted)]">
                        Submitted {formatDateTime(row.submission.submittedAt)}
                      </div>
                      {review?.feedback?.summary && (
                        <div className="mt-1 line-clamp-2 text-xs text-[var(--fg-muted)]">
                          {review.feedback.summary}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 sm:gap-6">
                    <div className="text-right">
                      <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--fg-muted)]">Grade</div>
                      {typeof score === "number" ? (
                        <div className={cn("text-2xl font-semibold tabular-nums", scoreTone(score, maxScore))}>
                          {score}
                          <span className="text-sm font-normal text-[var(--fg-subtle)]">/{maxScore}</span>
                        </div>
                      ) : (
                        <div className="text-2xl font-semibold text-[var(--fg-subtle)]">—</div>
                      )}
                    </div>
                    <ReviewStatusPill status={review?.status} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </StudentShell>
  );
}
