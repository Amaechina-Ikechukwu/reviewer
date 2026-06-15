import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import TeacherShell from "../components/TeacherShell";
import { toast } from "../components/Toast";
import { Button } from "../components/ui/Button";
import { Card, CardContent } from "../components/ui/Card";
import { Icon } from "../components/ui/Icons";
import { Input, Label, Select, Textarea } from "../components/ui/Input";
import { PageHeader } from "../components/ui/PageHeader";
import { api, listCohorts } from "../api";
import { cn } from "../lib/cn";
import type { Assignment, Cohort } from "../types";

type SourceMode = "markdown" | "notion" | "pdf";

function toDatetimeLocal(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function EditAssignment() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [title, setTitle] = useState("");
  const [sourceMode, setSourceMode] = useState<SourceMode>("markdown");
  const [sourceMarkdown, setSourceMarkdown] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourcePdfPath, setSourcePdfPath] = useState<string | null>(null);
  const [pdfFileName, setPdfFileName] = useState<string | null>(null);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [closesAt, setClosesAt] = useState("");
  const [allowGithub, setAllowGithub] = useState(true);
  const [allowFileUpload, setAllowFileUpload] = useState(true);
  const [maxScore, setMaxScore] = useState(100);
  const [classNotes, setClassNotes] = useState("");
  const [questions, setQuestions] = useState("");
  const [cohortId, setCohortId] = useState("");
  const [cohorts, setCohorts] = useState<(Cohort & { studentCount: number })[]>([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
        api<Assignment>(`/assignments/${id}`)
          .then((a) => {
            setTitle(a.title);
            setSourceMode(a.sourceType === "notion" ? "notion" : a.sourceType === "pdf" ? "pdf" : "markdown");
            setSourceMarkdown(a.sourceMarkdown ?? "");
            setSourceUrl(a.sourceUrl ?? "");
            if (a.sourceType === "pdf" && a.sourcePdfPath) {
              setSourcePdfPath(a.sourcePdfPath);
              setPdfFileName("existing-brief.pdf");
            }
            setClosesAt(toDatetimeLocal(a.closesAt));
            setAllowGithub(a.allowGithub);
            setAllowFileUpload(a.allowFileUpload);
            setMaxScore(a.maxScore);
            setClassNotes(a.classNotes ?? "");
            setCohortId(a.cohortId ?? "");
          })
      .catch((err) => {
        setLoadError(err instanceof Error ? err.message : "Failed to load assignment");
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    listCohorts().then(setCohorts).catch(() => {});
  }, []);

  async function handleMarkdownFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setSourceMarkdown(await file.text());
  }

  async function handleClassNotesFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setClassNotes(await file.text());
    event.target.value = "";
  }

  async function handlePdfBrief(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadingPdf(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api<{ briefId: string }>("/assignments/upload-brief", { method: "POST", body: fd });
      setSourcePdfPath(res.briefId);
      setPdfFileName(file.name);
    } catch (err) {
      toast().error(err instanceof Error ? err.message : "PDF upload failed.");
    } finally {
      setUploadingPdf(false);
      event.target.value = "";
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");

    if (sourceMode === "pdf" && !sourcePdfPath) {
      const msg = "Please upload a PDF brief before saving.";
      setError(msg);
      toast().error(msg);
      return;
    }
    if (sourceMode === "markdown" && !sourceMarkdown.trim()) {
      const msg = "Please upload or paste the assignment markdown.";
      setError(msg);
      toast().error(msg);
      return;
    }
    if (sourceMode === "notion" && !sourceUrl.trim()) {
      const msg = "Please paste the Notion page URL.";
      setError(msg);
      toast().error(msg);
      return;
    }

    setSubmitting(true);

    try {
      await api<Assignment>(`/assignments/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title,
          maxScore,
          sourceType: sourceMode,
          sourceMarkdown: sourceMode === "markdown" ? sourceMarkdown : null,
          sourceUrl: sourceMode === "notion" ? sourceUrl : null,
          sourcePdfPath: sourceMode === "pdf" ? sourcePdfPath : null,
          closesAt: new Date(closesAt).toISOString(),
          allowGithub,
          allowFileUpload,
          classNotes: classNotes || null,
          cohortId: cohortId || null,
        }),
      });

      toast().success("Assignment updated");
      navigate("/teacher");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update assignment";
      setError(msg);
      toast().error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <TeacherShell section="assignments">
        <div className="flex items-center justify-center py-20 text-sm text-[var(--fg-muted)]">Loading...</div>
      </TeacherShell>
    );
  }

  if (loadError) {
    return (
      <TeacherShell section="assignments">
        <div className="flex items-center justify-center py-20 text-sm text-[var(--danger)]">{loadError}</div>
      </TeacherShell>
    );
  }

  return (
    <TeacherShell section="assignments">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Link
            to="/teacher"
            className="inline-flex w-fit items-center gap-1 text-xs font-medium text-[var(--fg-muted)] hover:text-[var(--accent)]"
          >
            <Icon.ChevronLeft className="h-3 w-3" />
            Dashboard
          </Link>
          <PageHeader title="Edit assignment" description="Update the assignment details below." />
        </div>

        <Card>
          <CardContent>
            <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
              <Label required>
                Assignment name
                <Input
                  placeholder="e.g. JavaScript & HTML Events"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </Label>

              <div className="flex flex-col gap-3">
                <div className="text-sm font-medium">Assignment source</div>
                <div className="inline-flex w-fit rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-1">
                  {(["markdown", "notion", "pdf"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setSourceMode(mode)}
                      className={cn(
                        "rounded-md px-4 py-1.5 text-xs font-medium transition-colors",
                        sourceMode === mode
                          ? "bg-[var(--surface)] text-[var(--fg)] shadow-sm"
                          : "text-[var(--fg-muted)] hover:text-[var(--fg)]",
                      )}
                    >
                      {mode === "markdown" ? "Markdown file" : mode === "notion" ? "Notion link" : "PDF"}
                    </button>
                  ))}
                </div>

                {sourceMode === "markdown" && (
                  <div className="flex flex-col gap-2">
                    <Label>
                      Upload .md file
                      <Input accept=".md,.markdown,.txt" type="file" onChange={handleMarkdownFile} />
                    </Label>
                    {sourceMarkdown && (
                      <div className="text-xs text-[var(--fg-muted)]">
                        {sourceMarkdown.split("\n").length} lines loaded
                      </div>
                    )}
                  </div>
                )}

                {sourceMode === "notion" && (
                  <Label>
                    Notion page URL
                    <Input
                      placeholder="https://www.notion.so/..."
                      type="url"
                      value={sourceUrl}
                      onChange={(e) => setSourceUrl(e.target.value)}
                    />
                  </Label>
                )}

                {sourceMode === "pdf" && (
                  <div className="flex flex-col gap-2">
                    <Label>
                      Upload PDF brief
                      <Input accept=".pdf" type="file" disabled={uploadingPdf} onChange={handlePdfBrief} />
                    </Label>
                    {uploadingPdf && (
                      <div className="text-xs text-[var(--fg-muted)]">Uploading…</div>
                    )}
                    {pdfFileName && !uploadingPdf && (
                      <div className="inline-flex items-center gap-1.5 text-xs text-[var(--fg-muted)]">
                        <Icon.Check className="h-3 w-3 text-[var(--success)]" />
                        {pdfFileName}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <Label required>
                Submission deadline
                <Input
                  required
                  type="datetime-local"
                  value={closesAt}
                  onChange={(e) => setClosesAt(e.target.value)}
                />
              </Label>

              <div className="flex flex-col gap-3">
                <div className="text-sm font-medium">Submission type</div>
                <div className="flex flex-wrap gap-2">
                  <label
                    className={cn(
                      "inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                      allowGithub
                        ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--fg)]"
                        : "border-[var(--border)] bg-[var(--surface)] text-[var(--fg-muted)] hover:border-[var(--border-strong)]",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={allowGithub}
                      onChange={(e) => setAllowGithub(e.target.checked)}
                      className="h-4 w-4 accent-[var(--accent)]"
                    />
                    <Icon.Github className="h-4 w-4" />
                    GitHub repo
                  </label>
                  <label
                    className={cn(
                      "inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                      allowFileUpload
                        ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--fg)]"
                        : "border-[var(--border)] bg-[var(--surface)] text-[var(--fg-muted)] hover:border-[var(--border-strong)]",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={allowFileUpload}
                      onChange={(e) => setAllowFileUpload(e.target.checked)}
                      className="h-4 w-4 accent-[var(--accent)]"
                    />
                    <Icon.Upload className="h-4 w-4" />
                    ZIP / PDF upload
                  </label>
                </div>
              </div>

              <Label>
                Max score
                <Input
                  min={1}
                  type="number"
                  value={maxScore}
                  onChange={(e) => setMaxScore(Number(e.target.value))}
                  className="max-w-[140px]"
                />
              </Label>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    Class notes <span className="font-normal text-[var(--fg-muted)]">(optional — shown to students when submitting)</span>
                  </span>
                  <label className="cursor-pointer text-xs text-[var(--accent)] hover:underline">
                    Upload .md file
                    <input accept=".md,.markdown,.txt" type="file" className="sr-only" onChange={handleClassNotesFile} />
                  </label>
                </div>
                <Textarea
                  placeholder="Paste any notes, instructions, or resources students should read before submitting..."
                  rows={5}
                  value={classNotes}
                  onChange={(e) => setClassNotes(e.target.value)}
                />
                {classNotes && (
                  <div className="text-xs text-[var(--fg-muted)]">{classNotes.split("\n").length} lines · renders as markdown for students</div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">Cohort <span className="font-normal text-[var(--fg-muted)]">(optional)</span></span>
                <Select
                  value={cohortId}
                  onChange={(e) => setCohortId(e.target.value)}
                >
                  <option value="">No specific cohort</option>
                  {cohorts.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.studentCount} student{c.studentCount === 1 ? "" : "s"})</option>
                  ))}
                </Select>
              </div>

              {error && (
                <div className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger)]">
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => navigate("/teacher")}>
                  Cancel
                </Button>
                <Button type="submit" loading={submitting}>
                  Save changes
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </TeacherShell>
  );
}
