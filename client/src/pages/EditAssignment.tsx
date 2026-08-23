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
import type { Assignment, Cohort, Track } from "../types";
import { CODE_TRACKS, TRACKS } from "../types";

type SourceMode = "manual" | "markdown" | "notion" | "pdf" | "docx" | "link";

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
  const [sourceDocxPath, setSourceDocxPath] = useState<string | null>(null);
  const [pdfFileName, setPdfFileName] = useState<string | null>(null);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [closesAt, setClosesAt] = useState("");
  const [allowGithub, setAllowGithub] = useState(true);
  const [allowFileUpload, setAllowFileUpload] = useState(true);
  const [maxScore, setMaxScore] = useState(100);
  const [classNotesType, setClassNotesType] = useState<"markdown" | "pdf" | "docx" | "link">("markdown");
  const [classNotes, setClassNotes] = useState("");
  const [classNotesUrl, setClassNotesUrl] = useState("");
  const [classNotesPdfPath, setClassNotesPdfPath] = useState<string | null>(null);
  const [classNotesDocxPath, setClassNotesDocxPath] = useState<string | null>(null);
  const [classNotesFileName, setClassNotesFileName] = useState<string | null>(null);
  const [uploadingClassNotes, setUploadingClassNotes] = useState(false);
  const [questions, setQuestions] = useState("");
  const [track, setTrack] = useState<Track | "">("");
  const isCodeTrack = !track || CODE_TRACKS.includes(track as Track);
  const [cohortId, setCohortId] = useState("");
  const [cohorts, setCohorts] = useState<(Cohort & { studentCount: number })[]>([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
        api<Assignment>(`/assignments/${id}`)
          .then((a) => {
            setTitle(a.title);
            setSourceMode(
              a.sourceType === "markdown" || a.sourceType === "notion" || a.sourceType === "pdf" ||
              a.sourceType === "docx" || a.sourceType === "link" || a.sourceType === "manual"
                ? a.sourceType
                : "manual",
            );
            setSourceMarkdown(a.sourceMarkdown ?? "");
            setSourceUrl(a.sourceUrl ?? "");
            if (a.sourceType === "pdf" && a.sourcePdfPath) {
              setSourcePdfPath(a.sourcePdfPath);
              setPdfFileName("existing-brief.pdf");
            }
            if (a.sourceType === "docx" && a.sourceDocxPath) {
              setSourceDocxPath(a.sourceDocxPath);
              setPdfFileName("existing-brief.docx");
            }
            setClosesAt(toDatetimeLocal(a.closesAt));
            setAllowGithub(a.allowGithub);
            setAllowFileUpload(a.allowFileUpload);
            setMaxScore(a.maxScore);
            setClassNotesType(a.classNotesType || "markdown");
            setClassNotes(a.classNotes ?? "");
            setClassNotesUrl(a.classNotesUrl ?? "");
            if (a.classNotesType === "pdf" && a.classNotesPdfPath) {
              setClassNotesPdfPath(a.classNotesPdfPath);
              setClassNotesFileName("existing-notes.pdf");
            } else if (a.classNotesType === "docx" && a.classNotesDocxPath) {
              setClassNotesDocxPath(a.classNotesDocxPath);
              setClassNotesFileName("existing-notes.docx");
            }
            setTrack(a.track ?? "");
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

  async function handleClassNotesAsset(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadingClassNotes(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api<{ briefId: string, ext?: string }>("/assignments/upload-brief", { method: "POST", body: fd });
      if (res.ext === "docx") {
        setClassNotesDocxPath(res.briefId);
        setClassNotesPdfPath(null);
      } else {
        setClassNotesPdfPath(res.briefId);
        setClassNotesDocxPath(null);
      }
      setClassNotesFileName(file.name);
    } catch (err) {
      toast().error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploadingClassNotes(false);
      event.target.value = "";
    }
  }

  async function handleBriefAsset(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadingPdf(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api<{ briefId: string; ext?: string }>("/assignments/upload-brief", { method: "POST", body: fd });
      if (res.ext === "docx") {
        setSourceDocxPath(res.briefId);
        setSourcePdfPath(null);
      } else {
        setSourcePdfPath(res.briefId);
        setSourceDocxPath(null);
      }
      setPdfFileName(file.name);
    } catch (err) {
      toast().error(err instanceof Error ? err.message : "Brief upload failed.");
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
    if (sourceMode === "docx" && !sourceDocxPath) {
      const msg = "Please upload a DOCX brief before saving.";
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

    if (sourceMode === "link" && !sourceUrl.trim()) {
      const msg = "Please provide a URL for the project brief.";
      setError(msg);
      toast().error(msg);
      return;
    }
    if (classNotesType === "pdf" && !classNotesPdfPath) {
      const msg = "Please upload a PDF for class notes.";
      setError(msg);
      toast().error(msg);
      return;
    }
    if (classNotesType === "docx" && !classNotesDocxPath) {
      const msg = "Please upload a DOCX for class notes.";
      setError(msg);
      toast().error(msg);
      return;
    }
    if (classNotesType === "link" && !classNotesUrl.trim()) {
      const msg = "Please provide a URL for class notes.";
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
          sourceUrl: sourceMode === "notion" || sourceMode === "link" ? sourceUrl : null,
          sourcePdfPath: sourceMode === "pdf" ? sourcePdfPath : null,
          sourceDocxPath: sourceMode === "docx" ? sourceDocxPath : null,
          closesAt: new Date(closesAt).toISOString(),
          allowGithub: isCodeTrack ? allowGithub : false,
          allowFileUpload,
          classNotesType,
          classNotes: classNotesType === "markdown" ? (classNotes || null) : null,
          classNotesUrl: classNotesType === "link" ? classNotesUrl : null,
          classNotesPdfPath: classNotesType === "pdf" ? classNotesPdfPath : null,
          classNotesDocxPath: classNotesType === "docx" ? classNotesDocxPath : null,
          track: track || null,
          cohortId: cohortId || null,
        }),
      });

      toast().success("Assignment updated");
      navigate("/teacher/assignments");
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
                  {(["manual", "markdown", "notion", "link", "pdf", "docx"] as const).map((mode) => (
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
                      {mode === "manual" ? "No brief" : mode === "markdown" ? "Markdown" : mode === "notion" ? "Notion" : mode === "link" ? "Link" : mode.toUpperCase()}
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

                {sourceMode === "manual" && (
                  <p className="text-xs text-[var(--fg-muted)]">This project has no assignment-wide brief. Team-specific briefs can be edited from Manage project, then Re-shuffle & edit teams.</p>
                )}

                {(sourceMode === "notion" || sourceMode === "link") && (
                  <Label>
                    {sourceMode === "notion" ? "Notion page URL" : "Brief URL"}
                    <Input
                      placeholder="https://www.notion.so/..."
                      type="url"
                      value={sourceUrl}
                      onChange={(e) => setSourceUrl(e.target.value)}
                    />
                  </Label>
                )}

                {(sourceMode === "pdf" || sourceMode === "docx") && (
                  <div className="flex flex-col gap-2">
                    <Label>
                      Replace {sourceMode.toUpperCase()} brief
                      <Input accept={sourceMode === "pdf" ? ".pdf" : ".docx"} type="file" disabled={uploadingPdf} onChange={handleBriefAsset} />
                    </Label>
                    {uploadingPdf && (
                      <div className="text-xs text-[var(--fg-muted)]">Uploading…</div>
                    )}
                    {pdfFileName && !uploadingPdf && (
                      <div className="inline-flex items-center gap-1.5 text-xs text-[var(--fg-muted)]">
                        <Icon.Check className="h-3 w-3 text-[var(--success)]" />
                        {pdfFileName} ready
                      </div>
                    )}
                    {pdfFileName?.startsWith("existing-") && !uploadingPdf && id && (
                      <a href={`/v2/api/assignments/${id}/brief`} target="_blank" rel="noreferrer" className="w-fit text-xs font-medium text-[var(--accent)] hover:underline">
                        View current brief
                      </a>
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

              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">Track <span className="font-normal text-[var(--fg-muted)]">(optional)</span></span>
                <Select
                  value={track}
                  onChange={(e) => {
                    const v = e.target.value as Track | "";
                    setTrack(v);
                    if (v && !CODE_TRACKS.includes(v as Track)) setAllowGithub(false);
                    else setAllowGithub(true);
                  }}
                >
                  <option value="">No specific track</option>
                  {TRACKS.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </Select>
                {track && !CODE_TRACKS.includes(track as Track) && (
                  <p className="text-xs text-[var(--fg-muted)]">GitHub submissions are not available for this track.</p>
                )}
              </div>

              <div className="flex flex-col gap-3">
                <div className="text-sm font-medium">Submission type</div>
                <div className="flex flex-wrap gap-2">
                  {isCodeTrack && (
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
                  )}
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

              <div className="flex flex-col gap-3">
                <span className="text-sm font-medium">
                  Class notes <span className="font-normal text-[var(--fg-muted)]">(optional — shown to students when submitting)</span>
                </span>
                
                <div className="inline-flex w-fit rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-1">
                  {(["markdown", "pdf", "docx", "link"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setClassNotesType(mode)}
                      className={cn(
                        "rounded-md px-4 py-1.5 text-xs font-medium transition-colors",
                        classNotesType === mode
                          ? "bg-[var(--surface)] text-[var(--fg)] shadow-sm"
                          : "text-[var(--fg-muted)] hover:text-[var(--fg)]",
                      )}
                    >
                      {mode === "markdown" ? "Markdown" : mode === "pdf" ? "PDF" : mode === "docx" ? "DOCX" : "Drive link"}
                    </button>
                  ))}
                </div>

                {classNotesType === "markdown" && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-end">
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
                )}

                {classNotesType === "link" && (
                  <Label>
                    Drive link URL
                    <Input
                      placeholder="https://..."
                      type="url"
                      value={classNotesUrl}
                      onChange={(e) => setClassNotesUrl(e.target.value)}
                    />
                  </Label>
                )}

                {(classNotesType === "pdf" || classNotesType === "docx") && (
                  <div className="flex flex-col gap-2">
                    <Label>
                      Upload {classNotesType.toUpperCase()} file
                      <Input
                        accept={classNotesType === "pdf" ? ".pdf" : ".docx"}
                        type="file"
                        disabled={uploadingClassNotes}
                        onChange={handleClassNotesAsset}
                      />
                    </Label>
                    {uploadingClassNotes && (
                      <div className="text-xs text-[var(--fg-muted)]">Uploading…</div>
                    )}
                    {classNotesFileName && !uploadingClassNotes && (
                      <div className="inline-flex items-center gap-1.5 text-xs text-[var(--fg-muted)]">
                        <Icon.Check className="h-3 w-3 text-[var(--success)]" />
                        {classNotesFileName} uploaded
                      </div>
                    )}
                  </div>
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
                <Button type="button" variant="ghost" onClick={() => navigate("/teacher/assignments")}>
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
