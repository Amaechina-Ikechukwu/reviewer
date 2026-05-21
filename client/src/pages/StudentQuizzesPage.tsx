import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import StudentShell from "../components/StudentShell";
import { toast } from "../components/Toast";
import { Badge } from "../components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Icon } from "../components/ui/Icons";
import { PageHeader } from "../components/ui/PageHeader";
import { api } from "../api";
import { formatDateTime } from "../lib/format";
import type { Quiz, QuizAttempt } from "../types";

type Row = Quiz & { myAttempt: QuizAttempt | null };

export default function StudentQuizzesPage() {
  const [quizzes, setQuizzes] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Row[]>("/quizzes")
      .then(setQuizzes)
      .catch((err) => toast().error(err instanceof Error ? err.message : "Failed to load quizzes."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <StudentShell section="quizzes">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <PageHeader
          title="Quizzes"
          description="Timed, one question at a time. Read the rules carefully before you start — leaving the tab costs you marks."
        />

        {loading ? (
          <Card><CardContent className="py-10 text-center text-sm text-[var(--fg-muted)]">Loading…</CardContent></Card>
        ) : quizzes.length === 0 ? (
          <Card><CardContent className="py-10 text-center text-sm text-[var(--fg-muted)]">No open quizzes right now.</CardContent></Card>
        ) : (
          quizzes.map((quiz) => {
            const done = quiz.myAttempt && quiz.myAttempt.status !== "in_progress";
            const released = done && (quiz.resultsReleased || quiz.myAttempt!.released);
            return (
              <Link key={quiz.id} to={`/student/quizzes/${quiz.id}`} className="block">
                <Card className="transition-colors hover:border-[var(--accent)]/50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Icon.Clock className="h-4 w-4 text-[var(--fg-muted)]" />
                      {quiz.title}
                    </CardTitle>
                    {done ? (
                      released ? (
                        <Badge tone="success" dot>
                          Score {quiz.myAttempt!.finalScore} / {quiz.myAttempt!.totalQuestions}
                        </Badge>
                      ) : (
                        <Badge tone="neutral" dot>Awaiting release</Badge>
                      )
                    ) : quiz.myAttempt?.status === "in_progress" ? (
                      <Badge tone="warn" dot>In progress</Badge>
                    ) : (
                      <Badge tone="accent">Not started</Badge>
                    )}
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2 text-sm text-[var(--fg-muted)]">
                    {quiz.description && <p className="text-[var(--fg)]">{quiz.description}</p>}
                    <div className="flex flex-wrap gap-3 text-xs">
                      <span>{quiz.questionCount} question{quiz.questionCount === 1 ? "" : "s"}</span>
                      <span>{quiz.secondsPerQuestion}s per question</span>
                      <span className="text-[var(--warn)]">−{quiz.penaltyPerLeave} per tab-leave</span>
                      {quiz.myAttempt?.submittedAt && (
                        <span>Submitted {formatDateTime(quiz.myAttempt.submittedAt)}</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })
        )}
      </div>
    </StudentShell>
  );
}
