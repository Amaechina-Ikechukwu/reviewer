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

  if (!assignment) return <div className="auth-shell">Loading...</div>;

  return (
    <StudentShell section="submissions">
      <div className="page">
        <div className="submit-page stack">
          <div className="stack" style={{ gap: 4 }}>
            <h1 className="student-page-title">{assignment.title}</h1>
            {assignment.description && (
              <p className="muted" style={{ fontSize: "1rem", margin: 0 }}>{assignment.description}</p>
            )}
          </div>

          <form className="stack" onSubmit={handleSubmit}>
            {(assignment.allowGithub && assignment.allowFileUpload) && (
              <div className="submission-toggle">
                <button className={submissionType === "github" ? "active" : ""} onClick={() => setSubmissionType("github")} type="button">GitHub Repo</button>
                <button className={submissionType === "file_upload" ? "active" : ""} onClick={() => setSubmissionType("file_upload")} type="button">ZIP Upload</button>
              </div>
            )}

            {submissionType === "github" ? (
              <label className="field">
                <span>Repository URL</span>
                <input
                  className="input-plain"
                  placeholder="https://github.com/username/repo"
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                />
              </label>
            ) : (
              <label className="field">
                <span>ZIP file</span>
                <input accept=".zip" onChange={(e) => setFile(e.target.files?.[0] || null)} type="file" />
              </label>
            )}

            <label className="field">
              <span>Notes <span className="muted">(optional)</span></span>
              <textarea
                placeholder="Any specific areas you'd like feedback on?"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>

            {error && <div className="soft-card" style={{ color: "#b91c1c" }}>{error}</div>}

            <button className="button" disabled={submitting} type="submit">
              {submitting ? "Submitting..." : "Submit for Review"}
            </button>
          </form>
        </div>
      </div>
    </StudentShell>
  );
}
