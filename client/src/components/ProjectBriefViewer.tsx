import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/Card";
import { Icon } from "./ui/Icons";

/** Renders the project's attached PDF brief inline, the same way an
 * assignment's PDF brief renders on its detail page. Fetches through the
 * authenticated API rather than a plain <iframe src> since the brief
 * endpoint requires a bearer token. */
export function ProjectBriefViewer({
  projectId,
  briefPdfPath,
}: {
  projectId: string;
  briefPdfPath?: string | null;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!briefPdfPath) {
      setUrl(null);
      return;
    }
    let objectUrl: string | null = null;
    let cancelled = false;
    const token = localStorage.getItem("token");
    fetch(`/v2/api/projects/${projectId}/brief`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.blob())
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [projectId, briefPdfPath]);

  if (!briefPdfPath) return null;

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>
          <span className="inline-flex items-center gap-2">
            <Icon.FileText className="h-4 w-4 text-[var(--fg-muted)]" />
            Project brief
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {url ? (
          <iframe src={url} className="h-[600px] w-full rounded-b-xl border-0" title="Project brief" />
        ) : (
          <div className="flex h-32 items-center justify-center text-sm text-[var(--fg-muted)]">Loading brief…</div>
        )}
      </CardContent>
    </Card>
  );
}
