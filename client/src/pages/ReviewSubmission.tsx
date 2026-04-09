import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import TeacherShell from "../components/TeacherShell";
import { toast } from "../components/Toast";
import { api } from "../api";
import type { CodeFile, Review } from "../types";

type SubmissionResponse = {
  submission: {
    id: string;
    submittedAt: string;
    submissionType: "github" | "file_upload";
    githubUrl: string | null;
    isLate: boolean;
  };
  assignment: {
    id: string;
    title: string;
    description: string;
    rubric: string;
    maxScore: number;
    sourceType: string;
    sourceMarkdown: string | null;
    sourceUrl: string | null;
    defaultProvider: string;
  };
  studentName: string | null;
  studentEmail: string | null;
};

function structureLabel(classification?: string) {
  switch (classification) {
    case "one_file_per_question":
      return "File Per Question";
    case "multi_file_per_question":
      return "Grouped By Question";
    case "single_project_solution":
      return "Single Combined Solution";
    case "mixed_or_unclear":
      return "Mixed";
    default:
      return "Structure Pending";
  }
}

function buildPreviewDocument(files: CodeFile[], htmlFile: CodeFile) {
  // Load CSS/JS from the same directory as the HTML file
  const dir = htmlFile.filename.includes("/")
    ? htmlFile.filename.slice(0, htmlFile.filename.lastIndexOf("/") + 1)
    : "";

  let html = htmlFile.content;
  const css = files
    .filter((f) => f.filename.toLowerCase().endsWith(".css") && f.filename.startsWith(dir))
    .map((f) => `<style>${f.content}</style>`)
    .join("\n");
  const js = files
    .filter((f) => f.filename.toLowerCase().endsWith(".js") && f.filename.startsWith(dir))
    .map((f) => `<script>${f.content}<\/script>`)
    .join("\n");

  html = html.includes("</head>") ? html.replace("</head>", `${css}</head>`) : `${css}${html}`;
  html = html.includes("</body>") ? html.replace("</body>", `${js}</body>`) : `${html}${js}`;
  return html;
}

