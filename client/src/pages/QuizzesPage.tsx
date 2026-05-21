import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import TeacherShell from "../components/TeacherShell";
import { toast } from "../components/Toast";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardHeader, CardTitle } from "../components/ui/Card";
import { Icon } from "../components/ui/Icons";
import { PageHeader } from "../components/ui/PageHeader";
import { Table, TBody, TD, TH, THead, TR, EmptyRow } from "../components/ui/Table";
import { api } from "../api";
import { formatRelative } from "../lib/format";
import type { Cohort, Quiz, QuizStatus } from "../types";

function statusTone(status: QuizStatus) {
  if (status === "open") return "success" as const;
  if (status === "draft") return "neutral" as const;
  return "warn" as const;
}

export default function QuizzesPage() {
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function copyLink(quiz: Quiz) {
    const link = `${window.location.origin}/student/quizzes/${quiz.id}`;
    navigator.clipboard.writeText(link).then(
      () => {
        setCopiedId(quiz.id);
        toast().success("Link copied");
        setTimeout(() => setCopiedId((curr) => (curr === quiz.id ? null : curr)), 2000);
      },
      () => toast().error("Couldn't copy link."),
    );
  }

  useEffect(() => {
    Promise.all([
      api<Quiz[]>("/quizzes"),
      api<Cohort[]>("/cohorts"),
    ])
      .then(([qs, cs]) => {
        setQuizzes(qs);
        setCohorts(cs);
      })
      .catch((err) => toast().error(err instanceof Error ? err.message : "Failed to load quizzes."))
      .finally(() => setLoading(false));
  }, []);

  function cohortName(id: string) {
    return cohorts.find((c) => c.id === id)?.name ?? "—";
  }

  async function removeQuiz(quiz: Quiz) {
    if (!confirm(`Delete "${quiz.title}"? All attempts will be lost.`)) return;
    try {
      await api(`/quizzes/${quiz.id}`, { method: "DELETE" });
      setQuizzes((prev) => prev.filter((q) => q.id !== quiz.id));
      toast().success("Quiz deleted.");
    } catch (err) {
      toast().error(err instanceof Error ? err.message : "Failed to delete quiz.");
    }
  }

  return (
    <TeacherShell section="quizzes">
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PageHeader
            title="Quizzes"
            description="Paste objective questions in JSON, set the timer, target a cohort. Students see one question at a time and lose marks for leaving the tab."
          />
          <Link to="/teacher/quizzes/new">
            <Button>
              <Icon.Plus className="h-3.5 w-3.5" />
              New quiz
            </Button>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Your quizzes</CardTitle>
          </CardHeader>
          <Table>
            <THead>
              <TR>
                <TH>Title</TH>
                <TH>Status</TH>
                <TH>Cohort</TH>
                <TH>Questions</TH>
                <TH>Timer</TH>
                <TH>Created</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {quizzes.map((quiz) => (
                <TR
                  key={quiz.id}
                  className="cursor-pointer hover:bg-[var(--surface-muted)]/60"
                  onClick={() => navigate(`/teacher/quizzes/${quiz.id}/results`)}
                >
                  <TD label="Title">
                    <span className="font-medium">{quiz.title}</span>
                  </TD>
                  <TD label="Status">
                    <Badge tone={statusTone(quiz.status)} dot>{quiz.status}</Badge>
                  </TD>
                  <TD label="Cohort" className="text-xs text-[var(--fg-muted)]">{cohortName(quiz.cohortId)}</TD>
                  <TD label="Questions" className="text-xs text-[var(--fg-muted)]">{quiz.questionCount}</TD>
                  <TD label="Timer" className="text-xs text-[var(--fg-muted)]">{quiz.secondsPerQuestion}s / q</TD>
                  <TD label="Created" className="text-xs text-[var(--fg-muted)]">{formatRelative(quiz.createdAt)}</TD>
                  <TD label="Actions" className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        disabled={quiz.status !== "open"}
                        title={quiz.status === "open" ? "Copy student link" : "Open the quiz to share a link"}
                        onClick={() => copyLink(quiz)}
                        className="rounded-md p-1.5 text-[var(--fg-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--fg)] disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        <Icon.Copy className="h-3.5 w-3.5" />
                        {copiedId === quiz.id && <span className="sr-only">Copied</span>}
                      </button>
                      <Link
                        to={`/teacher/quizzes/${quiz.id}/results`}
                        title="View attempts"
                        className="rounded-md p-1.5 text-[var(--fg-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--fg)]"
                      >
                        <Icon.Inbox className="h-3.5 w-3.5" />
                      </Link>
                      <Link
                        to={`/teacher/quizzes/${quiz.id}/edit`}
                        title="Edit quiz"
                        className="rounded-md p-1.5 text-[var(--fg-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--fg)]"
                      >
                        <Icon.Edit className="h-3.5 w-3.5" />
                      </Link>
                      <button
                        type="button"
                        title="Delete quiz"
                        onClick={() => removeQuiz(quiz)}
                        className="rounded-md p-1.5 text-[var(--fg-subtle)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
                      >
                        <Icon.Trash className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </TD>
                </TR>
              ))}
              {!loading && quizzes.length === 0 && (
                <EmptyRow cols={7}>No quizzes yet. Click "New quiz" to create one.</EmptyRow>
              )}
              {loading && <EmptyRow cols={7}>Loading…</EmptyRow>}
            </TBody>
          </Table>
        </Card>
      </div>
    </TeacherShell>
  );
}
