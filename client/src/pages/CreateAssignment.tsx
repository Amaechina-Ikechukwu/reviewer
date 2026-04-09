import { useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import TeacherShell from "../components/TeacherShell";
import { toast } from "../components/Toast";
import { api } from "../api";
import type { Assignment } from "../types";

type SourceMode = "markdown" | "notion";

export default function CreateAssignment() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [sourceMode, setSourceMode] = useState<SourceMode>("markdown");
  const [sourceMarkdown, setSourceMarkdown] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [closesAt, setClosesAt] = useState("");
  const [allowGithub, setAllowGithub] = useState(true);
  const [allowFileUpload, setAllowFileUpload] = useState(true);
  const [maxScore, setMaxScore] = useState(100);
  const [classNotes, setClassNotes] = useState("");
  const [error, setError] = useState("");
  const [created, setCreated] = useState<Assignment | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleMarkdownFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setSourceMarkdown(await file.text());
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");

    try {
      const assignment = await api<Assignment>("/assignments", {
        method: "POST",
        body: JSON.stringify({
          title,
          description: "",
          rubric: "",
          maxScore,
          sourceType: sourceMode,
          sourceMarkdown: sourceMode === "markdown" ? sourceMarkdown : null,
          sourceUrl: sourceMode === "notion" ? sourceUrl : null,
          opensAt: new Date().toISOString(),
          closesAt: new Date(closesAt).toISOString(),
          allowGithub,
          allowFileUpload,
          defaultProvider: "gemini",
          classNotes: classNotes || null,
        }),
      });

      setCreated(assignment);
      toast().success("Assignment created");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create assignment";
      setError(msg);
      toast().error(msg);
    }
  }

  function copyLink() {
    if (!created) return;
    navigator.clipboard.writeText(`${window.location.origin}/student/submit/${created.id}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (created) {
    const link = `${window.location.origin}/student/submit/${created.id}`;
    return (
      <TeacherShell section="assignments">
        <div className="page" style={{ maxWidth: 560, margin: "0 auto" }}>
          <div className="card stack" style={{ gap: 20, padding: 28 }}>
            <div className="stack" style={{ gap: 6 }}>
              <span className="tag success" style={{ width: "fit-content" }}>Created</span>
              <h2 style={{ margin: 0 }}>{created.title}</h2>
              <span className="muted" style={{ fontSize: "0.9rem" }}>
                Due {new Date(created.closesAt).toLocaleString()}
              </span>
            </div>

            <div className="stack" style={{ gap: 8 }}>
              <span style={{ fontWeight: 700, fontSize: "0.88rem" }}>Student submission link</span>
              <div className="link-copy-row">
                <span className="link-copy-url">{link}</span>
                <button className="button" style={{ flexShrink: 0, padding: "8px 16px", fontSize: "0.85rem" }} onClick={copyLink} type="button">
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>

            <div className="row">
              <button className="button secondary" onClick={() => navigate("/teacher")} type="button">Dashboard</button>
              <button className="button subtle" onClick={() => { setCreated(null); setTitle(""); setSourceMarkdown(""); setSourceUrl(""); setClosesAt(""); }} type="button">
                New assignment
              </button>
            </div>
          </div>
        </div>
      </TeacherShell>
    );
  }

  return (
    <TeacherShell section="assignments">
      <div className="page" style={{ maxWidth: 600, margin: "0 auto" }}>
        <div className="stack" style={{ gap: 6, marginBottom: 8 }}>
          <Link className="action-link" to="/teacher" style={{ fontSize: "0.88rem" }}>← Dashboard</Link>
          <h1 style={{ margin: 0 }}>New assignment</h1>
        </div>

        <form className="card stack" style={{ gap: 24, padding: 28 }} onSubmit={handleSubmit}>
          <label className="field">
            <span>Assignment name</span>
            <input
              placeholder="e.g. JavaScript & HTML Events"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>

          <div className="stack" style={{ gap: 10 }}>
            <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>Assignment source</span>
            <div className="source-toggle">
              <button
                className={`source-toggle-btn ${sourceMode === "markdown" ? "active" : ""}`}
                type="button"
                onClick={() => setSourceMode("markdown")}
              >
                Markdown file
              </button>
              <button
                className={`source-toggle-btn ${sourceMode === "notion" ? "active" : ""}`}
                type="button"
                onClick={() => setSourceMode("notion")}
              >
                Notion link
              </button>
            </div>

            {sourceMode === "markdown" && (
              <div className="stack" style={{ gap: 8 }}>
                <label className="field">
                  <span>Upload .md file</span>
                  <input accept=".md,.markdown,.txt" type="file" onChange={handleMarkdownFile} />
                </label>
                {sourceMarkdown && (
                  <span className="muted" style={{ fontSize: "0.82rem" }}>
                    {sourceMarkdown.split("\n").length} lines loaded
                  </span>
                )}
              </div>
            )}

            {sourceMode === "notion" && (
              <label className="field">
                <span>Notion page URL</span>
                <input
                  placeholder="https://www.notion.so/..."
                  type="url"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                />
              </label>
            )}
          </div>

          <label className="field">
            <span>Submission deadline</span>
            <input
              required
              type="datetime-local"
              value={closesAt}
              onChange={(e) => setClosesAt(e.target.value)}
            />
          </label>

          <div className="stack" style={{ gap: 10 }}>
            <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>Submission type</span>
            <div className="row" style={{ gap: 16 }}>
              <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input checked={allowGithub} type="checkbox" onChange={(e) => setAllowGithub(e.target.checked)} />
                <span>GitHub repo</span>
              </label>
              <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input checked={allowFileUpload} type="checkbox" onChange={(e) => setAllowFileUpload(e.target.checked)} />
                <span>ZIP upload</span>
              </label>
            </div>
          </div>

          <label className="field">
            <span>Max score</span>
            <input
              min={1}
              style={{ maxWidth: 120 }}
              type="number"
              value={maxScore}
              onChange={(e) => setMaxScore(Number(e.target.value))}
            />
          </label>

          <label className="field">
            <span>Class notes <span className="muted">(optional — shown to students when submitting)</span></span>
            <textarea
              placeholder="Paste any notes, instructions, or resources students should read before submitting..."
              rows={5}
              value={classNotes}
              onChange={(e) => setClassNotes(e.target.value)}
            />
          </label>

          {error && <div style={{ color: "var(--danger)", fontSize: "0.9rem" }}>{error}</div>}

          <button className="button" type="submit">Create & get link</button>
        </form>
      </div>
    </TeacherShell>
  );
}