export default function ReviewSubmission() {
  const { submissionId } = useParams();
  const [submission, setSubmission] = useState<SubmissionResponse | null>(null);
  const [files, setFiles] = useState<CodeFile[]>([]);
  const [review, setReview] = useState<Review | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);
  const [overrideScore, setOverrideScore] = useState("");
  const [finalFeedback, setFinalFeedback] = useState("");
  const [message, setMessage] = useState("");
  const [viewMode, setViewMode] = useState<"code" | "preview">("code");

  useEffect(() => {
    if (!submissionId) return;

    api<SubmissionResponse>(`/submissions/${submissionId}`).then(setSubmission).catch((err) => {
      setMessage(err instanceof Error ? err.message : "Failed to load submission");
    });

    api<{ files: CodeFile[] }>(`/submissions/${submissionId}/files`).then((data) => setFiles(data.files)).catch(() => setFiles([]));
    api<Review>(`/reviews/${submissionId}`).then((data) => {
      setReview(data);
      // Always pre-fill score from teacher override if set, else from AI score
      const score = data.teacherOverrideScore ?? data.aiScore;
      setOverrideScore(typeof score === "number" ? String(score) : "");
      setFinalFeedback(data.feedback?.summary || "");
    }).catch(() => setReview(null));
  }, [submissionId]);

  useEffect(() => {
    if (selectedFileIndex >= files.length) {
      setSelectedFileIndex(0);
    }
  }, [files, selectedFileIndex]);

  const selectedFile = files[selectedFileIndex] || files[0];
  const isHtmlFile = (f?: CodeFile) => !!f && f.filename.toLowerCase().endsWith(".html");
  const previewDoc = useMemo(
    () => selectedFile && isHtmlFile(selectedFile) ? buildPreviewDocument(files, selectedFile) : null,
    [files, selectedFile],
  );
  const hasPreview = files.some((f) => isHtmlFile(f));
  const geminiSummary = review?.feedback?.summary || "No Gemini review has been run for this submission yet.";
  const geminiSuggestions = review?.feedback?.suggestions || [];
  const geminiModel = review?.feedback?.model || "gemini-2.5-flash";
  const geminiScore = review?.teacherOverrideScore ?? review?.aiScore;
  const structure = review?.feedback?.submissionStructure;
  const fileScores = review?.feedback?.fileScores || [];
  const averageFileScore = review?.feedback?.averageFileScore;
  const questionGroups = review?.feedback?.questionGroups || [];
  const selectedFileLineCount = selectedFile?.content.split("\n").length || 0;
  const selectedFileScore = selectedFile
    ? fileScores.find((entry) => entry.filename === selectedFile.filename)
    : undefined;

  function focusFile(filename: string) {
    const nextIndex = files.findIndex((file) => file.filename === filename);
    if (nextIndex >= 0) {
      setSelectedFileIndex(nextIndex);
    }
  }

  async function runReview() {
    if (!submissionId) return;
    setReviewing(true);
    setMessage("");

    try {
      const nextReview = await api<Review>(`/reviews/${submissionId}/run`, {
        method: "POST",
        body: JSON.stringify({ provider: "gemini" }),
      });
      setReview(nextReview);
      const score = nextReview.teacherOverrideScore ?? nextReview.aiScore;
      setOverrideScore(typeof score === "number" ? String(score) : "");
      setFinalFeedback(nextReview.feedback?.summary || "");
      toast().success("Review completed");
      // Re-fetch files now that the repo has been cloned
      api<{ files: CodeFile[] }>(`/submissions/${submissionId}/files`).then((data) => setFiles(data.files)).catch(() => {});
    } catch (err) {
      toast().error(err instanceof Error ? err.message : "Review failed");
    } finally {
      setReviewing(false);
    }
  }

  async function applyOverride() {
    if (!submissionId) return;

    try {
      const nextReview = await api<Review>(`/reviews/${submissionId}/override`, {
        method: "PATCH",
        body: JSON.stringify({ score: Number(overrideScore), feedback: finalFeedback }),
      });
      setReview(nextReview);
      toast().success("Grade released");
    } catch (err) {
      toast().error(err instanceof Error ? err.message : "Failed to release grade");
    }
  }

  if (!submission) {
    return <div className="auth-shell">Loading submission...</div>;
  }

  return (
    <TeacherShell section="submissions" searchPlaceholder="Search entries...">
      <div className="page">
        <div className="stack" style={{ gap: 6 }}>
          <Link className="action-link" to="/teacher/submissions" style={{ fontSize: "0.88rem" }}>← Submissions</Link>
          <h1 className="page-title" style={{ margin: 0 }}>{submission.assignment.title}</h1>
          <div className="row muted" style={{ fontSize: "0.92rem" }}>
            <span>{submission.studentName || "Student"}</span>
            <span>·</span>
            <span>{new Date(submission.submission.submittedAt).toLocaleString()}</span>
          </div>
        </div>

        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="pill-row">
            <span className="tag">{submission.submission.submissionType}</span>
            <span className={`tag ${submission.submission.isLate ? "red" : "success"}`}>{submission.submission.isLate ? "Late" : "On Time"}</span>
            <span className="tag violet">{structureLabel(structure?.classification)}</span>
          </div>
          {submission.submission.githubUrl && (
            <a className="button secondary compact-button" href={submission.submission.githubUrl} rel="noreferrer" target="_blank">GitHub Repo</a>
          )}
        </div>

        {message && <div className="card" style={{ color: "#b91c1c", fontSize: "0.9rem" }}>{message}</div>}

        {/* Code + preview — full width always */}
        <section className="card code-preview-panel">
              {files.length > 0 && (
                <div className="file-selector-bar">
                  {files.map((file, index) => (
                    <button
                      className={`file-selector-chip ${index === selectedFileIndex ? "active" : ""}`}
                      key={file.path || file.filename}
                      onClick={() => {
                        setSelectedFileIndex(index);
                        setViewMode(isHtmlFile(file) ? "preview" : "code");
                      }}
                      type="button"
                    >
                      {file.filename}
                    </button>
                  ))}
                </div>
              )}

              <div className={`code-split-panel${previewDoc !== null ? " has-preview" : ""}`}>
                {/* Left: code */}
                <div className="code-split-left">
                  <div className="code-preview-head">
                    <span>Code: {selectedFile?.filename || "—"}</span>
                    <span>{selectedFile ? `${selectedFileLineCount} lines` : ""}</span>
                  </div>
                  {selectedFile && (
                    <div className="code-box">
                      <pre>{selectedFile.content}</pre>
                    </div>
                  )}
                </div>

                {/* Right: mini browser — only when an HTML file is selected */}
                {previewDoc !== null && (
                  <div className="code-split-right">
                    <div className="mini-browser">
                      <div className="mini-browser-bar">
                        <span className="mini-browser-dot red" />
                        <span className="mini-browser-dot yellow" />
                        <span className="mini-browser-dot green" />
                        <div className="mini-browser-url">
                          <span>🔒</span>
                          <span>{submission.studentName} — {submission.assignment.title}</span>
                        </div>
                      </div>
                      <iframe
                        className="mini-browser-frame"
                        sandbox="allow-scripts"
                        srcDoc={previewDoc}
                        title="Student preview"
                      />
                    </div>
                  </div>
                )}
              </div>

              {viewMode === "code" && selectedFileScore && (
                <div className="file-score-strip">
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <strong>{selectedFileScore.filename}</strong>
                    <span className="score-pill blue">{selectedFileScore.score}/{selectedFileScore.maxScore}</span>
                  </div>
                  <div className="muted">{selectedFileScore.summary}</div>
                </div>
              )}
        </section>

        {/* AI review + assessment two-column grid */}
        <div className="review-page-grid">
          <div className="stack">
            <section className="review-score-grid">
              <article className="provider-card blue">
                <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div className="stack" style={{ gap: 4 }}>
                    <strong style={{ fontSize: "1.02rem" }}>Gemini Review</strong>
                    <span className="muted">{geminiModel}</span>
                  </div>
                  <span className="score-pill blue">{typeof geminiScore === "number" ? `${geminiScore}/${review?.maxScore || submission.assignment.maxScore}` : "--"}</span>
                </div>

                <p style={{ fontSize: "0.98rem", lineHeight: 1.65 }}>{geminiSummary}</p>
                {typeof averageFileScore === "number" && (
                  <div className="soft-card row" style={{ justifyContent: "space-between" }}>
                    <strong>Average file score</strong>
                    <span className="score-pill blue">{Math.round(averageFileScore)}/{review?.maxScore || submission.assignment.maxScore}</span>
                  </div>
                )}
                {structure && (
                  <div className="soft-card stack" style={{ gap: 8 }}>
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <strong>File-to-question structure</strong>
                      <span className="tag violet">{structure.confidence} confidence</span>
                    </div>
                    <div className="muted">{structure.explanation}</div>
                  </div>
                )}
                {geminiSuggestions.length > 0 && (
                  <ul style={{ margin: 0, paddingLeft: 22, lineHeight: 1.55 }}>
                    {geminiSuggestions.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
              </article>
            </section>

            <section className="card stack">
              <div className="section-header">
                <h2 className="section-title" style={{ fontSize: "1.2rem" }}>Question Mapping</h2>
              </div>
              {questionGroups.length > 0 ? (
                questionGroups.map((group) => (
                  <div className="soft-card stack" key={`${group.label}-${group.files.join(",")}`} style={{ gap: 8 }}>
                    <strong>{group.label}</strong>
                    <div className="pill-row">
                      {group.files.map((file) => (
                        <button className="tag tag-button" key={file} onClick={() => focusFile(file)} type="button">
                          {file}
                        </button>
                      ))}
                    </div>
                    <div className="muted">{group.reasoning}</div>
                  </div>
                ))
              ) : (
                <div className="muted">Run Gemini review to infer how files map to assignment questions.</div>
              )}
            </section>

            {fileScores.length > 0 && (
              <section className="card stack">
                <div className="section-header">
                  <h2 className="section-title" style={{ fontSize: "1.2rem" }}>File Scores</h2>
                  {typeof averageFileScore === "number" && (
                    <span className="tag violet">Average {Math.round(averageFileScore)}/{review?.maxScore || submission.assignment.maxScore}</span>
                  )}
                </div>
                {fileScores.map((entry) => (
                  <button
                    className={`file-score-row ${selectedFile?.filename === entry.filename ? "active" : ""}`}
                    key={entry.filename}
                    onClick={() => focusFile(entry.filename)}
                    type="button"
                  >
                    <div className="stack" style={{ gap: 4, textAlign: "left" }}>
                      <strong>{entry.filename}</strong>
                      <span className="muted">{entry.summary}</span>
                    </div>
                    <span className="score-pill blue">{entry.score}/{entry.maxScore}</span>
                  </button>
                ))}
              </section>
            )}
          </div>

          <aside className="assessment-panel">
            <section className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h2 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800 }}>Final Assessment</h2>
                {typeof geminiScore === "number" && geminiScore > 0 && (
                  <span className="score-pill blue">{geminiScore}/{review?.maxScore || submission.assignment.maxScore}</span>
                )}
              </div>

              <div className="stack" style={{ padding: "16px 20px 20px", gap: 14 }}>
                <label className="field">
                  <span>Score (0–{submission.assignment.maxScore})</span>
                  <div className="score-input">
                    <input
                      placeholder="—"
                      value={overrideScore}
                      onChange={(event) => setOverrideScore(event.target.value)}
                    />
                    <span className="score-denom">/ {submission.assignment.maxScore}</span>
                  </div>
                </label>

                <label className="field">
                  <span>Feedback to {submission.studentName?.split(" ")[0] || "Student"}</span>
                  <textarea
                    placeholder={`Write feedback for ${submission.studentName?.split(" ")[0] || "the student"}...`}
                    value={finalFeedback}
                    onChange={(event) => setFinalFeedback(event.target.value)}
                    style={{ minHeight: 120 }}
                  />
                </label>

                <button
                  className="button review-action-button"
                  onClick={applyOverride}
                  type="button"
                  style={{ marginTop: 4 }}
                  disabled={!review || review.status !== "completed"}
                  title={!review || review.status !== "completed" ? "Run Gemini Review first" : undefined}
                >
                  Release Grade
                </button>
                {(!review || review.status !== "completed") && (
                  <p className="muted" style={{ margin: 0, fontSize: "0.8rem", textAlign: "center" }}>
                    Run Gemini Review first to enable grading
                  </p>
                )}

                <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                  <button className="button secondary compact-button review-action-button" onClick={runReview} disabled={reviewing} type="button">
                    {reviewing ? "Running Gemini Review..." : "Run Gemini Review"}
                  </button>
                </div>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </TeacherShell>
  );
}
