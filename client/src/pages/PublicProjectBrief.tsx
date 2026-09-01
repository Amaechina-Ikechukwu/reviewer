import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";
import { Toaster } from "../components/Toast";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Icon } from "../components/ui/Icons";
import { formatDateTime } from "../lib/format";
import type { PublicProjectBrief as PublicBrief } from "../types";

export default function PublicProjectBrief() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<PublicBrief | null>(null);
  const [pdfBriefUrl, setPdfBriefUrl] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    api<PublicBrief>(`/public/projects/${id}`)
      .then((p) => {
        setProject(p);
        if (p.briefPdfPath) {
          fetch(`/v2/api/public/projects/${p.id}/brief`)
            .then((r) => r.blob())
            .then((blob) => setPdfBriefUrl(URL.createObjectURL(blob)))
            .catch(() => {});
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Project not found"));
  }, [id]);

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <header className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)] text-[var(--accent-fg)]">
            <Icon.Folder className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold tracking-tight text-[var(--fg)]">Project brief</span>
        </div>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8">
        {error && (
          <div className="flex min-h-[30vh] items-center justify-center text-sm text-[var(--danger)]">{error}</div>
        )}

        {!error && !project && (
          <div className="flex min-h-[30vh] items-center justify-center text-sm text-[var(--fg-muted)]">Loading...</div>
        )}

        {project && (
          <>
            <div className="flex flex-col gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-[var(--fg)]">{project.title}</h1>
              {project.description && (
                <p className="text-sm text-[var(--fg-muted)]">{project.description}</p>
              )}
              <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-[var(--fg-subtle)]">
                <span>By <strong className="font-medium text-[var(--fg-muted)]">{project.createdByName}</strong></span>
                {project.deadline && (
                  <>
                    <span className="text-[var(--border)]">·</span>
                    <span>Due {formatDateTime(project.deadline)}</span>
                  </>
                )}
              </div>
            </div>

            {project.briefPdfPath ? (
              <Card className="overflow-hidden">
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
                    <iframe src={pdfBriefUrl} className="h-[600px] w-full rounded-b-xl border-0" title="Project brief" />
                  ) : (
                    <div className="flex h-32 items-center justify-center text-sm text-[var(--fg-muted)]">Loading brief…</div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="flex min-h-[20vh] items-center justify-center text-sm text-[var(--fg-muted)]">
                No brief document has been attached to this project yet.
              </div>
            )}
          </>
        )}
      </main>

      <Toaster />
    </div>
  );
}
