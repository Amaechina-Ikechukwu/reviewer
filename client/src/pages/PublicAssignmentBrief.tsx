import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { marked } from "marked";
import { api } from "../api";
import { Toaster } from "../components/Toast";
import { Badge } from "../components/ui/Badge";
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
