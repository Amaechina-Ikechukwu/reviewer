import { useEffect, useMemo, useState } from "react";
import { Icon } from "./ui/Icons";
import { cn } from "../lib/cn";
import { buildPreviewDocument, buildReactPreviewDocument, isAppShell } from "../lib/preview";
import type { CodeFile } from "../types";

type FileScore = { filename: string; score: number; maxScore: number; summary: string };

type Props = {
  files: CodeFile[];
  /** Shown in the fake browser chrome above the live preview. */
  previewTitle?: string | null;
  /** Optional per-file AI scores; the selected file's score renders as a footer. */
  fileScores?: FileScore[];
  /** Controlled selection — omit to let the viewer manage it internally. */
  selectedFilename?: string;
  onSelectFile?: (filename: string) => void;
  emptyMessage?: string;
  className?: string;
};

function ScorePill({ score, max }: { score: number; max: number }) {
  const pct = max > 0 ? score / max : 0;
  const classes =
    pct >= 0.8
      ? "bg-[var(--success-soft)] text-[var(--success)]"
      : pct >= 0.6
        ? "bg-[var(--warn-soft)] text-[var(--warn)]"
        : "bg-[var(--danger-soft)] text-[var(--danger)]";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums", classes)}>
      {score}
      <span className="opacity-60">/{max}</span>
    </span>
  );
}

