import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { marked } from "marked";
import SubmissionViewer from "../components/SubmissionViewer";
import TeacherShell from "../components/TeacherShell";
import { toast } from "../components/Toast";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Icon } from "../components/ui/Icons";
import { Input, Label, Textarea } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { api } from "../api";
import { cn } from "../lib/cn";
import { formatDateTime } from "../lib/format";
import type { CodeFile, Review } from "../types";

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
    rubric: string;
    maxScore: number;
    sourceType: string;
    sourceMarkdown: string | null;
    sourceUrl: string | null;
    sourcePdfPath: string | null;
    questions?: string | null;
    defaultProvider: string;
  };
  studentName: string | null;
  studentEmail: string | null;
};

function structureLabel(classification?: string) {
  switch (classification) {
    case "one_file_per_question":
      return "File per question";
    case "multi_file_per_question":
      return "Grouped by question";
    case "single_project_solution":
      return "Single combined solution";
    case "mixed_or_unclear":
      return "Mixed";
    default:
      return "Structure pending";
  }
}


function ScorePill({ score, max }: { score: number; max: number }) {
  const pct = max > 0 ? score / max : 0;
  const tone = pct >= 0.8 ? "success" : pct >= 0.6 ? "warn" : "danger";
  const classes =
    tone === "success"
      ? "bg-[var(--success-soft)] text-[var(--success)]"
      : tone === "warn"
        ? "bg-[var(--warn-soft)] text-[var(--warn)]"
        : "bg-[var(--danger-soft)] text-[var(--danger)]";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums", classes)}>
      {score}
      <span className="opacity-60">/{max}</span>
    </span>
  );
}

