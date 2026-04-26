import { useEffect, useRef, useState } from "react";
import TeacherShell from "../components/TeacherShell";
import { toast } from "../components/Toast";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Icon } from "../components/ui/Icons";
import { Modal } from "../components/ui/Modal";
import { PageHeader } from "../components/ui/PageHeader";
import { Table, TBody, TD, TH, THead, TR, EmptyRow } from "../components/ui/Table";
import { api } from "../api";
import { formatRelative } from "../lib/format";
import type { ClassNote } from "../types";

export default function ClassNotesPage() {
  const [notes, setNotes] = useState<ClassNote[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ClassNote | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api<ClassNote[]>("/class-notes").then(setNotes).catch(() => setNotes([]));
  }, []);

  async function uploadFile(file: File) {
    if (!file.name.endsWith(".md")) {
      toast().error("Only .md files are accepted.");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const note = await api<ClassNote>("/class-notes", { method: "POST", body: form });
      setNotes((prev) => [note, ...prev]);
      toast().success(`"${note.title}" uploaded.`);
    } catch (err) {
      toast().error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api(`/class-notes/${deleteTarget.id}`, { method: "DELETE" });
      setNotes((prev) => prev.filter((n) => n.id !== deleteTarget.id));
      toast().success(`"${deleteTarget.title}" deleted.`);
      setDeleteTarget(null);
    } catch (err) {
      toast().error(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <TeacherShell section="notes">
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Class Notes"
          description="Upload markdown files to share notes with all students."
        />

        <Card>
          <CardContent>
            <div
              className={`flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-10 transition-colors cursor-pointer ${
                dragging
                  ? "border-[var(--accent)] bg-[var(--accent-soft)]/30"
                  : "border-[var(--border)] hover:border-[var(--accent)]/50 hover:bg-[var(--surface-muted)]/50"
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
                <Icon.Upload className="h-5 w-5" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-[var(--fg)]">Drop a .md file here or click to browse</p>
                <p className="mt-1 text-xs text-[var(--fg-muted)]">Markdown files only · Max 2 MB</p>
              </div>
              {uploading && (
                <p className="text-xs text-[var(--accent)]">Uploading…</p>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept=".md" className="hidden" onChange={onFileChange} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Uploaded notes</CardTitle>
          </CardHeader>
          <Table>
            <THead>
              <TR>
                <TH>Title</TH>
                <TH>Filename</TH>
                <TH>Uploaded</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {notes.map((note) => (
                <TR key={note.id}>
                  <TD label="Title">
                    <div className="flex items-center gap-2 font-medium">
                      <Icon.FileText className="h-4 w-4 shrink-0 text-[var(--fg-muted)]" />
                      {note.title}
                    </div>
                  </TD>
                  <TD label="Filename" className="text-xs text-[var(--fg-muted)]">{note.filename}</TD>
                  <TD label="Uploaded" className="text-xs text-[var(--fg-muted)]">{formatRelative(note.createdAt)}</TD>
                  <TD label="Actions" className="text-right">
                    <button
                      type="button"
                      title="Delete note"
                      onClick={() => setDeleteTarget(note)}
                      className="rounded-md p-1 text-[var(--fg-subtle)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
                    >
                      <Icon.Trash className="h-3.5 w-3.5" />
                    </button>
                  </TD>
                </TR>
              ))}
              {notes.length === 0 && (
                <EmptyRow cols={4}>No notes uploaded yet. Drop a .md file above to get started.</EmptyRow>
              )}
            </TBody>
          </Table>
        </Card>
      </div>

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={deleteTarget ? `Delete "${deleteTarget.title}"` : ""}
        description="This note will be removed for all students immediately."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" loading={deleting} onClick={handleDelete}>
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </>
        }
      />
    </TeacherShell>
  );
}
