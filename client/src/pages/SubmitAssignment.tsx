import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import StudentShell from "../components/StudentShell";
import { api } from "../api";
import type { Assignment } from "../types";

export default function SubmitAssignment() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [submissionType, setSubmissionType] = useState<"github" | "file_upload">("github");
  const [githubUrl, setGithubUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!assignmentId) return;
    api<Assignment>(`/assignments/${assignmentId}`).then((data) => {
      setAssignment(data);
      if (!data.allowGithub && data.allowFileUpload) setSubmissionType("file_upload");
    }).catch((err) => setError(err instanceof Error ? err.message : "Failed to load assignment"));
  }, [assignmentId]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!assignmentId) return;
    setSubmitting(true);
    setError("");

    try {
      if (submissionType === "github") {
        await api("/submissions", { method: "POST", body: JSON.stringify({ assignmentId, githubUrl, notes }) });
      } else {
        if (!file) throw new Error("Please attach a ZIP file.");
        const formData = new FormData();
        formData.append("assignmentId", assignmentId);
        formData.append("file", file);
        await api("/submissions", { method: "POST", body: formData });
      }
      navigate("/student/results");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (!assignment) return <div className="auth-shell">Loading assignment...</div>;

  return (
    <StudentShell section="submissions">
      <div className="page">
        <div className="student-layout-grid">
          <div className="stack">
            <div className="stack" style={{ gap: 6 }}>
              <h1 className="student-page-title">{assignment.title}</h1>
              <p className="muted" style={{ fontSize: "1rem", margin: 0 }}>{assignment.description}</p>
            </div>

            <div className="student-panel stack">
              <div className="section-header">
                <h2 style={{ margin: 0 }}>Assignment Brief</h2>
                <span className="tag">Gemini Review</span>
              </div>
              <div className="feedback-box">
                {assignment.rubric}
              </div>
            </div>
          </div>

          <aside className="student-panel stack">
            <div className="row" style={{ alignItems: "flex-start" }}>
              <div style={{ width: 6, borderRadius: 999, background: "#1d4dd8", minHeight: 48 }} />
              <div className="stack" style={{ gap: 10 }}>
                <h2 style={{ margin: 0, fontSize: "1.6rem" }}>New Submission</h2>
                <div className="field">
                  <span>Selected Assignment</span>
                  <div className="input-shell">{assignment.title}</div>
                </div>
              </div>
            </div>

            <form className="stack" onSubmit={handleSubmit}>
              <div className="submission-toggle">
                {assignment.allowGithub && (
                  <button className={submissionType === "github" ? "active" : ""} onClick={() => setSubmissionType("github")} type="button">GitHub Repo</button>
                )}
                {assignment.allowFileUpload && (
                  <button className={submissionType === "file_upload" ? "active" : ""} onClick={() => setSubmissionType("file_upload")} type="button">ZIP Upload</button>
                )}
              </div>

              {submissionType === "github" ? (
                <label className="field">
                  <span>Repository URL</span>
                  <div className="input-shell">
                    <span>Link</span>
                    <input placeholder="https://github.com/username/repo" value={githubUrl} onChange={(event) => setGithubUrl(event.target.value)} />
                  </div>
                </label>
              ) : (
                <label className="field">
                  <span>ZIP file</span>
                  <input accept=".zip" onChange={(event) => setFile(event.target.files?.[0] || null)} type="file" />
                </label>
              )}

              <label className="field">
                <span>Notes for Reviewer (Optional)</span>
                <textarea placeholder="Any specific areas you'd like feedback on?" value={notes} onChange={(event) => setNotes(event.target.value)} />
              </label>

              {error && <div className="soft-card" style={{ color: "#b91c1c" }}>{error}</div>}

              <button className="button" disabled={submitting} type="submit">
                {submitting ? "Submitting..." : "Submit for Gemini Review"}
              </button>
            </form>

            <div className="tip-panel">
              <strong style={{ color: "#6a1fd2" }}>AI Tip</strong>
              <p className="muted" style={{ marginBottom: 0 }}>
                GitHub repos let Gemini inspect repository structure directly before generating feedback.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </StudentShell>
  );
}
