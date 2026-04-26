import { useEffect, useState } from "react";
import { marked } from "marked";
import StudentShell from "../components/StudentShell";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Icon } from "../components/ui/Icons";
import { PageHeader } from "../components/ui/PageHeader";
import { api } from "../api";
import { formatRelative } from "../lib/format";
import type { ClassNote } from "../types";

export default function StudentNotesPage() {
  const [notes, setNotes] = useState<ClassNote[]>([]);
  const [selected, setSelected] = useState<ClassNote | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api<ClassNote[]>("/class-notes").then(setNotes).catch(() => setNotes([]));
  }, []);

  async function openNote(note: ClassNote) {
    if (note.content) {
      setSelected(note);
      return;
    }
    setLoading(true);
    try {
      const full = await api<ClassNote>(`/class-notes/${note.id}`);
      setSelected(full);
      setNotes((prev) => prev.map((n) => (n.id === full.id ? full : n)));
    } finally {
      setLoading(false);
    }
  }

  if (selected) {
    return (
      <StudentShell section="notes">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
              <Icon.ChevronLeft className="h-4 w-4" />
              Back to notes
            </Button>
          </div>
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
                      <Icon.FileText className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-medium text-[var(--fg)]">{note.title}</div>
                      <div className="text-xs text-[var(--fg-muted)]">{formatRelative(note.createdAt)}</div>
                    </div>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => openNote(note)} disabled={loading}>
                    Read
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
