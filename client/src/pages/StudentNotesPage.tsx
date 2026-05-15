import { useEffect, useRef, useState } from "react";
import { marked } from "marked";
import StudentShell from "../components/StudentShell";
import { toast } from "../components/Toast";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Icon } from "../components/ui/Icons";
import { PageHeader } from "../components/ui/PageHeader";
import { api } from "../api";
import { formatRelative } from "../lib/format";
import type { ClassNote } from "../types";

const FILE_ICONS: Record<string, React.ReactNode> = {
  md: <Icon.FileText className="h-4 w-4 shrink-0 text-[var(--fg-muted)]" />,
  pdf: <Icon.FileCode className="h-4 w-4 shrink-0 text-[var(--danger)]" />,
  docx: <Icon.Book className="h-4 w-4 shrink-0 text-[var(--accent)]" />,
};

const FILE_BADGE: Record<string, { tone: "success" | "accent" | "warn"; label: string }> = {
  md: { tone: "success", label: "MD" },
  pdf: { tone: "warn", label: "PDF" },
  docx: { tone: "accent", label: "DOCX" },
};

export default function StudentNotesPage() {
  const [notes, setNotes] = useState<ClassNote[]>([]);
  const [selected, setSelected] = useState<ClassNote | null>(null);
  const [loading, setLoading] = useState(false);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    api<ClassNote[]>("/class-notes").then(setNotes).catch(() => {
      setNotes([]);
      toast().error("Failed to load class notes");
    });
  }, []);

  useEffect(() => {
    return () => {
      if (fileUrl) URL.revokeObjectURL(fileUrl);
    };
  }, [fileUrl]);

  async function fetchFile(id: string): Promise<string> {
    const token = localStorage.getItem("token");
    const res = await fetch(`/v2/api/class-notes/${id}/download`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error("Failed to load file");
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  }

  async function openNote(note: ClassNote) {
    if (note.content) {
      setSelected(note);
      return;
    }
    setLoading(true);
    try {
      const full = await api<ClassNote>(`/class-notes/${note.id}`);
      if (full.fileType === "md" && full.content) {
        setSelected(full);
      } else {
        const url = await fetchFile(full.id);
        setFileUrl(url);
        setSelected(full);
      }
      setNotes((prev) => prev.map((n) => (n.id === full.id ? full : n)));
    } catch {
      toast().error("Failed to load note");
    } finally {
      setLoading(false);
    }
  }

  function goBack() {
    if (fileUrl) { URL.revokeObjectURL(fileUrl); setFileUrl(null); }
    setSelected(null);
  }

  if (selected) {
    return (
      <StudentShell section="notes">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={goBack}>
              <Icon.ChevronLeft className="h-4 w-4" />
              Back to notes
            </Button>
          </div>

          {selected.fileType === "pdf" && fileUrl && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Icon.FileCode className="h-4 w-4 text-[var(--danger)]" />
                  <CardTitle>{selected.title}</CardTitle>
                </div>
                <span className="text-xs text-[var(--fg-muted)]">{formatRelative(selected.createdAt)}</span>
              </CardHeader>
              <CardContent className="p-0">
                <iframe
                  ref={iframeRef}
                  src={fileUrl}
                  className="h-[80vh] w-full rounded-b-xl border-0"
                  title={selected.title}
                />
              </CardContent>
            </Card>
          )}

          {selected.fileType === "pdf" && !fileUrl && (
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <div className="flex items-center gap-2 text-sm text-[var(--fg-muted)]">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                  Loading PDF…
                </div>
              </CardContent>
            </Card>
          )}

          {selected.fileType === "docx" && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Icon.Book className="h-4 w-4 text-[var(--accent)]" />
                  <CardTitle>{selected.title}</CardTitle>
                </div>
                <span className="text-xs text-[var(--fg-muted)]">{formatRelative(selected.createdAt)}</span>
              </CardHeader>
              <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
                  <Icon.External className="h-6 w-6" />
                </div>
                <p className="text-sm font-medium text-[var(--fg)]">
                  Cannot preview DOCX in browser
                </p>
                <p className="text-xs text-[var(--fg-muted)]">
                  Download the file to view it in Microsoft Word, Google Docs, or a compatible editor.
                </p>
                <a
                  href={fileUrl || "#"}
                  download={selected.filename}
                  onClick={(e) => {
                    if (!fileUrl) {
                      e.preventDefault();
                      fetchFile(selected.id).then((url) => {
                        setFileUrl(url);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = selected.filename;
                        a.click();
                      });
                    }
                  }}
                >
                  <Button>
                    <Icon.External className="h-3.5 w-3.5" />
                    Download {selected.filename}
                  </Button>
                </a>
              </CardContent>
            </Card>
          )}

          {(!selected.fileType || selected.fileType === "md") && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Icon.FileText className="h-4 w-4 text-[var(--fg-muted)]" />
                  <CardTitle>{selected.title}</CardTitle>
                </div>
                <span className="text-xs text-[var(--fg-muted)]">{formatRelative(selected.createdAt)}</span>
              </CardHeader>
              <CardContent>
                <div
                  className="prose prose-sm max-w-none text-[var(--fg)] [&_h1]:text-[var(--fg)] [&_h2]:text-[var(--fg)] [&_h3]:text-[var(--fg)] [&_a]:text-[var(--accent)] [&_code]:rounded [&_code]:bg-[var(--surface-muted)] [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.85em] [&_pre]:rounded-lg [&_pre]:bg-[var(--surface-muted)] [&_pre]:p-4 [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--border)] [&_blockquote]:pl-4 [&_blockquote]:text-[var(--fg-muted)]"
                  dangerouslySetInnerHTML={{ __html: marked(selected.content ?? "") as string }}
                />
              </CardContent>
            </Card>
          )}
        </div>
      </StudentShell>
    );
  }

  return (
    <StudentShell section="notes">
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Class Notes"
          description="Notes shared by your teacher."
        />

        {notes.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface-muted)] text-[var(--fg-muted)]">
                <Icon.FileText className="h-5 w-5" />
              </div>
              <p className="text-sm text-[var(--fg-muted)]">No class notes yet. Check back later.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {notes.map((note) => (
              <Card key={note.id}>
                <CardContent className="flex items-center justify-between gap-4 py-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
                      {FILE_ICONS[note.fileType || "md"]}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-medium text-[var(--fg)]">{note.title}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-[var(--fg-muted)]">{formatRelative(note.createdAt)}</span>
                        <Badge tone={FILE_BADGE[note.fileType || "md"].tone}>
                          {FILE_BADGE[note.fileType || "md"].label}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => openNote(note)} disabled={loading}>
                    {note.fileType === "md" ? "Read" : "View"}
                    <Icon.ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </StudentShell>
  );
}