export default function SubmissionViewer({
  files,
  previewTitle,
  fileScores = [],
  selectedFilename,
  onSelectFile,
  emptyMessage = "No files available for this submission.",
  className,
}: Props) {
  const [internalFilename, setInternalFilename] = useState<string>("");
  const activeFilename = selectedFilename ?? internalFilename;

  const selectedFile = useMemo(
    () => files.find((file) => file.filename === activeFilename) || files[0],
    [files, activeFilename],
  );

  useEffect(() => {
    if (selectedFilename !== undefined) return;
    if (files.length === 0) {
      setInternalFilename("");
      return;
    }
    if (!files.some((file) => file.filename === internalFilename)) {
      setInternalFilename(files[0].filename);
    }
  }, [files, internalFilename, selectedFilename]);

  function selectFile(filename: string) {
    if (onSelectFile) onSelectFile(filename);
    if (selectedFilename === undefined) setInternalFilename(filename);
  }

  const isImage = selectedFile?.language === "image";
  const isPdf = selectedFile?.language === "pdf";
  const isSvg = !!selectedFile && selectedFile.filename.toLowerCase().endsWith(".svg");
  const isHtml = !!selectedFile && selectedFile.filename.toLowerCase().endsWith(".html");

  const reactPreviewDoc = useMemo(() => buildReactPreviewDocument(files), [files]);

  const previewDoc = useMemo(() => {
    // An `index.html` that only hosts `<div id="root">` renders blank on its
    // own, so prefer the compiled React preview whenever one is available.
    if (isHtml && selectedFile && !(reactPreviewDoc && isAppShell(selectedFile.content))) {
      return buildPreviewDocument(files, selectedFile);
    }
    return reactPreviewDoc;
  }, [files, selectedFile, isHtml, reactPreviewDoc]);

  const previewLabel = useMemo(() => {
    if (previewDoc === null) return "Preview";
    return previewDoc === reactPreviewDoc ? "React preview" : "HTML preview";
  }, [previewDoc, reactPreviewDoc]);

  const lineCount = selectedFile && !isImage && !isPdf && !isSvg ? selectedFile.content.split("\n").length : 0;
  const selectedScore = selectedFile ? fileScores.find((entry) => entry.filename === selectedFile.filename) : undefined;

  function openPreviewInNewTab() {
    if (!previewDoc) return;
    const url = URL.createObjectURL(new Blob([previewDoc], { type: "text/html" }));
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  return (
    <div className={cn("overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]", className)}>
      {files.length > 0 && (
        <div className="flex items-center gap-1 overflow-x-auto border-b border-[var(--border)] bg-[var(--surface-muted)]/50 px-2 py-1.5">
          {files.map((file) => (
            <button
              key={file.filename}
              onClick={() => selectFile(file.filename)}
              type="button"
              className={cn(
                "whitespace-nowrap rounded-md px-2.5 py-1 font-mono text-[11px] transition-colors",
                file.filename === selectedFile?.filename
                  ? "bg-[var(--surface)] text-[var(--fg)] shadow-sm ring-1 ring-[var(--border)]"
                  : "text-[var(--fg-muted)] hover:bg-[var(--surface)]/60 hover:text-[var(--fg)]",
              )}
            >
              {file.filename}
            </button>
          ))}
        </div>
      )}

      <div className={cn("grid", previewDoc !== null ? "lg:grid-cols-2" : "grid-cols-1")}>
        <div className="flex min-w-0 flex-col border-[var(--border)] lg:border-r">
          <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--surface-muted)]/30 px-4 py-2 text-[11px] text-[var(--fg-muted)]">
            <span className="truncate font-mono">{selectedFile?.filename || "—"}</span>
            <span className="shrink-0">
              {!selectedFile ? "" : isImage ? "image" : isSvg ? "svg" : isPdf ? "pdf" : `${lineCount} lines`}
            </span>
          </div>

          {selectedFile && (isImage || isSvg) ? (
            <div className="flex max-h-[520px] items-center justify-center overflow-auto bg-[var(--surface)] p-4">
              <img
                src={isImage ? selectedFile.content : `data:image/svg+xml,${encodeURIComponent(selectedFile.content)}`}
                alt={selectedFile.filename}
                className="max-h-full max-w-full object-contain"
              />
            </div>
          ) : selectedFile && isPdf ? (
            <iframe
              src={selectedFile.content}
              title={selectedFile.filename}
              className="h-[520px] w-full border-0 bg-[var(--surface)]"
            />
          ) : selectedFile ? (
            <pre className="m-0 max-h-[520px] overflow-auto bg-[var(--surface)] p-4 font-mono text-xs leading-relaxed text-[var(--fg)]">
              {selectedFile.content}
            </pre>
          ) : (
            <div className="flex h-40 items-center justify-center px-4 text-center text-sm text-[var(--fg-muted)]">
              {emptyMessage}
            </div>
          )}
        </div>

        {previewDoc !== null && (
          <div className="flex min-w-0 flex-col border-t border-[var(--border)] lg:border-t-0">
            <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--surface-muted)]/30 px-3 py-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--danger)]/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--warn)]/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--success)]/70" />
              <div className="ml-2 flex flex-1 items-center gap-1.5 truncate rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-[11px] text-[var(--fg-muted)]">
                <Icon.Link className="h-3 w-3 shrink-0" />
                <span className="truncate">{previewTitle ? `${previewLabel} — ${previewTitle}` : previewLabel}</span>
              </div>
              <button
                type="button"
                onClick={openPreviewInNewTab}
                title="Open preview in a new tab"
                className="shrink-0 rounded-md p-1 text-[var(--fg-muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--accent)]"
              >
                <Icon.External className="h-3.5 w-3.5" />
              </button>
            </div>
            <iframe
              className="h-[520px] w-full border-0 bg-white"
              sandbox="allow-scripts allow-popups allow-forms allow-modals"
              srcDoc={previewDoc}
              title="Submission preview"
            />
          </div>
        )}
      </div>

      {selectedScore && (
        <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] bg-[var(--surface-muted)]/30 px-4 py-2.5">
          <div className="min-w-0">
            <div className="truncate font-mono text-xs font-semibold">{selectedScore.filename}</div>
            <div className="truncate text-[11px] text-[var(--fg-muted)]">{selectedScore.summary}</div>
          </div>
          <ScorePill score={selectedScore.score} max={selectedScore.maxScore} />
        </div>
      )}
    </div>
  );
}