export default function ReviewSubmission() {
  const { submissionId } = useParams();
  const [submission, setSubmission] = useState<SubmissionResponse | null>(null);
  const [files, setFiles] = useState<CodeFile[]>([]);
  const [review, setReview] = useState<Review | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [showProviderModal, setShowProviderModal] = useState(false);
  type ProviderKey = "gemini" | "nvidia" | `openrouter:${string}`;
  const [selectedProvider, setSelectedProvider] = useState<ProviderKey>("gemini");
  const [availableProviders, setAvailableProviders] = useState<
    Array<{ name: string; configured: boolean; model: string; models?: Array<{ id: string; label: string; note?: string }> }>
  >([]);
  useEffect(() => {
    api<typeof availableProviders>("/reviews/providers").then(setAvailableProviders).catch(() => {});
  }, []);
  const [selectedFilename, setSelectedFilename] = useState("");
  const [overrideScore, setOverrideScore] = useState("");
  const [finalFeedback, setFinalFeedback] = useState("");
  const [message, setMessage] = useState("");
  const [releaseCount, setReleaseCount] = useState(0);
  const [pdfBriefUrl, setPdfBriefUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!submissionId) return;

    api<SubmissionResponse>(`/submissions/${submissionId}`)
      .then((s) => {
        setSubmission(s);
        if (s.assignment.sourceType === "pdf" && s.assignment.sourcePdfPath) {
          const token = localStorage.getItem("token");
          fetch(`/v2/api/assignments/${s.assignment.id}/brief`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          })
            .then((r) => r.blob())
            .then((blob) => setPdfBriefUrl(URL.createObjectURL(blob)))
            .catch(() => {});
        }
      })
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load submission"));

    api<{ files: CodeFile[] }>(`/submissions/${submissionId}/files`)
      .then((data) => setFiles(data.files))
      .catch(() => setFiles([]));

    api<Review>(`/reviews/${submissionId}`)
      .then((data) => {
        setReview(data);
        const score = data.teacherOverrideScore ?? data.aiScore;
        setOverrideScore(typeof score === "number" ? String(score) : "");
        setFinalFeedback(data.feedback?.summary || "");
      })
      .catch(() => setReview(null));
  }, [submissionId]);

  useEffect(() => {
    if (files.length === 0) return;
    if (!files.some((file) => file.filename === selectedFilename)) setSelectedFilename(files[0].filename);
  }, [files, selectedFilename]);

  const selectedFile = files.find((file) => file.filename === selectedFilename) || files[0];

  const maxScore = review?.maxScore || submission?.assignment.maxScore || 100;
  const geminiSummary = review?.feedback?.summary || "No Gemini review has been run for this submission yet.";
  const geminiSuggestions = review?.feedback?.suggestions || [];
  const geminiModel = review?.feedback?.model || "gemini-2.5-flash";
  const geminiScore = review?.teacherOverrideScore ?? review?.aiScore;
  const structure = review?.feedback?.submissionStructure;
  const fileScores = review?.feedback?.fileScores || [];
  const averageFileScore = review?.feedback?.averageFileScore;
  const questionGroups = review?.feedback?.questionGroups || [];

  function focusFile(filename: string) {
    if (files.some((file) => file.filename === filename)) setSelectedFilename(filename);
  }

  async function runReview(providerKey: ProviderKey = "gemini") {
    if (!submissionId) return;
    setShowProviderModal(false);
    setReviewing(true);
    setMessage("");

    const [provider, ...modelParts] = providerKey.split(":");
    const model = modelParts.join(":") || undefined;

    try {
      const nextReview = await api<Review>(`/reviews/${submissionId}/run`, {
        method: "POST",
        body: JSON.stringify({ provider, model }),
      });
      setReview(nextReview);
      const score = nextReview.teacherOverrideScore ?? nextReview.aiScore;
      setOverrideScore(typeof score === "number" ? String(score) : "");
      setFinalFeedback(nextReview.feedback?.summary || "");
      toast().success("Review completed");
      api<{ files: CodeFile[] }>(`/submissions/${submissionId}/files`)
        .then((data) => setFiles(data.files))
        .catch(() => {});
    } catch (err) {
      toast().error(err instanceof Error ? err.message : "Review failed");
    } finally {
      setReviewing(false);
    }
  }

  async function applyOverride() {
    if (!submissionId) return;
    setReleasing(true);
    try {
      const nextReview = await api<Review>(`/reviews/${submissionId}/override`, {
        method: "PATCH",
        body: JSON.stringify({ score: Number(overrideScore), feedback: finalFeedback }),
      });
      setReview(nextReview);
      setReleaseCount((c) => c + 1);
      toast().success("Grade released");
    } catch (err) {
      toast().error(err instanceof Error ? err.message : "Failed to release grade");
    } finally {
      setReleasing(false);
    }
  }

  if (!submission) {
    return (
      <TeacherShell section="submissions">
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--fg-muted)]">
          Loading submission...
        </div>
      </TeacherShell>
    );
  }

  const parsedOverrideScore = Number(overrideScore);
  const canRelease = overrideScore.trim() !== "" && Number.isFinite(parsedOverrideScore) && parsedOverrideScore >= 0;
  const firstName = submission.studentName?.split(" ")[0] || "Student";

  return (
    <TeacherShell section="submissions">
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col gap-2">
          <Link
            to="/teacher/submissions"
            className="inline-flex w-fit items-center gap-1 text-xs font-medium text-[var(--fg-muted)] hover:text-[var(--accent)]"
          >
            <Icon.ChevronLeft className="h-3 w-3" />
            Submissions
          </Link>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-1">
              <h1 className="truncate text-2xl font-semibold tracking-tight">{submission.assignment.title}</h1>
              <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--fg-muted)]">
                <span className="font-medium text-[var(--fg)]">{submission.studentName || "Student"}</span>
                <span>Â·</span>
                <span>{formatDateTime(submission.submission.submittedAt)}</span>
              </div>
            </div>
            {submission.submission.githubUrl && (
              <a href={submission.submission.githubUrl} target="_blank" rel="noreferrer">
                <Button variant="secondary" size="sm">
                  <Icon.Github className="h-3.5 w-3.5" />
                  GitHub repo
                  <Icon.External className="h-3 w-3" />
                </Button>
              </a>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">
              {submission.submission.submissionType === "github" ? (
                <span className="inline-flex items-center gap-1">
                  <Icon.Github className="h-3 w-3" /> GitHub
                </span>
              ) : files.some((f) => f.language === "pdf") ? (
                <span className="inline-flex items-center gap-1">
                  <Icon.Upload className="h-3 w-3" /> PDF
                </span>
              ) : (
                <span className="inline-flex items-center gap-1">
                  <Icon.Upload className="h-3 w-3" /> ZIP
                </span>
              )}
            </Badge>
            {submission.submission.isLate ? (
              <Badge tone="warn">Late</Badge>
            ) : (
              <Badge tone="success">On time</Badge>
            )}
            <Badge tone="accent">{structureLabel(structure?.classification)}</Badge>
          </div>
        </div>

        {message && (
          <div className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger)]">
            {message}
          </div>
        )}

        {/* Assignment brief — collapsible reference for reviewer */}
        <details className="group rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium text-[var(--fg-muted)] hover:text-[var(--fg)]">
            <Icon.FileText className="h-4 w-4" />
            Assignment brief
            <Icon.ChevronRight className="ml-auto h-4 w-4 transition-transform group-open:rotate-90" />
          </summary>
          <div className="border-t border-[var(--border)] px-4 py-3">
            {submission.assignment.sourceType === "pdf" ? (
              pdfBriefUrl ? (
                <iframe src={pdfBriefUrl} className="h-[500px] w-full rounded-lg border-0" title="Assignment brief" />
              ) : (
                <div className="flex h-24 items-center justify-center text-sm text-[var(--fg-muted)]">Loading brief…</div>
              )
            ) : submission.assignment.sourceMarkdown ? (
              <div
                className="mdcontent text-sm leading-relaxed text-[var(--fg)]"
                dangerouslySetInnerHTML={{ __html: marked(submission.assignment.sourceMarkdown) as string }}
              />
            ) : submission.assignment.sourceUrl ? (
              <a
                href={submission.assignment.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)]/60 px-3 py-2 text-sm font-medium text-[var(--fg)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                <Icon.External className="h-3.5 w-3.5" />
                Open assignment brief
              </a>
            ) : (
              <p className="text-sm text-[var(--fg-muted)]">No brief attached to this assignment.</p>
            )}
          </div>
        </details>

        {/* Assignment questions — collapsible */}
        {submission.assignment.questions && (
          <details className="group rounded-xl border border-[var(--border)] bg-[var(--surface)]">
            <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium text-[var(--fg-muted)] hover:text-[var(--fg)]">
              <Icon.FileCode className="h-4 w-4" />
              Questions
              <Icon.ChevronRight className="ml-auto h-4 w-4 transition-transform group-open:rotate-90" />
            </summary>
            <div className="border-t border-[var(--border)] px-4 py-3">
              <div
                className="mdcontent text-sm leading-relaxed text-[var(--fg)]"
                dangerouslySetInnerHTML={{ __html: marked(submission.assignment.questions) as string }}
              />
            </div>
          </details>
        )}

        {/* Code + preview */}
        <SubmissionViewer
          files={files}
          previewTitle={submission.studentName || "Student"}
          fileScores={fileScores}
          selectedFilename={selectedFile?.filename}
          onSelectFile={setSelectedFilename}
        />

        {/* Review analysis + assessment grid */}
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="flex flex-col gap-6">
            {/* AI review */}
            <Card>
              <CardHeader>
                <div className="flex min-w-0 flex-col gap-1">
                  <CardTitle>
                    <span className="inline-flex items-center gap-2">
                      <Icon.Sparkles className="h-4 w-4 text-[var(--accent)]" />
                      AI review
                    </span>
                  </CardTitle>
                  <span className="font-mono text-[11px] text-[var(--fg-muted)]">{geminiModel}</span>
                </div>
                {typeof geminiScore === "number" && <ScorePill score={geminiScore} max={maxScore} />}
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <p className="text-sm leading-relaxed text-[var(--fg)]">{geminiSummary}</p>

                {typeof averageFileScore === "number" && (
                  <div className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface-muted)]/40 px-3 py-2">
                    <span className="text-xs font-medium">Average file score</span>
                    <ScorePill score={Math.round(averageFileScore)} max={maxScore} />
                  </div>
                )}

                {structure && (
                  <div className="flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)]/40 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold">File-to-question structure</span>
                      <Badge tone="accent">{structure.confidence} confidence</Badge>
                    </div>
                    <div className="text-xs leading-relaxed text-[var(--fg-muted)]">{structure.explanation}</div>
                  </div>
                )}

                {geminiSuggestions.length > 0 && (
                  <ul className="flex flex-col gap-1.5 pl-5 text-sm leading-relaxed text-[var(--fg)]">
                    {geminiSuggestions.map((item) => (
                      <li key={item} className="list-disc">
                        {item}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Question mapping */}
            <Card>
              <CardHeader>
                <CardTitle>Question mapping</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {questionGroups.length > 0 ? (
                  questionGroups.map((group) => (
                    <div
                      key={`${group.label}-${group.files.join(",")}`}
                      className="flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)]/40 p-3"
                    >
                      <strong className="text-sm">{group.label}</strong>
                      <div className="flex flex-wrap gap-1.5">
                        {group.files.map((file) => (
                          <button
                            key={file}
                            type="button"
                            onClick={() => focusFile(file)}
                            className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 font-mono text-[11px] text-[var(--fg)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                          >
                            <Icon.FileCode className="h-3 w-3" />
                            {file}
                          </button>
                        ))}
                      </div>
                      <div className="text-xs leading-relaxed text-[var(--fg-muted)]">{group.reasoning}</div>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-[var(--fg-muted)]">
                    Run AI review to infer how files map to assignment questions.
                  </div>
                )}
              </CardContent>
            </Card>

            {/* File scores */}
            {fileScores.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>File scores</CardTitle>
                  {typeof averageFileScore === "number" && (
                    <Badge tone="accent">Avg {Math.round(averageFileScore)}/{maxScore}</Badge>
                  )}
                </CardHeader>
                <CardContent className="flex flex-col gap-1.5">
                  {fileScores.map((entry) => (
                    <button
                      key={entry.filename}
                      type="button"
                      onClick={() => focusFile(entry.filename)}
                      className={cn(
                        "flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                        selectedFile?.filename === entry.filename
                          ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                          : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-muted)]/60",
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-mono text-xs font-semibold text-[var(--fg)]">{entry.filename}</div>
                        <div className="mt-0.5 truncate text-[11px] text-[var(--fg-muted)]">{entry.summary}</div>
                      </div>
                      <ScorePill score={entry.score} max={entry.maxScore} />
                    </button>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Assessment panel */}
          <aside className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
            <Card>
              <CardHeader>
                <CardTitle>Final assessment</CardTitle>
                {typeof geminiScore === "number" && geminiScore > 0 && (
                  <ScorePill score={geminiScore} max={maxScore} />
                )}
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <Label>
                  Score (0–{maxScore})
                  <div className="flex items-stretch overflow-hidden rounded-lg border border-[var(--border)] focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent)]/20">
                    <Input
                      placeholder="—"
                      value={overrideScore}
                      onChange={(event) => setOverrideScore(event.target.value)}
                      className="border-0 bg-transparent focus:ring-0"
                    />
                    <span className="flex items-center border-l border-[var(--border)] bg-[var(--surface-muted)]/60 px-3 text-xs font-medium text-[var(--fg-muted)]">
                      / {maxScore}
                    </span>
                  </div>
                </Label>

                <Label>
                  Feedback to {firstName}
                  <Textarea
                    placeholder={`Write feedback for ${firstName}...`}
                    value={finalFeedback}
                    onChange={(event) => setFinalFeedback(event.target.value)}
                    rows={6}
                  />
                </Label>

                <div className="flex items-center gap-2">
                  <Button
                    className="flex-1"
                    onClick={applyOverride}
                    disabled={!canRelease}
                    loading={releasing}
                    title={!canRelease ? "Enter a score first" : undefined}
                  >
                    <Icon.Check className="h-3.5 w-3.5" />
                    Release grade
                  </Button>
                  {releaseCount > 0 && <Badge tone="accent">×{releaseCount}</Badge>}
                </div>
                {!canRelease && (
                  <p className="text-center text-[11px] text-[var(--fg-muted)]">
                    Enter a score to release a grade.
                  </p>
                )}

                <div className="border-t border-[var(--border)] pt-4">
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={() => setShowProviderModal(true)}
                    loading={reviewing}
                  >
                    <Icon.Sparkles className="h-3.5 w-3.5" />
                    {reviewing ? "Running AI review..." : "Run AI review"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
      <Modal
        open={showProviderModal}
        onClose={() => setShowProviderModal(false)}
        title="Choose AI model"
        description="Select which model to use for this review."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowProviderModal(false)}>Cancel</Button>
            <Button onClick={() => runReview(selectedProvider)}>
              <Icon.Sparkles className="h-3.5 w-3.5" />
              Run review
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto pr-1">
          {(() => {
            type Option = { key: ProviderKey; label: string; sub: string; isDefault?: boolean; configured: boolean };
            const opts: Option[] = [];
            for (const p of availableProviders) {
              if (p.name === "gemini") {
                opts.push({ key: "gemini", label: "Gemini 2.5 Flash", sub: "Google Â· Reads PDF rubrics natively", isDefault: true, configured: p.configured });
              } else if (p.name === "nvidia") {
                opts.push({ key: "nvidia", label: "Gemma 4 31B", sub: "NVIDIA Build Â· Free tier", configured: p.configured });
              } else if (p.name === "openrouter") {
                for (const m of p.models || []) {
                  opts.push({
                    key: `openrouter:${m.id}` as ProviderKey,
                    label: `${m.label} (OpenRouter)`,
                    sub: m.note || "OpenRouter Â· Free",
                    configured: p.configured,
                  });
                }
              }
            }
            return opts.map((opt) => {
              const isSelected = selectedProvider === opt.key;
              const disabled = !opt.configured;
              return (
                <button
                  key={opt.key}
                  type="button"
                  disabled={disabled}
                  onClick={() => setSelectedProvider(opt.key)}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border px-4 py-3 text-left transition-colors",
                    disabled && "cursor-not-allowed opacity-50",
                    !disabled && isSelected
                      ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                      : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-muted)]/60",
                  )}
                >
                  <div className={cn(
                    "mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center",
                    isSelected ? "border-[var(--accent)]" : "border-[var(--fg-muted)]",
                  )}>
                    {isSelected && <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-[var(--fg)]">{opt.label}</span>
                      {opt.isDefault && (
                        <span className="rounded-full bg-[var(--success-soft)] px-1.5 py-px text-[10px] font-semibold text-[var(--success)]">
                          Default
                        </span>
                      )}
                      {disabled && (
                        <span className="rounded-full bg-[var(--surface-muted)] px-1.5 py-px text-[10px] font-semibold text-[var(--fg-muted)]">
                          Not configured
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-[var(--fg-muted)]">{opt.sub}</span>
                  </div>
                </button>
              );
            });
          })()}
          {availableProviders.length === 0 && (
            <div className="text-xs text-[var(--fg-muted)]">Loading providers…</div>
          )}
        </div>
      </Modal>
    </TeacherShell>
  );
}