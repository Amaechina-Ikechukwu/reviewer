import { useEffect, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import TeacherShell from "../components/TeacherShell";
import { toast } from "../components/Toast";
import { Button } from "../components/ui/Button";
import { Card, CardContent } from "../components/ui/Card";
import { Icon } from "../components/ui/Icons";
import { Input, Label, Select, Textarea } from "../components/ui/Input";
import { PageHeader } from "../components/ui/PageHeader";
import { api, listCohorts } from "../api";
import { cn } from "../lib/cn";
import type { Assignment, Cohort, StudentRecord, Track } from "../types";
import { CODE_TRACKS, TRACKS } from "../types";

type GroupSourceType = "markdown" | "link" | "pdf";

type TeamDraft = {
  name: string;
  sourceType: GroupSourceType;
  content: string;
  sourceUrl: string;
  sourcePdfPath: string | null;
  pdfFileName: string | null;
  uploadingPdf: boolean;
};

function makeTeam(n: number): TeamDraft {
  return { name: `Team ${n}`, sourceType: "markdown", content: "", sourceUrl: "", sourcePdfPath: null, pdfFileName: null, uploadingPdf: false };
}

export default function CreateGroupProject() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [closesAt, setClosesAt] = useState("");
  const [track, setTrack] = useState<Track | "">("");
  const [allowGithub, setAllowGithub] = useState(true);
  const [allowFileUpload, setAllowFileUpload] = useState(true);
  const [maxScore, setMaxScore] = useState(100);
  const [classNotes, setClassNotes] = useState("");
  const [groupCount, setGroupCount] = useState(3);
  const [teams, setTeams] = useState<TeamDraft[]>(() => [makeTeam(1), makeTeam(2), makeTeam(3)]);
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [studentsByTeam, setStudentsByTeam] = useState<string[][]>(() => [[], [], []]);
  const [dragStudent, setDragStudent] = useState<{ studentId: string; fromTeam: number } | null>(null);
  const [hoverTeam, setHoverTeam] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [cohorts, setCohorts] = useState<(Cohort & { studentCount: number })[]>([]);
  const [cohortId, setCohortId] = useState("");

  const isCodeTrack = !track || CODE_TRACKS.includes(track as Track);
  const studentById = new Map(students.map((s) => [s.id, s] as const));

  useEffect(() => {
    api<StudentRecord[]>("/students").then(setStudents).catch(() => {});
  }, []);

  useEffect(() => {
    listCohorts().then(setCohorts).catch(() => {});
  }, []);

  // Re-distribute whenever the roster or team count changes, preserving existing manual placements.
  useEffect(() => {
    setStudentsByTeam((prev) => {
      const buckets: string[][] = Array.from({ length: groupCount }, (_, i) => (prev[i] || []).slice());
      const placed = new Set<string>(buckets.flat());
      const roster = students.map((s) => s.id);
      // Drop ids no longer in roster
      for (let i = 0; i < buckets.length; i++) {
        buckets[i] = buckets[i].filter((id) => roster.includes(id));
      }
      // Round-robin any new/unplaced students
      const unplaced = roster.filter((id) => !placed.has(id));
      unplaced.forEach((id, i) => buckets[i % groupCount].push(id));
      return buckets;
    });
  }, [students, groupCount]);

  // Sync teams array length when groupCount changes
  function handleGroupCountChange(n: number) {
    const next = Math.max(1, Math.min(50, n));
    setGroupCount(next);
    setTeams((prev) => {
      if (next > prev.length) {
        return [...prev, ...Array.from({ length: next - prev.length }, (_, i) => makeTeam(prev.length + i + 1))];
      }
      return prev.slice(0, next);
    });
  }

  function onDragStart(studentId: string, fromTeam: number) {
    setDragStudent({ studentId, fromTeam });
  }

  function onDragOver(e: DragEvent, teamIdx: number) {
    e.preventDefault();
    setHoverTeam(teamIdx);
  }

  function onDrop(e: DragEvent, toTeam: number) {
    e.preventDefault();
    setHoverTeam(null);
    if (!dragStudent) return;
    const { studentId, fromTeam } = dragStudent;
    setDragStudent(null);
    if (fromTeam === toTeam) return;
    setStudentsByTeam((prev) =>
      prev.map((bucket, i) => {
        if (i === fromTeam) return bucket.filter((id) => id !== studentId);
        if (i === toTeam) return bucket.includes(studentId) ? bucket : [...bucket, studentId];
        return bucket;
      }),
    );
  }

  function updateTeam(idx: number, patch: Partial<TeamDraft>) {
    setTeams((prev) => prev.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  }

  async function handlePdfUpload(idx: number, e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    updateTeam(idx, { uploadingPdf: true });
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api<{ briefId: string }>("/assignments/upload-brief", { method: "POST", body: fd });
      updateTeam(idx, { sourcePdfPath: res.briefId, pdfFileName: file.name, uploadingPdf: false });
    } catch (err) {
      toast().error(err instanceof Error ? err.message : "PDF upload failed.");
      updateTeam(idx, { uploadingPdf: false });
    } finally {
      e.target.value = "";
    }
  }

  async function handleClassNotesFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setClassNotes(await file.text());
    e.target.value = "";
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const assignment = await api<Assignment>("/assignments", {
        method: "POST",
        body: JSON.stringify({
          title,
          description: "",
          rubric: "",
          maxScore,
          sourceType: "markdown",
          sourceMarkdown: null,
          sourceUrl: null,
          sourcePdfPath: null,
          opensAt: new Date().toISOString(),
          closesAt: new Date(closesAt).toISOString(),
          allowGithub: isCodeTrack ? allowGithub : false,
          allowFileUpload,
          defaultProvider: "gemini",
          classNotes: classNotes || null,
          isGroupAssignment: true,
          groupCount,
          groupQuestionMode: "per_group",
          track: track || null,
          cohortId: cohortId || null,
          groupDrafts: teams.map((t, i) => ({
            name: t.name,
            memberIds: studentsByTeam[i] ?? [],
            sourceType: t.sourceType,
            description: t.sourceType === "markdown" ? t.content : null,
            sourceUrl: t.sourceType === "link" ? t.sourceUrl : null,
            sourcePdfPath: t.sourceType === "pdf" ? t.sourcePdfPath : null,
          })),
        }),
      });
      toast().success("Group project created");
      navigate("/teacher/group-projects");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create group project";
      setError(msg);
      toast().error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <TeacherShell section="groupProjects">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Link
            to="/teacher/group-projects"
            className="inline-flex w-fit items-center gap-1 text-xs font-medium text-[var(--fg-muted)] hover:text-[var(--accent)]"
          >
            <Icon.ChevronLeft className="h-3 w-3" />
            Group projects
          </Link>
          <PageHeader
            title="New group project"
            description="Each team gets its own brief. Students are distributed evenly and can be re-arranged after creation."
          />
        </div>

        <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
          {/* Basic details */}
          <Card>
            <CardContent className="flex flex-col gap-5">
              <div className="text-sm font-semibold text-[var(--fg)]">Project details</div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Label required className="sm:col-span-2">
                  Project name
                  <Input
                    placeholder="e.g. Final Team Project"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </Label>

                <Label required>
                  Submission deadline
                  <Input required type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />
                </Label>

                <Label>
                  Max score
                  <Input min={1} type="number" value={maxScore} onChange={(e) => setMaxScore(Number(e.target.value))} />
                </Label>
              </div>

              {/* Track */}
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">
                  Track <span className="font-normal text-[var(--fg-muted)]">(optional)</span>
                </span>
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
                  {TRACKS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </Select>
              </div>

              {/* Cohort */}
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">
                  Cohort <span className="font-normal text-[var(--fg-muted)]">(optional)</span>
                </span>
                <Select value={cohortId} onChange={(e) => setCohortId(e.target.value)}>
                  <option value="">No specific cohort</option>
                  {cohorts.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.studentCount} student{c.studentCount === 1 ? "" : "s"})</option>
                  ))}
                </Select>
              </div>

              {/* Submission type */}
              <div className="flex flex-col gap-2">
                <div className="text-sm font-medium">Submission type</div>
                <div className="flex flex-wrap gap-2">
                  {isCodeTrack && (
                    <label className={cn(
                      "inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                      allowGithub
                        ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--fg)]"
                        : "border-[var(--border)] bg-[var(--surface)] text-[var(--fg-muted)] hover:border-[var(--border-strong)]",
                    )}>
                      <input type="checkbox" checked={allowGithub} onChange={(e) => setAllowGithub(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
                      <Icon.Github className="h-4 w-4" />
                      GitHub repo
                    </label>
                  )}
                  <label className={cn(
                    "inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                    allowFileUpload
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--fg)]"
                      : "border-[var(--border)] bg-[var(--surface)] text-[var(--fg-muted)] hover:border-[var(--border-strong)]",
                  )}>
                    <input type="checkbox" checked={allowFileUpload} onChange={(e) => setAllowFileUpload(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
                    <Icon.Upload className="h-4 w-4" />
                    ZIP / PDF upload
                  </label>
                </div>
              </div>

              {/* Class notes */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    Class notes <span className="font-normal text-[var(--fg-muted)]">(optional)</span>
                  </span>
                  <label className="cursor-pointer text-xs text-[var(--accent)] hover:underline">
                    Upload .md
                    <input accept=".md,.markdown,.txt" type="file" className="sr-only" onChange={handleClassNotesFile} />
                  </label>
                </div>
                <Textarea
                  placeholder="Notes or resources shown to students when submitting…"
                  rows={3}
                  value={classNotes}
                  onChange={(e) => setClassNotes(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Team count */}
          <div className="flex items-center gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-[var(--fg)]">Number of teams</span>
              <span className="text-xs text-[var(--fg-muted)]">
                {students.length > 0
                  ? `${students.length} student${students.length === 1 ? "" : "s"} → ~${Math.ceil(students.length / groupCount)} per team`
                  : "Students are distributed evenly after creation."}
              </span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleGroupCountChange(groupCount - 1)}
                disabled={groupCount <= 1}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--fg)] hover:bg-[var(--surface-muted)] disabled:opacity-40"
              >
                <Icon.Minus className="h-3.5 w-3.5" />
              </button>
              <span className="w-8 text-center text-sm font-semibold tabular-nums">{groupCount}</span>
              <button
                type="button"
                onClick={() => handleGroupCountChange(groupCount + 1)}
                disabled={groupCount >= 50}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--fg)] hover:bg-[var(--surface-muted)] disabled:opacity-40"
              >
                <Icon.Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Per-team cards */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {teams.map((team, idx) => (
              <Card
                key={idx}
                onDragOver={(e) => onDragOver(e as unknown as DragEvent, idx)}
                onDragLeave={() => setHoverTeam((h) => (h === idx ? null : h))}
                onDrop={(e) => onDrop(e as unknown as DragEvent, idx)}
                className={hoverTeam === idx ? "ring-2 ring-[var(--accent)]" : undefined}
              >
                <CardContent className="flex flex-col gap-3">
                  {/* Team name */}
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-xs font-semibold text-[var(--accent)]">
                      {idx + 1}
                    </div>
                    <Input
                      value={team.name}
                      onChange={(e) => updateTeam(idx, { name: e.target.value })}
                      className="flex-1 font-semibold"
                      placeholder={`Team ${idx + 1}`}
                    />
                  </div>

                  {/* Brief */}
                  <div className="flex flex-col gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-muted)]/40 p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-muted)]">
                      Team brief
                    </div>
                    <div className="flex gap-1">
                      {(["markdown", "link", "pdf"] as GroupSourceType[]).map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => updateTeam(idx, { sourceType: type })}
                          className={cn(
                            "flex-1 rounded px-2 py-1 text-[11px] font-medium transition-colors",
                            team.sourceType === type
                              ? "bg-[var(--accent)] text-white"
                              : "border border-[var(--border)] bg-[var(--surface)] text-[var(--fg-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]",
                          )}
                        >
                          {type === "markdown" ? "Markdown" : type === "link" ? "Link" : "PDF"}
                        </button>
                      ))}
                    </div>

                    {team.sourceType === "markdown" && (
                      <Textarea
                        rows={4}
                        placeholder="Describe this team's task, questions, or requirements…"
                        value={team.content}
                        onChange={(e) => updateTeam(idx, { content: e.target.value })}
                      />
                    )}
                    {team.sourceType === "link" && (
                      <Input
                        type="url"
                        placeholder="https://docs.google.com/… or any URL"
                        value={team.sourceUrl}
                        onChange={(e) => updateTeam(idx, { sourceUrl: e.target.value })}
                      />
                    )}
                    {team.sourceType === "pdf" && (
                      <div className="flex flex-col gap-1.5">
                        <input
                          type="file"
                          accept=".pdf"
                          disabled={team.uploadingPdf}
                          className="text-xs text-[var(--fg-muted)] file:mr-2 file:rounded file:border file:border-[var(--border)] file:bg-[var(--surface)] file:px-2 file:py-1 file:text-xs file:text-[var(--fg)] file:hover:bg-[var(--surface-muted)]"
                          onChange={(e) => handlePdfUpload(idx, e)}
                        />
                        {team.uploadingPdf && <span className="text-[11px] text-[var(--fg-muted)]">Uploading…</span>}
                        {team.pdfFileName && !team.uploadingPdf && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-[var(--accent)]">
                            <Icon.Check className="h-3 w-3" /> {team.pdfFileName}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Students (drag between teams) */}
                  <div className="flex flex-col gap-1.5">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-muted)]">
                      Students
                      <span className="ml-1 font-normal normal-case">
                        ({studentsByTeam[idx]?.length ?? 0}) — drag to re-assign
                      </span>
                    </div>
                    {(studentsByTeam[idx]?.length ?? 0) === 0 ? (
                      <div className="rounded-md border border-dashed border-[var(--border)] px-3 py-4 text-center text-xs text-[var(--fg-muted)]">
                        Drop students here
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {(studentsByTeam[idx] ?? []).map((sid) => {
                          const s = studentById.get(sid);
                          if (!s) return null;
                          return (
                            <div
                              key={sid}
                              draggable
                              onDragStart={() => onDragStart(sid, idx)}
                              className="flex cursor-move items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs transition-colors hover:border-[var(--border-strong)]"
                            >
                              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--surface-muted)] text-[10px] font-semibold text-[var(--fg-muted)]">
                                {s.fullName.charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="truncate font-medium text-[var(--fg)]">{s.fullName}</div>
                                {!s.email.endsWith("@historical.reviewai.local") && (
                                  <div className="truncate text-[10px] text-[var(--fg-muted)]">{s.email}</div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {error && (
            <div className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger)]">
              {error}
            </div>
          )}

          <div className="flex justify-end">
            <Button type="submit" loading={submitting}>
              <Icon.Users className="h-3.5 w-3.5" />
              Create & set up teams
            </Button>
          </div>
        </form>
      </div>
    </TeacherShell>
  );
}
