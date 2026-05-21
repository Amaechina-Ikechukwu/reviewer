import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "../components/Toast";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Icon } from "../components/ui/Icons";
import { api } from "../api";
import type { Quiz, QuizAttempt, QuizQuestion } from "../types";

type Stage = "intro" | "running" | "submitting" | "done" | "review";

type StartResponse = {
  attempt: QuizAttempt;
  quiz: Quiz;
  questions: Array<{ id: string; prompt: string; options: string[] }>;
};

type SummaryResponse = {
  attempt: QuizAttempt;
  quiz: Quiz & { questions?: QuizQuestion[] };
} | null;

function requestFullscreen() {
  const el = document.documentElement as any;
  const fn = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
  if (typeof fn === "function") {
    try {
      const p = fn.call(el);
      if (p && typeof p.then === "function") p.catch(() => {});
    } catch {
      // ignore
    }
  }
}

function exitFullscreenIfActive() {
  const d = document as any;
  const fsEl = d.fullscreenElement || d.webkitFullscreenElement || d.msFullscreenElement;
  if (!fsEl) return;
  const fn = d.exitFullscreen || d.webkitExitFullscreen || d.msExitFullscreen;
  if (typeof fn === "function") {
    try {
      const p = fn.call(d);
      if (p && typeof p.then === "function") p.catch(() => {});
    } catch {
      // ignore
    }
  }
}

