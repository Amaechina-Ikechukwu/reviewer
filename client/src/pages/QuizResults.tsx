import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import TeacherShell from "../components/TeacherShell";
import { toast } from "../components/Toast";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardHeader, CardTitle } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { Table, TBody, TD, TH, THead, TR, EmptyRow } from "../components/ui/Table";
import { api } from "../api";
import { formatDateTime } from "../lib/format";
import type { Quiz, QuizAttempt, QuizQuestion } from "../types";

type AttemptRow = { attempt: QuizAttempt; studentName: string | null; studentEmail: string | null };

type Response = {
  quiz: Quiz & { questions: QuizQuestion[] };
  attempts: AttemptRow[];
};

function attemptStatusTone(status: QuizAttempt["status"]) {
  if (status === "submitted") return "success" as const;
  if (status === "auto_submitted") return "warn" as const;
  return "accent" as const;
}

export default function QuizResults() {
  const { id } = useParams();
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [releasingAll, setReleasingAll] = useState(false);
  const [releasingId, setReleasingId] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api<Response>(`/quizzes/${id}/attempts`)
      .then(setData)
      .catch((err) => toast().error(err instanceof Error ? err.message : "Failed to load attempts."))
      .finally(() => setLoading(false));
  }, [id]);

  async function releaseAll() {
    if (!data || !id) return;
    if (!confirm(`Release results to every student who submitted "${data.quiz.title}"? They'll be emailed and can review their scores.`)) return;
    setReleasingAll(true);
    try {
      const updated = await api<Quiz & { notified?: number }>(`/quizzes/${id}/release`, { method: "POST" });
      setData((prev) => prev && {
        ...prev,
        quiz: { ...prev.quiz, resultsReleased: true, resultsReleasedAt: updated.resultsReleasedAt ?? new Date().toISOString() },
      });
      toast().success(updated.notified ? `Released. Emailed ${updated.notified} student${updated.notified === 1 ? "" : "s"}.` : "Released.");
    } catch (err) {
      toast().error(err instanceof Error ? err.message : "Failed to release results.");
    } finally {
      setReleasingAll(false);
    }
  }

  async function releaseOne(row: AttemptRow) {
    if (!id) return;
    setReleasingId(row.attempt.id);
    try {
      const updated = await api<QuizAttempt>(`/quizzes/${id}/attempts/${row.attempt.id}/release`, { method: "POST" });
      setData((prev) => prev && {
        ...prev,
        attempts: prev.attempts.map((r) =>
          r.attempt.id === row.attempt.id ? { ...r, attempt: { ...r.attempt, released: true, releasedAt: updated.releasedAt ?? new Date().toISOString() } } : r,
        ),
      });
      toast().success(`Released to ${row.studentName ?? "student"}.`);
    } catch (err) {
      toast().error(err instanceof Error ? err.message : "Failed to release.");
    } finally {
      setReleasingId(null);
    }
  }

  return (
    <TeacherShell section="quizzes">
      <div className="flex flex-col gap-6">
        <PageHeader
          title={data ? `Attempts — ${data.quiz.title}` : "Attempts"}
          description={data ? `${data.quiz.questionCount} question${data.quiz.questionCount === 1 ? "" : "s"} • ${data.quiz.secondsPerQuestion}s per question • −${data.quiz.penaltyPerLeave} per leave • auto-submit after ${data.quiz.leaveThreshold} leaves` : undefined}
        />

        <Card>
          <CardHeader>
            <CardTitle>Attempts</CardTitle>
            <div className="flex items-center gap-3">
              {data && (
                data.quiz.resultsReleased ? (
                  <Badge tone="success" dot>
                    Released{data.quiz.resultsReleasedAt ? ` ${formatDateTime(data.quiz.resultsReleasedAt)}` : ""}
                  </Badge>
                ) : (
                  <Button
                    variant="secondary"
                    onClick={releaseAll}
                    loading={releasingAll}
                    disabled={data.attempts.every((r) => r.attempt.status === "in_progress")}
                  >
                    Release all results
                  </Button>
                )
              )}
              <Link to="/teacher/quizzes" className="text-xs text-[var(--accent)] hover:underline">Back to quizzes</Link>
            </div>
          </CardHeader>
          <Table>
            <THead>
              <TR>
                <TH>Student</TH>
                <TH>Status</TH>
                <TH>Raw</TH>
                <TH>Penalty</TH>
                <TH>Final</TH>
                <TH>Leaves</TH>
                <TH>Submitted</TH>
                <TH className="text-right">Release</TH>
              </TR>
            </THead>
            <TBody>
              {data?.attempts.map((row) => {
                const released = data.quiz.resultsReleased || row.attempt.released;
                const canRelease = !released && row.attempt.status !== "in_progress";
                return (
                  <TR key={row.attempt.id}>
                    <TD label="Student">
                      <div className="font-medium">{row.studentName ?? "Unknown"}</div>
                      <div className="text-xs text-[var(--fg-muted)]">{row.studentEmail ?? ""}</div>
                    </TD>
                    <TD label="Status">
                      <Badge tone={attemptStatusTone(row.attempt.status)} dot>{row.attempt.status.replace("_", " ")}</Badge>
                    </TD>
                    <TD label="Raw" className="text-xs">{row.attempt.rawScore} / {row.attempt.totalQuestions}</TD>
                    <TD label="Penalty" className="text-xs text-[var(--danger)]">−{row.attempt.penalty}</TD>
                    <TD label="Final" className="text-sm font-semibold">{row.attempt.finalScore}</TD>
                    <TD label="Leaves" className="text-xs">{row.attempt.leaveCount}</TD>
                    <TD label="Submitted" className="text-xs text-[var(--fg-muted)]">
                      {row.attempt.submittedAt ? formatDateTime(row.attempt.submittedAt) : "—"}
                    </TD>
                    <TD label="Release" className="text-right">
                      {released ? (
                        <Badge tone="success" dot>Released</Badge>
                      ) : canRelease ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => releaseOne(row)}
                          loading={releasingId === row.attempt.id}
                        >
                          Release
                        </Button>
                      ) : (
                        <span className="text-xs text-[var(--fg-muted)]">—</span>
                      )}
                    </TD>
                  </TR>
                );
              })}
              {!loading && data && data.attempts.length === 0 && (
                <EmptyRow cols={8}>No attempts yet.</EmptyRow>
              )}
              {loading && <EmptyRow cols={8}>Loading…</EmptyRow>}
            </TBody>
          </Table>
        </Card>
      </div>
    </TeacherShell>
  );
}
