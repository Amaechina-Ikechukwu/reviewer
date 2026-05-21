import { useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import TeacherShell from "../components/TeacherShell";
import { toast } from "../components/Toast";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent } from "../components/ui/Card";
import { Icon } from "../components/ui/Icons";
import { Input, Label, Select, Textarea } from "../components/ui/Input";
import { PageHeader } from "../components/ui/PageHeader";
import { api } from "../api";
import { cn } from "../lib/cn";
import type { Assignment, Track } from "../types";
import { CODE_TRACKS, TRACKS } from "../types";

type SourceMode = "markdown" | "notion" | "pdf";

export default function CreateAssignment() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [sourceMode, setSourceMode] = useState<SourceMode>("markdown");
  const [sourceMarkdown, setSourceMarkdown] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourcePdfPath, setSourcePdfPath] = useState<string | null>(null);
  const [pdfFileName, setPdfFileName] = useState<string | null>(null);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [closesAt, setClosesAt] = useState("");
  const [track, setTrack] = useState<Track | "">("");
  const [allowGithub, setAllowGithub] = useState(true);
  const [allowFileUpload, setAllowFileUpload] = useState(true);
  const isCodeTrack = !track || CODE_TRACKS.includes(track as Track);
  const [maxScore, setMaxScore] = useState(100);
  const [classNotes, setClassNotes] = useState("");
  const [isGroupAssignment, setIsGroupAssignment] = useState(false);
  const [groupCount, setGroupCount] = useState(3);
  const [groupQuestionMode, setGroupQuestionMode] = useState<"same" | "per_group">("same");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<Assignment | null>(null);
  const [copied, setCopied] = useState(false);

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
      const msg = "Please upload a PDF brief before creating the assignment.";
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
      const assignment = await api<Assignment>("/assignments", {
        method: "POST",
        body: JSON.stringify({
          title,
          description: "",
          rubric: "",
          maxScore,
          sourceType: sourceMode,
          sourceMarkdown: sourceMode === "markdown" ? sourceMarkdown : null,
          sourceUrl: sourceMode === "notion" ? sourceUrl : null,
          sourcePdfPath: sourceMode === "pdf" ? sourcePdfPath : null,
          opensAt: new Date().toISOString(),
          closesAt: new Date(closesAt).toISOString(),
          allowGithub: isCodeTrack ? allowGithub : false,
          allowFileUpload,
          defaultProvider: "gemini",
          classNotes: classNotes || null,
          isGroupAssignment,
          groupCount: isGroupAssignment ? groupCount : 0,
          groupQuestionMode: isGroupAssignment ? groupQuestionMode : "same",
          track: track || null,
        }),
      });

      setCreated(assignment);
      toast().success("Assignment created");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create assignment";
      setError(msg);
      toast().error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  function copyLink() {
    if (!created) return;
    navigator.clipboard.writeText(`${window.location.origin}/student/submit/${created.id}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function resetForm() {
    setCreated(null);
    setTitle("");
    setTrack("");
    setSourceMarkdown("");
    setSourceUrl("");
    setSourcePdfPath(null);
    setPdfFileName(null);
    setClosesAt("");
    setClassNotes("");
    setAllowGithub(true);
  }

  if (created) {
    const link = `${window.location.origin}/student/submit/${created.id}`;
    return (
      <TeacherShell section="assignments">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
          <PageHeader
            title="Assignment created"
            description="Share this link with your students to collect submissions."
          />
          <Card>
            <CardContent className="flex flex-col gap-5">
              <div className="flex flex-col gap-1">
                <Badge tone="success" dot>Live</Badge>
                <h2 className="mt-2 text-xl font-semibold tracking-tight">{created.title}</h2>
                <div className="text-xs text-[var(--fg-muted)]">
                  Due {new Date(created.closesAt).toLocaleString()}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <div className="text-xs font-medium uppercase tracking-wider text-[var(--fg-muted)]">
                  Student submission link
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)]/60 p-2 pl-3">
                  <span className="flex-1 truncate font-mono text-xs text-[var(--fg)]">{link}</span>
                  <Button variant="secondary" size="sm" onClick={copyLink}>
                    <Icon.Copy className="h-3.5 w-3.5" />
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={() => navigate("/teacher")}>Back to dashboard</Button>
                {created.isGroupAssignment && (
                  <Button variant="secondary" onClick={() => navigate(`/teacher/assignments/${created.id}/groups`)}>
                    <Icon.Users className="h-3.5 w-3.5" />
                    Manage teams
                  </Button>
                )}
                <Button variant="ghost" onClick={resetForm}>
                  <Icon.Plus className="h-3.5 w-3.5" />
                  New assignment
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
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
          <PageHeader title="New assignment" description="Create an assignment and share the link with your class." />
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
                      <Input
                        accept=".pdf"
                        type="file"
                        disabled={uploadingPdf}
                        onChange={handlePdfBrief}
                      />
                    </Label>
                    {uploadingPdf && (
                      <div className="text-xs text-[var(--fg-muted)]">Uploading…</div>
                    )}
                    {pdfFileName && !uploadingPdf && (
                      <div className="inline-flex items-center gap-1.5 text-xs text-[var(--fg-muted)]">
                        <Icon.Check className="h-3 w-3 text-[var(--success)]" />
                        {pdfFileName} uploaded
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

              <div className="flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)]/40 p-3">
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={isGroupAssignment}
                    onChange={(e) => setIsGroupAssignment(e.target.checked)}
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                  Group project
                </label>
                {isGroupAssignment && (
                  <div className="flex flex-col gap-3">
                    <Label>
                      Number of groups
                      <Input
                        min={1}
                        max={50}
                        type="number"
                        value={groupCount}
                        onChange={(e) => setGroupCount(Math.max(1, Number(e.target.value) || 1))}
                        className="max-w-[140px]"
                      />
                    </Label>

                    <div className="flex flex-col gap-2">
                      <span className="text-sm font-medium">Questions per team</span>
                      <div className="inline-flex w-fit rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-1">
                        {(["same", "per_group"] as const).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => setGroupQuestionMode(mode)}
                            className={cn(
                              "rounded-md px-4 py-1.5 text-xs font-medium transition-colors",
                              groupQuestionMode === mode
                                ? "bg-[var(--surface)] text-[var(--fg)] shadow-sm"
                                : "text-[var(--fg-muted)] hover:text-[var(--fg)]",
                            )}
                          >
                            {mode === "same" ? "Same for all teams" : "Different per team"}
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-[var(--fg-muted)]">
                        {groupQuestionMode === "same"
                          ? "All teams answer the same questions and are graded on the same rubric."
                          : "Each team gets its own description and rubric. Set them on the team management page after creating the assignment."}
                      </p>
                    </div>

                    <p className="text-xs text-[var(--fg-muted)]">
                      Students will be auto-distributed across {groupCount} group{groupCount === 1 ? "" : "s"} and emailed about their team. You can drag-and-drop members afterwards. Every member of a group gets the same score.
                    </p>
                  </div>
                )}
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

              {error && (
                <div className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger)]">
                  {error}
                </div>
              )}

              <div className="flex justify-end">
                <Button type="submit" loading={submitting}>
                  <Icon.Sparkles className="h-3.5 w-3.5" />
                  Create & get link
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </TeacherShell>
  );
}
