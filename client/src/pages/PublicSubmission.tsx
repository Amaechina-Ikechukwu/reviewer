import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import SubmissionViewer from "../components/SubmissionViewer";
import { Toaster } from "../components/Toast";
import { Badge } from "../components/ui/Badge";
import { Icon } from "../components/ui/Icons";
import { api } from "../api";
import { formatDateTime } from "../lib/format";
import type { PublicSubmission as PublicSubmissionData } from "../types";

export default function PublicSubmission() {
  const { token } = useParams<{ token: string }>();
  const [submission, setSubmission] = useState<PublicSubmissionData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    api<PublicSubmissionData>(`/public/submissions/${token}`)
      .then(setSubmission)
      .catch((err) => setError(err instanceof Error ? err.message : "This link is no longer available."));
  }, [token]);

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <header className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)] text-[var(--accent-fg)]">
            <Icon.Sparkles className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold tracking-tight text-[var(--fg)]">Shared submission</span>
        </div>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-8">
        {error && (
          <div className="flex min-h-[30vh] items-center justify-center text-sm text-[var(--danger)]">{error}</div>
        )}

        {!error && !submission && (
          <div className="flex min-h-[30vh] items-center justify-center text-sm text-[var(--fg-muted)]">Loading...</div>
        )}

        {submission && (
          <>
            <div className="flex flex-col gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-[var(--fg)]">
                {submission.assignmentTitle || "Submission"}
              </h1>
              <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--fg-muted)]">
                {submission.studentName && (
                  <span className="font-medium text-[var(--fg)]">{submission.studentName}</span>
                )}
                {submission.studentName && <span>·</span>}
                <span>Submitted {formatDateTime(submission.submittedAt)}</span>
                <Badge tone="neutral">
                  <span className="inline-flex items-center gap-1">
                    {submission.submissionType === "github" ? (
                      <Icon.Github className="h-3 w-3" />
                    ) : (
                      <Icon.Upload className="h-3 w-3" />
                    )}
                    {submission.submissionType === "github" ? "GitHub" : "Upload"}
                  </span>
                </Badge>
              </div>
              {submission.githubUrl && (
                <a
                  href={submission.githubUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-[var(--accent)] hover:underline"
                >
                  <Icon.Github className="h-3.5 w-3.5" />
                  {submission.githubUrl}
                  <Icon.External className="h-3 w-3" />
                </a>
              )}
            </div>

            {submission.warning && (
              <div className="rounded-lg border border-[var(--warn)]/30 bg-[var(--warn-soft)] px-3 py-2 text-xs text-[var(--warn)]">
                {submission.warning}
              </div>
            )}

            <SubmissionViewer
              files={submission.files}
              previewTitle={submission.studentName || "Submission"}
              emptyMessage="No files are available for this submission."
            />
          </>
        )}
      </main>

      <Toaster />
    </div>
  );
}