export default function TakeQuiz() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [stage, setStage] = useState<Stage>("intro");
  const [quizMeta, setQuizMeta] = useState<Quiz | null>(null);
  const [summary, setSummary] = useState<SummaryResponse>(null);
  const [questions, setQuestions] = useState<Array<{ id: string; prompt: string; options: string[] }>>([]);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [questionIndex, setQuestionIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [leaveCount, setLeaveCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Refs are used inside event listeners that mount once and need the latest state.
  const stageRef = useRef(stage);
  const attemptIdRef = useRef<string | null>(null);
  const answersRef = useRef(answers);
  const quizIdRef = useRef<string | null>(null);
  const leaveCountRef = useRef(leaveCount);
  const submittingRef = useRef(false);
  const leaveThresholdRef = useRef<number>(3);

  useEffect(() => { stageRef.current = stage; }, [stage]);
  useEffect(() => { attemptIdRef.current = attemptId; }, [attemptId]);
  useEffect(() => { answersRef.current = answers; }, [answers]);
  useEffect(() => { quizIdRef.current = id ?? null; }, [id]);
  useEffect(() => { leaveCountRef.current = leaveCount; }, [leaveCount]);
  useEffect(() => { if (quizMeta) leaveThresholdRef.current = quizMeta.leaveThreshold; }, [quizMeta]);

  // Initial load: existing attempt summary, or quiz preview
  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const s = await api<SummaryResponse>(`/quizzes/${id}/my-attempt`);
        if (s && s.attempt.status !== "in_progress") {
          setSummary(s);
          setQuizMeta(s.quiz);
          setStage("done");
          setLoading(false);
          return;
        }
        const quiz = await api<Quiz>(`/quizzes/${id}`);
        setQuizMeta(quiz);
        setStage("intro");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load quiz.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // Submit attempt (used by manual submit, timer expiry, and auto-submit on leave threshold)
  const submitAttempt = useCallback(async (opts: { auto?: boolean } = {}) => {
    if (submittingRef.current) return;
    if (!attemptIdRef.current || !quizIdRef.current) return;
    submittingRef.current = true;
    setStage("submitting");
    try {
      const result = await api<QuizAttempt>(
        `/quizzes/${quizIdRef.current}/attempts/${attemptIdRef.current}/submit`,
        { method: "POST", body: JSON.stringify({ answers: answersRef.current, auto: !!opts.auto }) },
      );
      // Fetch the summary view (includes correct answers for review).
      try {
        const s = await api<SummaryResponse>(`/quizzes/${quizIdRef.current}/my-attempt`);
        if (s) setSummary(s);
        else setSummary({ attempt: result, quiz: quizMeta as Quiz });
      } catch {
        setSummary({ attempt: result, quiz: quizMeta as Quiz });
      }
      setStage("done");
      exitFullscreenIfActive();
    } catch (err) {
      toast().error(err instanceof Error ? err.message : "Failed to submit. Try again.");
      setStage("running");
      submittingRef.current = false;
    }
  }, [quizMeta]);

  // Anti-cheat: register a leave + auto-submit if threshold reached.
  const registerLeave = useCallback(async () => {
    if (stageRef.current !== "running") return;
    if (!attemptIdRef.current || !quizIdRef.current) return;
    try {
      const res = await api<{ leaveCount: number }>(
        `/quizzes/${quizIdRef.current}/attempts/${attemptIdRef.current}/leave`,
        { method: "POST" },
      );
      setLeaveCount(res.leaveCount);
      leaveCountRef.current = res.leaveCount;
      const penalty = (quizMeta?.penaltyPerLeave ?? 2);
      toast().error(`Tab-leave detected. −${penalty} marks. (${res.leaveCount}/${leaveThresholdRef.current})`);
      if (res.leaveCount >= leaveThresholdRef.current) {
        void submitAttempt({ auto: true });
      }
    } catch {
      // Best-effort: still bump locally so UI stays consistent.
      const next = leaveCountRef.current + 1;
      setLeaveCount(next);
      leaveCountRef.current = next;
      if (next >= leaveThresholdRef.current) {
        void submitAttempt({ auto: true });
      }
    }
  }, [quizMeta, submitAttempt]);

  // Attach anti-cheat listeners only while a quiz is "running".
  useEffect(() => {
    if (stage !== "running") return;

    function onVisibilityChange() {
      if (document.hidden) void registerLeave();
    }
    function onBlur() {
      // Window blur — switched app / clicked outside the browser
      if (stageRef.current === "running") void registerLeave();
    }
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (stageRef.current !== "running") return;
      e.preventDefault();
      // Required for the prompt in some browsers
      e.returnValue = "Leaving will cost you marks. Are you sure?";
      return e.returnValue;
    }
    function onFullscreenChange() {
      const d = document as any;
      const isFs = !!(d.fullscreenElement || d.webkitFullscreenElement || d.msFullscreenElement);
      if (!isFs && stageRef.current === "running") void registerLeave();
    }
    function onContextMenu(e: MouseEvent) {
      e.preventDefault();
    }
    function onCopy(e: ClipboardEvent) {
      e.preventDefault();
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", onBlur);
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("copy", onCopy);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("copy", onCopy);
    };
  }, [stage, registerLeave]);

  // Per-question timer
  useEffect(() => {
    if (stage !== "running") return;
    if (!quizMeta) return;
    setSecondsLeft(quizMeta.secondsPerQuestion);
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          // advance on next tick to avoid setState-during-render issues
          setTimeout(() => goNext(), 0);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, questionIndex, quizMeta]);

  function goNext() {
    setQuestionIndex((i) => {
      const next = i + 1;
      if (next >= questions.length) {
        void submitAttempt();
        return i;
      }
      return next;
    });
  }

  async function start() {
    if (!id) return;
    try {
      const r = await api<StartResponse>(`/quizzes/${id}/attempts/start`, { method: "POST" });
      setAttemptId(r.attempt.id);
      setQuizMeta(r.quiz);
      setQuestions(r.questions);
      setAnswers(r.attempt.answers ?? {});
      setLeaveCount(r.attempt.leaveCount ?? 0);
      setQuestionIndex(0);
      setStage("running");
      // Defer fullscreen until next tick to ensure it follows the user gesture.
      setTimeout(() => requestFullscreen(), 0);
    } catch (err) {
      toast().error(err instanceof Error ? err.message : "Failed to start.");
    }
  }

  const currentQ = questions[questionIndex];
  const progressPct = useMemo(() => {
    if (!quizMeta) return 0;
    return Math.round((secondsLeft / Math.max(1, quizMeta.secondsPerQuestion)) * 100);
  }, [secondsLeft, quizMeta]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] text-sm text-[var(--fg-muted)]">Loading…</div>;
  }
  if (error || !quizMeta) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
        <p className="text-sm text-[var(--danger)]">{error ?? "Quiz not found."}</p>
        <Link to="/student/quizzes" className="text-sm text-[var(--accent)] hover:underline">Back to quizzes</Link>
      </div>
    );
  }

  // INTRO — show the rules
  if (stage === "intro") {
    return (
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-4 py-10">
        <Card>
          <CardHeader>
            <CardTitle>{quizMeta.title}</CardTitle>
            <Badge tone="accent" dot>{quizMeta.questionCount} question{quizMeta.questionCount === 1 ? "" : "s"}</Badge>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm">
            {quizMeta.description && <p className="text-[var(--fg)]">{quizMeta.description}</p>}
            <div className="border border-[var(--warn-soft)] bg-[var(--warn-soft)]/40 p-4 text-[var(--fg)]">
              <p className="mb-2 flex items-center gap-2 font-semibold text-[var(--warn)]">
                <Icon.AlertTriangle className="h-4 w-4" /> Rules before you start
              </p>
              <ul className="flex flex-col gap-1.5 pl-1 text-sm text-[var(--fg)]">
                <li>• You will see <b>one question at a time</b>.</li>
                <li>• Each question is timed for <b>{quizMeta.secondsPerQuestion} seconds</b>. When time runs out, it auto-advances.</li>
                <li>• <b>Do not switch tabs, minimize, or leave the window.</b></li>
                <li>• Every time you leave, <b>{quizMeta.penaltyPerLeave} marks are deducted</b>.</li>
                <li>• After <b>{quizMeta.leaveThreshold} leaves</b>, your quiz will be <b>auto-submitted</b>.</li>
                <li>• Once submitted, you cannot retake this quiz.</li>
              </ul>
            </div>
            <p className="text-xs text-[var(--fg-muted)]">
              The quiz opens in fullscreen. Press the button below only when you're ready.
            </p>
          </CardContent>
        </Card>
        <div className="flex justify-between gap-2">
          <Link to="/student/quizzes">
            <Button variant="secondary">Back</Button>
          </Link>
          <Button onClick={start}>I understand — start quiz</Button>
        </div>
      </div>
    );
  }

  // DONE — show the summary
  if (stage === "done") {
    const a = summary?.attempt;
    const released = !!(summary?.quiz.resultsReleased || a?.released);
    return (
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-10">
        <Card>
          <CardHeader>
            <CardTitle>Results — {quizMeta.title}</CardTitle>
            {a?.status === "auto_submitted" && <Badge tone="warn" dot>Auto-submitted</Badge>}
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {a ? (
              released ? (
                <>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="border border-[var(--border)] p-3">
                      <div className="text-xs text-[var(--fg-muted)]">Raw</div>
                      <div className="text-xl font-semibold">{a.rawScore} / {a.totalQuestions}</div>
                    </div>
                    <div className="border border-[var(--border)] p-3">
                      <div className="text-xs text-[var(--fg-muted)]">Penalty</div>
                      <div className="text-xl font-semibold text-[var(--danger)]">−{a.penalty}</div>
                    </div>
                    <div className="border border-[var(--border)] p-3">
                      <div className="text-xs text-[var(--fg-muted)]">Final</div>
                      <div className="text-xl font-semibold">{a.finalScore}</div>
                    </div>
                  </div>
                  <div className="text-xs text-[var(--fg-muted)]">
                    Tab-leaves recorded: <b>{a.leaveCount}</b>
                  </div>
                </>
              ) : (
                <div className="border border-[var(--border)] bg-[var(--surface-muted)]/40 p-4 text-center">
                  <p className="font-medium text-[var(--fg)]">Submitted — awaiting release</p>
                  <p className="mt-1 text-xs text-[var(--fg-muted)]">
                    Your teacher hasn't released results for this quiz yet. You'll see your score and the correct answers once they do.
                  </p>
                </div>
              )
            ) : (
              <p>Loading summary…</p>
            )}
          </CardContent>
        </Card>

        {released && summary?.quiz.questions && a && (
          <Card>
            <CardHeader>
              <CardTitle>Review</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 text-sm">
              {summary.quiz.questions.map((q, i) => {
                const chosen = a.answers[q.id];
                const correct = q.correctIndex;
                return (
                  <div key={q.id} className="border border-[var(--border)] p-3">
                    <p className="mb-4 font-medium">{i + 1}. {q.prompt}</p>
                    <ul className="flex flex-col gap-1">
                      {q.options.map((opt, idx) => {
                        const isChosen = idx === chosen;
                        const isCorrect = idx === correct;
                        return (
                          <li
                            key={idx}
                            className={
                              isCorrect
                                ? "border border-[var(--success)] bg-[var(--success-soft)] px-2 py-1"
                                : isChosen
                                  ? "border border-[var(--danger)] bg-[var(--danger-soft)] px-2 py-1"
                                  : "border border-[var(--border)] px-2 py-1"
                            }
                          >
                            <span className="text-xs text-[var(--fg-muted)]">{String.fromCharCode(65 + idx)}.</span>{" "}
                            {opt}
                            {isCorrect && <span className="ml-2 text-xs text-[var(--success)]">(correct)</span>}
                            {isChosen && !isCorrect && <span className="ml-2 text-xs text-[var(--danger)]">(your choice)</span>}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        <div className="flex justify-end">
          <Button onClick={() => navigate("/student/quizzes")}>Back to quizzes</Button>
        </div>
      </div>
    );
  }

  // RUNNING / SUBMITTING — the locked quiz UI
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--bg)]">
      <div className="border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Icon.Clock className="h-4 w-4 text-[var(--accent)]" />
            <div className="text-sm font-semibold">{quizMeta.title}</div>
            <Badge tone="neutral">{questionIndex + 1} / {questions.length}</Badge>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className={leaveCount > 0 ? "text-[var(--danger)] font-semibold" : "text-[var(--fg-muted)]"}>
              Leaves: {leaveCount} / {quizMeta.leaveThreshold}
            </span>
            <span className="text-[var(--fg-muted)]">−{quizMeta.penaltyPerLeave} each</span>
          </div>
        </div>
        <div className="mx-auto mt-2 max-w-3xl">
          <div className="h-1.5 w-full overflow-hidden bg-[var(--surface-muted)]">
            <div
              className="h-full bg-[var(--accent)] transition-all duration-1000 ease-linear"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="mt-1 text-right text-xs text-[var(--fg-muted)] tabular-nums">{secondsLeft}s</div>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-4 py-8">
        <div className="mx-auto max-w-2xl">
          {currentQ ? (
            <Card>
              <CardContent className="flex flex-col gap-5 py-6">
                <p className="text-base font-medium text-[var(--fg)]">{currentQ.prompt}</p>
                <div className="flex flex-col gap-2">
                  {currentQ.options.map((opt, idx) => {
                    const selected = answers[currentQ.id] === idx;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setAnswers((prev) => ({ ...prev, [currentQ.id]: idx }))}
                        className={
                          selected
                            ? "border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-3 text-left text-sm"
                            : "border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-left text-sm hover:border-[var(--accent)]/60"
                        }
                      >
                        <span className="mr-2 text-xs font-semibold text-[var(--fg-muted)]">{String.fromCharCode(65 + idx)}.</span>
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ) : (
            <p className="text-sm text-[var(--fg-muted)]">No question loaded.</p>
          )}

          <div className="mt-6 flex justify-end gap-2">
            {questionIndex < questions.length - 1 ? (
              <Button onClick={goNext} disabled={stage === "submitting"}>
                Next question
              </Button>
            ) : (
              <Button onClick={() => submitAttempt()} loading={stage === "submitting"}>
                Submit quiz
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
