import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { marked } from "marked";
import { api } from "../api";
import { Toaster } from "../components/Toast";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Icon } from "../components/ui/Icons";
import { formatDateTime } from "../lib/format";
import type { PublicAssignmentBrief as PublicBrief } from "../types";

export default function PublicAssignmentBrief() {
  const { id } = useParams<{ id: string }>();
  const [assignment, setAssignment] = useState<PublicBrief | null>(null);
  const [pdfBriefUrl, setPdfBriefUrl] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    api<PublicBrief>(`/public/assignments/${id}`)
      .then((a) => {
        setAssignment(a);
        if (a.sourceType === "pdf" && a.sourcePdfPath) {
          fetch(`/v2/api/public/assignments/${a.id}/brief`)
            .then((r) => r.blob())
            .then((blob) => setPdfBriefUrl(URL.createObjectURL(blob)))
            .catch(() => {});
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Assignment not found"));
  }, [id]);

  if (assignment?.isGroupAssignment) {
    const documentUrl = `/v2/api/public/assignments/${assignment.id}/brief`;
    return (
      <div className="min-h-screen bg-[var(--bg)]">
        <header className="border-b border-[var(--border)] bg-[var(--surface)]"><div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-4"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)] text-[var(--accent-fg)]"><Icon.Users className="h-4 w-4" /></div><span className="text-sm font-semibold tracking-tight text-[var(--fg)]">Group project</span></div></header>
        <main className="mx-auto grid max-w-6xl gap-5 px-4 py-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <Card className="overflow-hidden"><CardHeader><CardTitle><span className="inline-flex items-center gap-2"><Icon.FileText className="h-4 w-4 text-[var(--fg-muted)]" /> Project brief</span></CardTitle>{(assignment.sourceType === "pdf" || assignment.sourceType === "docx") && <a href={documentUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--accent)] hover:underline"><Icon.Download className="h-3.5 w-3.5" /> {assignment.sourceType === "docx" ? "Download DOCX" : "Open PDF"}</a>}</CardHeader><CardContent className={assignment.sourceType === "pdf" ? "p-0" : undefined}>{assignment.sourceType === "pdf" ? (pdfBriefUrl ? <iframe src={pdfBriefUrl} className="h-[72vh] min-h-[560px] w-full border-0" title="Project brief" /> : <div className="flex h-[560px] items-center justify-center text-sm text-[var(--fg-muted)]">Loading document…</div>) : assignment.sourceType === "docx" ? <div className="flex min-h-[560px] flex-col items-center justify-center gap-3 px-6 text-center"><Icon.FileText className="h-8 w-8 text-[var(--accent)]" /><p className="text-sm text-[var(--fg-muted)]">This project uses a DOCX brief.</p><a href={documentUrl} target="_blank" rel="noreferrer"><Button size="sm"><Icon.Download className="h-3.5 w-3.5" /> Download DOCX</Button></a></div> : assignment.sourceMarkdown ? <div className="mdcontent min-h-[560px] text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: marked(assignment.sourceMarkdown) as string }} /> : assignment.sourceUrl ? <div className="flex min-h-[560px] items-center justify-center"><a href={assignment.sourceUrl} target="_blank" rel="noreferrer"><Button size="sm">Open project brief <Icon.External className="h-3.5 w-3.5" /></Button></a></div> : <div className="flex min-h-[560px] items-center justify-center text-sm text-[var(--fg-muted)]">No brief content has been added yet.</div>}</CardContent></Card>
          <aside className="flex flex-col gap-4"><div><div className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--fg-muted)]">Public project page</div><h1 className="text-2xl font-semibold tracking-tight text-[var(--fg)]">{assignment.title}</h1>{assignment.description && <p className="mt-2 text-sm leading-relaxed text-[var(--fg-muted)]">{assignment.description}</p>}</div><Card><CardHeader><CardTitle>Project overview</CardTitle></CardHeader><CardContent className="grid gap-3 text-sm"><div className="flex items-center justify-between gap-4"><span className="text-[var(--fg-muted)]">Deadline</span><span className="text-right text-xs font-medium">{formatDateTime(assignment.closesAt)}</span></div><div className="flex items-center justify-between"><span className="text-[var(--fg-muted)]">Teams</span><span className="font-medium">{assignment.groupCount ?? 0}</span></div><div className="flex items-center justify-between"><span className="text-[var(--fg-muted)]">Max score</span><span className="font-medium">{assignment.maxScore}</span></div>{assignment.track && <div className="flex items-center justify-between"><span className="text-[var(--fg-muted)]">Track</span><span className="capitalize">{assignment.track.replace(/_/g, " ")}</span></div>}</CardContent></Card></aside>
        </main><Toaster />
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <header className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)] text-[var(--accent-fg)]">
            <Icon.Sparkles className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold tracking-tight text-[var(--fg)]">Assignment brief</span>
        </div>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8">
        {error && (
          <div className="flex min-h-[30vh] items-center justify-center text-sm text-[var(--danger)]">{error}</div>
        )}

        {!error && !assignment && (
          <div className="flex min-h-[30vh] items-center justify-center text-sm text-[var(--fg-muted)]">Loading...</div>
        )}

        {assignment && (
          <>
            <div className="flex flex-col gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-[var(--fg)]">{assignment.title}</h1>
              {assignment.description && (
                <p className="text-sm text-[var(--fg-muted)]">{assignment.description}</p>
              )}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Badge tone="accent">Max score {assignment.maxScore}</Badge>
                <Badge tone="warn">Due {formatDateTime(assignment.closesAt)}</Badge>
                {assignment.track && <Badge tone="neutral">{assignment.track.replace(/_/g, " ")}</Badge>}
              </div>
            </div>

            {assignment.sourceType === "pdf" ? (
              <Card>
                <CardHeader>
                  <CardTitle>
                    <span className="inline-flex items-center gap-2">
                      <Icon.FileText className="h-4 w-4 text-[var(--fg-muted)]" />
                      Brief
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {pdfBriefUrl ? (
                    <iframe src={pdfBriefUrl} className="h-[600px] w-full rounded-b-xl border-0" title="Assignment brief" />
                  ) : (
                    <div className="flex h-32 items-center justify-center text-sm text-[var(--fg-muted)]">Loading brief…</div>
                  )}
                </CardContent>
              </Card>
            ) : assignment.sourceMarkdown ? (
              <Card>
                <CardHeader>
                  <CardTitle>
                    <span className="inline-flex items-center gap-2">
                      <Icon.FileText className="h-4 w-4 text-[var(--fg-muted)]" />
                      Brief
                    </span>
                  </CardTitle>
                  {assignment.sourceUrl && (
                    <a
                      href={assignment.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--accent)] hover:underline"
                    >
                      <Icon.External className="h-3 w-3" />
                      Open source
                    </a>
                  )}
                </CardHeader>
                <CardContent>
                  <div
                    className="mdcontent text-sm leading-relaxed text-[var(--fg)]"
                    dangerouslySetInnerHTML={{ __html: marked(assignment.sourceMarkdown) as string }}
                  />
                </CardContent>
              </Card>
            ) : assignment.sourceUrl ? (
              <Card>
                <CardHeader>
                  <CardTitle>
                    <span className="inline-flex items-center gap-2">
                      <Icon.External className="h-4 w-4 text-[var(--fg-muted)]" />
                      Brief
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <a
                    href={assignment.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--fg)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                  >
                    <Icon.External className="h-3.5 w-3.5" />
                    Open assignment brief
                  </a>
                </CardContent>
              </Card>
            ) : (
              <div className="flex min-h-[20vh] items-center justify-center text-sm text-[var(--fg-muted)]">
                No brief content has been added to this assignment yet.
              </div>
            )}
          </>
        )}
      </main>

      <Toaster />
    </div>
  );
}
