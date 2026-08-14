import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
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
import type { Assignment, AssignmentGroup } from "../types";

type GroupMember = { id: string; fullName: string; email: string };

export default function SubmitAssignment() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [assetBriefUrl, setAssetBriefUrl] = useState<string | null>(null);
  const [assetBriefType, setAssetBriefType] = useState<"pdf" | "docx" | null>(null);
  const [classNotesAssetUrl, setClassNotesAssetUrl] = useState<string | null>(null);
  const [classNotesAssetError, setClassNotesAssetError] = useState<string | null>(null);
  const [briefError, setBriefError] = useState<string | null>(null);
  const [hasOverride, setHasOverride] = useState(false);
  const [alreadySubmitted, setAlreadySubmitted] = useState<{ submittedAt: string; submittedByStudentId?: string; submittedByName?: string } | null>(null);
  const [myGroup, setMyGroup] = useState<AssignmentGroup | null>(null);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [groupBriefUrl, setGroupBriefUrl] = useState<string | null>(null);
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
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
        if (data.sourceType === "pdf") {
          if (!data.sourcePdfPath) {
            setBriefError("The teacher hasn't attached a PDF brief to this assignment yet. Please contact your teacher.");
          } else {
            const token = localStorage.getItem("token");
            fetch(`/v2/api/assignments/${data.id}/brief`, {
              headers: token ? { Authorization: `Bearer ${token}` } : {},
            })
              .then(async (r) => {
                if (!r.ok) throw new Error(`Brief unavailable (${r.status})`);
                const blob = await r.blob();
                if (blob.type !== "application/pdf") throw new Error("Brief unavailable");
                setAssetBriefUrl(URL.createObjectURL(blob));
              })
              .catch((err) => {
                setBriefError(err instanceof Error ? err.message : "Failed to load assignment brief.");
              });
          }
        }
        if (data.isGroupAssignment) {
          api<{ groups: AssignmentGroup[]; members: Record<string, GroupMember>; myGroupId: string | null }>(`/assignments/${data.id}/groups`)
            .then(async (res) => {
              const g = res.groups.find((x) => x.id === res.myGroupId) || null;
              setMyGroup(g);
              setGroupMembers(g ? g.memberIds.map((id) => res.members[id]).filter(Boolean) : []);
              if (!g) return;

              const token = localStorage.getItem("token");
              const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
              const blobUrl = async (url: string) => {
                const r = await fetch(url, { headers: authHeaders });
                if (!r.ok) throw new Error(`Unavailable (${r.status})`);
                return URL.createObjectURL(await r.blob());
              };

              if (g.sourceType === "pdf" && g.sourcePdfPath) {
                blobUrl(`/v2/api/assignments/${data.id}/groups/${g.id}/brief`)
                  .then(setGroupBriefUrl)
                  .catch(() => {});
              }

              for (const asset of g.assets ?? []) {
                if (asset.kind !== "file") continue;
                blobUrl(`/v2/api/assignments/${data.id}/groups/${g.id}/assets/${asset.id}`)
                  .then((u) => setAssetUrls((prev) => ({ ...prev, [asset.id]: u })))
                  .catch(() => {});
              }
            })
            .catch(() => {});
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load assignment"));

    api<{ assignmentIds: string[] }>("/students/my-overrides")
      .then((r) => setHasOverride(r.assignmentIds.includes(assignmentId!)))
      .catch(() => setHasOverride(false));

    api<Array<{ submission: { id: string; submittedAt: string; studentId: string; groupId?: string | null }; studentName?: string | null }>>(`/submissions?assignment_id=${assignmentId}`)
      .then((rows) => {
        if (rows.length > 0) {
          const row = rows[0];
          setAlreadySubmitted({
            submittedAt: row.submission.submittedAt,
            submittedByStudentId: row.submission.studentId,
            submittedByName: row.studentName ?? undefined,
          });
        }
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
        if (!file) throw new Error("Please attach a ZIP or PDF file.");
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

      {assignment.isGroupAssignment && (
        <Card>
          <CardHeader>
            <CardTitle>{myGroup ? myGroup.name : "Your group"}</CardTitle>
          </CardHeader>
          <CardContent>
            {myGroup ? (
              <>
                <div className="mb-2 text-xs text-[var(--fg-muted)]">
                  The first member to submit represents the group. Only they can update the submission. Everyone receives the same score.
                </div>
                <ul className="flex flex-col gap-1.5">
                  {groupMembers.map((m) => (
                    <li key={m.id} className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-muted)]/40 px-2.5 py-1.5 text-sm">
                      <Icon.Users className="h-3.5 w-3.5 text-[var(--fg-muted)]" />
                      <span className="truncate">{m.fullName}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <div className="text-sm text-[var(--fg-muted)]">
                You haven't been assigned to a group yet. Contact your teacher.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {myGroup && (myGroup.description || myGroup.sourceUrl || groupBriefUrl || myGroup.rubric) && (
        <Card>
          <CardHeader>
            <CardTitle>Your team&apos;s brief</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {myGroup.description && (
              <div
                className="mdcontent text-sm text-[var(--fg)]"
                dangerouslySetInnerHTML={{ __html: marked(myGroup.description) as string }}
              />
            )}
            {myGroup.sourceType === "link" && myGroup.sourceUrl && (
              <a
                href={myGroup.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-fit items-center gap-2 text-sm text-[var(--accent)] hover:underline"
              >
                <Icon.External className="h-4 w-4" /> Open team brief
              </a>
            )}
            {groupBriefUrl && (
              <iframe
                src={groupBriefUrl}
                title="Team brief"
                className="h-96 w-full rounded-lg border border-[var(--border)]"
              />
            )}
            {myGroup.rubric && (
              <div className="rounded-md border border-[var(--border)] bg-[var(--surface-muted)]/40 p-3">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-muted)]">
                  Rubric
                </div>
                <div
                  className="mdcontent text-sm text-[var(--fg)]"
                  dangerouslySetInnerHTML={{ __html: marked(myGroup.rubric) as string }}
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {myGroup && (myGroup.assets?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Team resources</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {(myGroup.assets ?? []).map((asset) => {
              if (asset.kind === "link") {
                return (
                  <a
                    key={asset.id}
                    href={asset.url ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--fg)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                  >
                    <Icon.External className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 truncate">{asset.name}</span>
                  </a>
                );
              }
              const url = assetUrls[asset.id];
              const isImage = asset.ext !== "pdf";
              return (
                <div key={asset.id} className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--fg-muted)]">
                    <Icon.FileText className="h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 truncate">{asset.name}</span>
                  </div>
                  {!url ? (
                    <div className="rounded-lg border border-[var(--border)] px-3 py-6 text-center text-xs text-[var(--fg-muted)]">
                      Loading…
                    </div>
                  ) : isImage ? (
                    <img
                      src={url}
                      alt={asset.name}
                      className="w-full rounded-lg border border-[var(--border)]"
                    />
                  ) : (
                    <iframe
                      src={url}
                      title={asset.name}
                      className="h-96 w-full rounded-lg border border-[var(--border)]"
                    />
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {assignment.questions && (
        <Card>
          <CardHeader>
            <CardTitle>Assignment Questions</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="mdcontent text-sm text-[var(--fg)]"
              dangerouslySetInnerHTML={{ __html: marked(assignment.questions) as string }}
            />
          </CardContent>
        </Card>
      )}

      {(!assignment.classNotesType || assignment.classNotesType === "markdown") && assignment.classNotes && (
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
      
      {assignment.classNotesType === "link" && assignment.classNotesUrl && (
        <Card>
          <CardHeader>
            <CardTitle>Class notes (Link)</CardTitle>
          </CardHeader>
          <CardContent>
            <a href={assignment.classNotesUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-[var(--accent)] hover:underline">
              <Icon.External className="h-4 w-4" /> Open class notes link
            </a>
          </CardContent>
        </Card>
      )}
      
      {(assignment.classNotesType === "pdf" || assignment.classNotesType === "docx") && (
        <Card>
          <CardHeader>
            <CardTitle>Class notes ({assignment.classNotesType.toUpperCase()})</CardTitle>
          </CardHeader>
          <CardContent>
            {classNotesAssetUrl ? (
              <a href={classNotesAssetUrl} download={`class-notes.${assignment.classNotesType}`} className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--fg)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]">
                <Icon.Download className="h-4 w-4" /> Download Class Notes
              </a>
            ) : classNotesAssetError ? (
              <div className="text-sm text-[var(--danger)]">{classNotesAssetError}</div>
            ) : (
              <div className="text-sm text-[var(--fg-muted)]">Loading file...</div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Your submission</CardTitle>
        </CardHeader>
        <CardContent>
          {alreadySubmitted && assignment.isGroupAssignment && alreadySubmitted.submittedByStudentId !== currentUser?.id ? (
            /* Another group member submitted — read-only */
            <div className="flex flex-col items-center gap-3 rounded-lg border border-[var(--success)]/30 bg-[var(--success-soft)] px-4 py-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--success)]/20 text-[var(--success)]">
                <Icon.Check className="h-6 w-6" />
              </div>
              <div className="text-base font-semibold">Already submitted</div>
              {alreadySubmitted.submittedByName && (
                <div className="text-sm font-medium text-[var(--fg)]">by {alreadySubmitted.submittedByName}</div>
              )}
              <div className="text-xs text-[var(--fg-muted)]">
                {formatDateTime(alreadySubmitted.submittedAt)}
              </div>
            </div>
          ) : alreadySubmitted && (!assignment.isGroupAssignment || isPast) ? (
            /* Non-group already submitted, or group submitter but deadline passed */
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
            /* Fresh submission or original group submitter updating */
            <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
              {alreadySubmitted && assignment.isGroupAssignment && (
                <div className="rounded-lg border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-3 py-2 text-xs text-[var(--accent)]">
                  You are updating your group&apos;s submission.
                </div>
              )}
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
                      File upload
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
                  File <span className="font-normal text-[var(--fg-muted)]">(ZIP or PDF)</span>
                  <Input accept=".zip,.pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} type="file" />
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
                {alreadySubmitted ? "Update submission" : "Submit for review"}
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
      {assignment.sourceType === "pdf" ? (
        <div className="flex h-[calc(100svh-56px-3rem)] gap-6 overflow-hidden">
          <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-hidden">
            <div className="flex flex-col gap-1">
              <div className="text-xs font-medium uppercase tracking-wider text-[var(--fg-muted)]">Assignment</div>
              <h1 className="text-3xl font-semibold leading-tight tracking-tight">{assignment.title}</h1>
              {assignment.description && (
                <p className="text-sm leading-relaxed text-[var(--fg-muted)]">{assignment.description}</p>
              )}
            </div>
            {assetBriefUrl ? (
              <iframe src={assetBriefUrl} className="flex-1 rounded-lg border border-[var(--border)]" title="Assignment brief" />
            ) : briefError ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-4 py-8 text-center">
                <Icon.AlertTriangle className="h-5 w-5 text-[var(--danger)]" />
                <p className="text-sm font-medium text-[var(--danger)]">Assignment brief unavailable</p>
                <p className="text-xs text-[var(--fg-muted)]">{briefError}</p>
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-[var(--fg-muted)]">
                Loading brief…
              </div>
            )}
          </div>
          <div className="w-80 shrink-0 overflow-y-auto">{sidebar}</div>
        </div>
      ) : assignment.sourceMarkdown ? (
        <div className="flex h-[calc(100svh-56px-3rem)] gap-6 overflow-hidden">
          {/* Markdown pane — scrolls independently */}
          <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto">
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
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-8 py-7">
              <div
                className="mdcontent"
                dangerouslySetInnerHTML={{ __html: marked(assignment.sourceMarkdown) as string }}
              />
            </div>
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
