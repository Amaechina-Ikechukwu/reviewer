import { useState, type ChangeEvent } from "react";
import { uploadProjectBrief } from "../api";
import { toast } from "./Toast";
import { Icon } from "./ui/Icons";

/** PDF brief attach/replace control shared by the New Project form and the
 * Edit Project modal, for both the teacher and student flows. */
export function ProjectBriefField({
  briefPdfPath,
  onChange,
}: {
  briefPdfPath: string | null;
  onChange: (path: string | null) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { briefId } = await uploadProjectBrief(file);
      onChange(briefId);
      setFileName(file.name);
    } catch (err) {
      toast().error(err instanceof Error ? err.message : "Failed to upload the brief");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-[var(--fg)]">Project brief (PDF)</label>
      {briefPdfPath ? (
        <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)]">
          <Icon.FileText className="h-4 w-4 shrink-0 text-[var(--fg-muted)]" />
          <span className="min-w-0 flex-1 truncate">{fileName || "PDF attached"}</span>
          <button
            type="button"
            onClick={() => { onChange(null); setFileName(null); }}
            className="shrink-0 text-xs text-[var(--fg-muted)] transition-colors hover:text-[var(--danger)]"
          >
            Remove
          </button>
        </div>
      ) : (
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border)] bg-[var(--bg)] px-3 py-3 text-sm text-[var(--fg-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--fg)]">
          <Icon.Upload className="h-4 w-4" />
          {uploading ? "Uploading..." : "Upload a PDF brief"}
          <input type="file" accept=".pdf" className="hidden" onChange={handleFile} disabled={uploading} />
        </label>
      )}
    </div>
  );
}
