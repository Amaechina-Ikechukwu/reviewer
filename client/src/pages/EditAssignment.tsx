import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import TeacherShell from "../components/TeacherShell";
import { toast } from "../components/Toast";
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
            setTrack(a.track ?? "");
            setCohortId(a.cohortId ?? "");
          })
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
