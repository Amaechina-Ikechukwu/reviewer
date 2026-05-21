import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import TeacherShell from "../components/TeacherShell";
import { toast } from "../components/Toast";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Input, Label, Select, Textarea } from "../components/ui/Input";
import { PageHeader } from "../components/ui/PageHeader";
import { api, listCohorts } from "../api";
import type { Cohort, Quiz, QuizQuestion, QuizStatus } from "../types";

const SAMPLE_JSON = `[
  {
    "question": "Capital of France?",
    "options": ["Paris", "Lyon", "Nice", "Lille"],
    "answer": "Paris"
  },
  {
    "question": "2 + 2 equals?",
    "options": ["3", "4", "5"],
    "answer": 1
  }
]`;

type QuizDetail = Quiz & { questions?: QuizQuestion[] };

function questionsToJson(qs: QuizQuestion[] | undefined): string {
  if (!qs || qs.length === 0) return "";
  return JSON.stringify(
    qs.map((q) => ({
      question: q.prompt,
      options: q.options,
      answer: typeof q.correctIndex === "number" ? q.correctIndex : undefined,
    })),
    null,
    2,
  );
}

export default function QuizBuilder() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [cohortId, setCohortId] = useState("");
  const [secondsPerQuestion, setSecondsPerQuestion] = useState(15);
  const [leaveThreshold, setLeaveThreshold] = useState(3);
  const [penaltyPerLeave, setPenaltyPerLeave] = useState(2);
  const [status, setStatus] = useState<QuizStatus>("draft");
  const [questionsJson, setQuestionsJson] = useState(SAMPLE_JSON);

  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [hasAttempts, setHasAttempts] = useState(false);

  useEffect(() => {
    listCohorts()
      .then((cs) => {
        setCohorts(cs);
        if (!isEdit && cs[0]) setCohortId(cs[0].id);
      })
      .catch((err) => toast().error(err instanceof Error ? err.message : "Failed to load cohorts."));
  }, [isEdit]);

  useEffect(() => {
    if (!isEdit || !id) return;
    api<QuizDetail>(`/quizzes/${id}`)
      .then((q) => {
        setTitle(q.title);
        setDescription(q.description ?? "");
        setCohortId(q.cohortId);
        setSecondsPerQuestion(q.secondsPerQuestion);
        setLeaveThreshold(q.leaveThreshold);
        setPenaltyPerLeave(q.penaltyPerLeave);
        setStatus(q.status);
        setQuestionsJson(questionsToJson(q.questions));
      })
      .catch((err) => toast().error(err instanceof Error ? err.message : "Failed to load quiz."))
      .finally(() => setLoading(false));

    api<{ attempts: any[] }>(`/quizzes/${id}/attempts`)
      .then((r) => setHasAttempts(r.attempts.length > 0))
      .catch(() => {});
  }, [isEdit, id]);

  const parsedPreview = useMemo<{ ok: true; count: number } | { ok: false; error: string }>(() => {
    if (!questionsJson.trim()) return { ok: false, error: "Paste a JSON array of questions." };
    try {
      const raw = JSON.parse(questionsJson);
      const arr = Array.isArray(raw) ? raw : Array.isArray((raw as any)?.questions) ? (raw as any).questions : null;
      if (!arr) return { ok: false, error: "Top-level must be a JSON array." };
      if (arr.length === 0) return { ok: false, error: "Add at least one question." };
      for (let i = 0; i < arr.length; i++) {
        const q = arr[i];
        if (!q?.question && !q?.prompt && !q?.q) return { ok: false, error: `Q${i + 1}: missing "question".` };
        const opts = q.options ?? q.choices;
        if (!Array.isArray(opts) || opts.length < 2) return { ok: false, error: `Q${i + 1}: needs "options" with 2+ items.` };
        const ans = q.answer ?? q.correct ?? q.correctAnswer ?? q.correctIndex;
        if (ans === undefined || ans === null) return { ok: false, error: `Q${i + 1}: missing "answer".` };
      }
      return { ok: true, count: arr.length };
    } catch (err) {
      return { ok: false, error: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}` };
    }
  }, [questionsJson]);

  async function save(nextStatus?: QuizStatus) {
    if (!title.trim()) {
      toast().error("Title is required.");
      return;
    }
    if (!cohortId) {
      toast().error("Pick a cohort.");
      return;
    }
    if (!parsedPreview.ok) {
      toast().error(parsedPreview.error);
      return;
    }

    setSaving(true);
    try {
      const payload: any = {
        title: title.trim(),
        description: description.trim(),
        cohortId,
        secondsPerQuestion,
        leaveThreshold,
        penaltyPerLeave,
        status: nextStatus ?? status,
      };
      if (!isEdit || !hasAttempts) {
        payload.questionsJson = questionsJson;
      }

      if (isEdit && id) {
        await api(`/quizzes/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
        toast().success("Quiz updated.");
      } else {
        await api("/quizzes", { method: "POST", body: JSON.stringify(payload) });
        toast().success("Quiz created.");
      }
      navigate("/teacher/quizzes");
    } catch (err) {
      toast().error(err instanceof Error ? err.message : "Failed to save quiz.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <TeacherShell section="quizzes">
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--fg-muted)]">Loading…</div>
      </TeacherShell>
    );
  }

  return (
    <TeacherShell section="quizzes">
      <div className="flex flex-col gap-6">
        <PageHeader
          title={isEdit ? "Edit quiz" : "New quiz"}
          description="Configure timing, target a cohort, then paste your questions JSON. Server validates and scores; correct answers never leave the server."
        />

        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Label className="md:col-span-2">
              Title
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Algebra Pop Quiz" />
            </Label>
            <Label className="md:col-span-2">
              Description (optional)
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Short context shown before the quiz starts." />
            </Label>
            <Label>
              Cohort
              <Select value={cohortId} onChange={(e) => setCohortId(e.target.value)} placeholder="Pick a cohort">
                {cohorts.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Label>
            <Label>
              Status
              <Select value={status} onChange={(e) => setStatus(e.target.value as QuizStatus)}>
                <option value="draft">Draft</option>
                <option value="open">Open</option>
                <option value="closed">Closed</option>
              </Select>
            </Label>
            <Label>
              Seconds per question
              <Input
                type="number"
                min={3}
                max={600}
                value={secondsPerQuestion}
                onChange={(e) => setSecondsPerQuestion(Math.max(3, Math.min(600, Number(e.target.value) || 15)))}
              />
            </Label>
            <Label>
              Auto-submit after this many tab-leaves
              <Input
                type="number"
                min={1}
                value={leaveThreshold}
                onChange={(e) => setLeaveThreshold(Math.max(1, Number(e.target.value) || 3))}
              />
            </Label>
            <Label>
              Marks deducted per tab-leave
              <Input
                type="number"
                min={0}
                value={penaltyPerLeave}
                onChange={(e) => setPenaltyPerLeave(Math.max(0, Number(e.target.value) || 2))}
              />
            </Label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Questions JSON</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-xs text-[var(--fg-muted)]">
              Paste an array of <code>{`{ question, options, answer }`}</code>. <code>answer</code> can be the option text or its zero-based index.
            </p>
            <Textarea
              rows={16}
              spellCheck={false}
              value={questionsJson}
              onChange={(e) => setQuestionsJson(e.target.value)}
              disabled={hasAttempts}
              className="font-mono text-xs"
            />
            {hasAttempts && (
              <p className="text-xs text-[var(--warn)]">Questions are locked because students have already attempted this quiz.</p>
            )}
            <div className="text-xs">
              {parsedPreview.ok ? (
                <span className="text-[var(--success)]">Parsed {parsedPreview.count} question{parsedPreview.count === 1 ? "" : "s"}.</span>
              ) : (
                <span className="text-[var(--danger)]">{parsedPreview.error}</span>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => navigate("/teacher/quizzes")} disabled={saving}>
            Cancel
          </Button>
          <Button variant="outline" onClick={() => save("draft")} loading={saving}>
            Save as draft
          </Button>
          <Button onClick={() => save("open")} loading={saving}>
            {isEdit ? "Save & open" : "Create & open"}
          </Button>
        </div>
      </div>
    </TeacherShell>
  );
}
