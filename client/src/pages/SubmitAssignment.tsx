import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { marked } from "marked";
import StudentShell from "../components/StudentShell";
import { toast } from "../components/Toast";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Icon } from "../components/ui/Icons";
import { Input, Label, Textarea } from "../components/ui/Input";
import { api } from "../api";
import { cn } from "../lib/cn";
import { formatDateTime } from "../lib/format";
import type { Assignment } from "../types";

export default function SubmitAssignment() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [hasOverride, setHasOverride] = useState(false);
  const [alreadySubmitted, setAlreadySubmitted] = useState<{ submittedAt: string } | null>(null);
  const [submissionType, setSubmissionType] = useState<"github" | "file_upload">("github");
  const [githubUrl, setGithubUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!assignmentId) return;
    api<Assignment>(`/assignments/${assignmentId}`)
      .then((data) => {
        setAssignment(data);
        if (!data.allowGithub && data.allowFileUpload) setSubmissionType("file_upload");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load assignment"));

    api<{ assignmentIds: string[] }>("/students/my-overrides")
      .then((r) => setHasOverride(r.assignmentIds.includes(assignmentId!)))
      .catch(() => setHasOverride(false));

    api<Array<{ submission: { id: string; submittedAt: string } }>>(`/submissions?assignment_id=${assignmentId}`)
      .then((rows) => {
        if (rows.length > 0) setAlreadySubmitted({ submittedAt: rows[0].submission.submittedAt });
      })
      .catch(() => {});
  }, [assignmentId]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!assignmentId) return;
    setSubmitting(true);
    setError("");
    try {
      if (submissionType === "github") {
        await api("/submissions", { method: "POST", body: JSON.stringify({ assignmentId, githubUrl, notes }) });
      } else {
        if (!file) throw new Error("Please attach a ZIP file.");
        const formData = new FormData();
        formData.append("assignmentId", assignmentId);
        formData.append("file", file);
        await api("/submissions", { method: "POST", body: formData });
      }
      toast().success("Submission received!");
      navigate("/student/results");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Submission failed";
      setError(msg);
      toast().error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  if (!assignment) {
    return (
      <StudentShell section="dashboard">
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--fg-muted)]">
          Loading assignment...
        </div>
      </StudentShell>
    );
  }

  const now = new Date();
  const isPast = new Date(assignment.closesAt) <= now && !hasOverride;
  const dueDate = formatDateTime(assignment.closesAt);

  const sidebar = (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex items-center justify-between gap-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-[var(--fg-muted)]">
              {isPast ? "Closed" : "Due"}
            </div>
            <div className="mt-1 text-base font-semibold">{dueDate}</div>
          </div>
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-lg",
              isPast ? "bg-[var(--danger-soft)] text-[var(--danger)]" : "bg-[var(--accent-soft)] text-[var(--accent)]",
            )}
          >
            <Icon.Clock className="h-5 w-5" />
          </div>
        </CardContent>
      </Card>

      {assignment.classNotes && (
        <Card>
          <CardHeader>
            <CardTitle>Class notes</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="mdcontent text-sm text-[var(--fg)]"
              dangerouslySetInnerHTML={{ __html: marked(assignment.classNotes) as string }}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Your submission</CardTitle>
        </CardHeader>
        <CardContent>
          {alreadySubmitted ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-[var(--success)]/30 bg-[var(--success-soft)] px-4 py-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--success)]/20 text-[var(--success)]">
                <Icon.Check className="h-6 w-6" />
              </div>
              <div className="text-base font-semibold">Already submitted</div>
              <div className="text-xs text-[var(--fg-muted)]">
                Submitted on {formatDateTime(alreadySubmitted.submittedAt)}
              </div>
            </div>
          ) : isPast ? (
            <div className="flex flex-col gap-2 rounded-lg border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-4 py-5">
              <div className="flex items-center gap-2">
                <Icon.AlertTriangle className="h-4 w-4 text-[var(--danger)]" />
                <strong className="text-sm text-[var(--danger)]">Submission closed</strong>
              </div>
              <div className="text-xs text-[var(--fg-muted)]">
                The deadline was {dueDate}. Contact your teacher if you need an extension.
              </div>
            </div>
          ) : (
            <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
              {assignment.allowGithub && assignment.allowFileUpload && (
                <div className="inline-flex w-full rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-1">
                  <button
                    type="button"
                    onClick={() => setSubmissionType("github")}
                    className={cn(
                      "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                      submissionType === "github"
                        ? "bg-[var(--surface)] text-[var(--fg)] shadow-sm"
                        : "text-[var(--fg-muted)] hover:text-[var(--fg)]",
                    )}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Icon.Github className="h-3.5 w-3.5" />
                      GitHub repo
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSubmissionType("file_upload")}
                    className={cn(
                      "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                      submissionType === "file_upload"
                        ? "bg-[var(--surface)] text-[var(--fg)] shadow-sm"
                        : "text-[var(--fg-muted)] hover:text-[var(--fg)]",
                    )}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Icon.Upload className="h-3.5 w-3.5" />
                      ZIP upload
                    </span>
                  </button>
                </div>
              )}

              {submissionType === "github" ? (
                <Label required>
                  Repository URL
                  <Input
                    placeholder="https://github.com/username/repo"
                    value={githubUrl}
                    required
                    onChange={(e) => setGithubUrl(e.target.value)}
                  />
                </Label>
              ) : (
                <Label required>
                  ZIP file
                  <Input accept=".zip" onChange={(e) => setFile(e.target.files?.[0] || null)} type="file" />
                  {file && (
                    <div className="mt-1 inline-flex items-center gap-1.5">
                      <Badge tone="accent">{file.name}</Badge>
                      <span className="text-[11px] text-[var(--fg-muted)]">{(file.size / 1024).toFixed(1)} KB</span>
                    </div>
                  )}
                </Label>
              )}

              <Label>
                Notes <span className="font-normal text-[var(--fg-muted)]">(optional)</span>
                <Textarea
                  placeholder="Any specific areas you'd like feedback on?"
                  rows={4}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </Label>

              {error && (
                <div className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger)]">
                  {error}
                </div>
              )}

              <Button type="submit" loading={submitting}>
                Submit for review
                <Icon.ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );

  return (
    <StudentShell section="dashboard">
      {assignment.sourceMarkdown ? (
        <div className="flex h-[calc(100svh-56px-3rem)] gap-6 overflow-hidden">
          {/* Markdown pane — scrolls independently */}
          <div className="flex min-w-0 flex-1 flex-col gap-5 overflow-y-auto pr-2">
            <div className="flex flex-col gap-1">
              <div className="text-xs font-medium uppercase tracking-wider text-[var(--fg-muted)]">Assignment</div>
              <h1 className="text-3xl font-semibold leading-tight tracking-tight">{assignment.title}</h1>
              {assignment.description && (
                <p className="text-sm leading-relaxed text-[var(--fg-muted)]">{assignment.description}</p>
              )}
            </div>
            {assignment.sourceUrl && (
              <a
                href={assignment.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-fit items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--fg)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                <Icon.External className="h-3.5 w-3.5" />
                Open assignment brief
              </a>
            )}
            <div
              className="mdcontent"
              dangerouslySetInnerHTML={{ __html: marked(assignment.sourceMarkdown) as string }}
            />
          </div>

          {/* Sticky sidebar */}
          <div className="w-80 shrink-0 overflow-y-auto">
            {sidebar}
          </div>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_360px] items-start">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <div className="text-xs font-medium uppercase tracking-wider text-[var(--fg-muted)]">Assignment</div>
              <h1 className="text-3xl font-semibold leading-tight tracking-tight">{assignment.title}</h1>
              {assignment.description && (
                <p className="text-sm leading-relaxed text-[var(--fg-muted)]">{assignment.description}</p>
              )}
            </div>
            {assignment.sourceUrl && (
              <a
                href={assignment.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-fit items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--fg)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                <Icon.External className="h-3.5 w-3.5" />
                Open assignment brief
              </a>
            )}
          </div>
          <div className="lg:sticky lg:top-6">
            {sidebar}
          </div>
        </div>
      )}
    </StudentShell>
  );
}
