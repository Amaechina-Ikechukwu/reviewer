import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { marked } from "marked";
import { api } from "../api";
import { Toaster } from "../components/Toast";
import { Badge } from "../components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Icon } from "../components/ui/Icons";
import { formatDateTime } from "../lib/format";
import type { PublicGroup } from "../types";

export default function PublicGroupBrief() {
  const { token } = useParams<{ token: string }>();
  const [group, setGroup] = useState<PublicGroup | null>(null);
  const [briefUrl, setBriefUrl] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    api<PublicGroup>(`/public/groups/${token}`)
      .then((g) => {
        setGroup(g);
        if (g.hasBrief) {
          fetch(`/v2/api/public/groups/${token}/brief`)
            .then((r) => (r.ok ? r.blob() : Promise.reject(new Error("unavailable"))))
            .then((blob) => setBriefUrl(URL.createObjectURL(blob)))
            .catch(() => {});
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Group not found"));
  }, [token]);

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <header className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto flex max-w-4xl items-center gap-2 px-4 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)] text-[var(--accent-fg)]">
            <Icon.Users className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold tracking-tight text-[var(--fg)]">Team brief</span>
        </div>
      </header>

      <main className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-8">
        {error && (
          <div className="flex min-h-[30vh] items-center justify-center text-sm text-[var(--danger)]">{error}</div>
        )}

        {!error && !group && (
          <div className="flex min-h-[30vh] items-center justify-center text-sm text-[var(--fg-muted)]">Loading...</div>
        )}

        {group && (
          <>
            <div className="flex flex-col gap-2">
              {group.assignmentTitle && (
                <div className="text-xs font-medium uppercase tracking-wider text-[var(--fg-muted)]">
                  {group.assignmentTitle}
                </div>
              )}
              <h1 className="text-2xl font-semibold tracking-tight text-[var(--fg)]">{group.name}</h1>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {group.maxScore != null && <Badge tone="accent">Max score {group.maxScore}</Badge>}
                {group.closesAt && <Badge tone="warn">Due {formatDateTime(group.closesAt)}</Badge>}
              </div>
            </div>

            {group.memberNames.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Team members</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-1.5">
                    {group.memberNames.map((n) => (
                      <span
                        key={n}
                        className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-muted)]/40 px-2.5 py-1.5 text-sm"
                      >
                        <Icon.Users className="h-3.5 w-3.5 text-[var(--fg-muted)]" />
                        {n}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {(group.description || group.sourceUrl || briefUrl || group.rubric) && (
              <Card>
                <CardHeader>
                  <CardTitle>Brief</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {group.description && (
                    <div
                      className="mdcontent text-sm leading-relaxed text-[var(--fg)]"
                      dangerouslySetInnerHTML={{ __html: marked(group.description) as string }}
                    />
                  )}
                  {group.sourceType === "link" && group.sourceUrl && (
                    <a
                      href={group.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex w-fit items-center gap-2 text-sm text-[var(--accent)] hover:underline"
                    >
                      <Icon.External className="h-4 w-4" /> Open team brief
                    </a>
                  )}
                  {briefUrl && (
                    <iframe
                      src={briefUrl}
                      title="Team brief"
                      className="h-[70vh] min-h-[420px] w-full rounded-lg border border-[var(--border)]"
                    />
                  )}
                  {group.rubric && (
                    <div className="rounded-md border border-[var(--border)] bg-[var(--surface-muted)]/40 p-3">
                      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-muted)]">
                        Rubric
                      </div>
                      <div
                        className="mdcontent text-sm text-[var(--fg)]"
                        dangerouslySetInnerHTML={{ __html: marked(group.rubric) as string }}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {group.assets.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Team resources</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  {group.assets.map((asset) =>
                    asset.kind === "link" ? (
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
                    ) : (
                      <div key={asset.id} className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--fg-muted)]">
                          <Icon.FileText className="h-3.5 w-3.5 shrink-0" />
                          <span className="min-w-0 truncate">{asset.name}</span>
                        </div>
                        {asset.ext === "pdf" ? (
                          <iframe
                            src={`/v2/api/public/groups/${token}/assets/${asset.id}`}
                            title={asset.name}
                            className="h-[70vh] min-h-[420px] w-full rounded-lg border border-[var(--border)]"
                          />
                        ) : (
                          <img
                            src={`/v2/api/public/groups/${token}/assets/${asset.id}`}
                            alt={asset.name}
                            className="w-full rounded-lg border border-[var(--border)]"
                          />
                        )}
                      </div>
                    ),
                  )}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </main>

      <Toaster />
    </div>
  );
}
