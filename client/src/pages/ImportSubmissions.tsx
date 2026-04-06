import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import TeacherShell from "../components/TeacherShell";
import { api } from "../api";
import type { Assignment } from "../types";

type ImportRow = {
  id: string;
  fullName: string;
  email: string;
  githubUrl: string;
};

function normalizeGithubUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const withoutLabel = trimmed.replace(/^(link|github|repo|repository)\s*:\s*/i, "").trim();

  if (/^https?:\/\/github\.com\/[^\s]+$/i.test(withoutLabel)) {
    return withoutLabel;
  }

  const shortMatch = withoutLabel.match(/^([a-z0-9_.-]+\/[a-z0-9_.-]+(?:\.git)?)$/i);
  if (shortMatch) {
    return `https://github.com/${shortMatch[1]}`;
  }

  const embeddedMatch = withoutLabel.match(/github\.com\/([a-z0-9_.-]+\/[a-z0-9_.-]+(?:\.git)?)/i);
  if (embeddedMatch) {
    return `https://github.com/${embeddedMatch[1]}`;
  }

  return withoutLabel;
}

function createRow(index: number, fullName: string, githubUrl: string, email = ""): ImportRow {
  return {
    id: `${index}-${fullName}-${githubUrl}`,
    fullName: fullName.trim(),
    email: email.trim(),
    githubUrl: normalizeGithubUrl(githubUrl),
  };
}

function parsePastedDoc(input: string): ImportRow[] {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const rows: ImportRow[] = [];
  let pendingName = "";
  let pendingEmail = "";

  function flushRow(rawLink: string) {
    const githubUrl = normalizeGithubUrl(rawLink);
    if (!githubUrl) {
      return;
    }

    const fallbackName = pendingName || rawLink.replace(githubUrl, "").trim() || `Imported Student ${rows.length + 1}`;
    rows.push(createRow(rows.length, fallbackName, githubUrl, pendingEmail));
    pendingName = "";
    pendingEmail = "";
  }

  for (const line of lines) {
    const emailMatch = line.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    if (emailMatch) {
      pendingEmail = emailMatch[0];
    }

    const labeledName = line.match(/^name\s*:\s*(.+)$/i) || line.match(/^full\s*name\s*:\s*(.+)$/i);
    if (labeledName) {
      pendingName = labeledName[1].trim();
      continue;
    }

    const labeledLink = line.match(/^(link|github|repo|repository)\s*:\s*(.+)$/i);
    if (labeledLink) {
      flushRow(labeledLink[2]);
      continue;
    }

    const githubMatch = line.match(/https?:\/\/github\.com\/[^\s]+/i);
    if (githubMatch) {
      const prefix = line.slice(0, githubMatch.index).replace(/^(name\s*:)?/i, "").trim();
      if (prefix && !pendingName) {
        pendingName = prefix.replace(/[-|,]+$/g, "").trim();
      }
      flushRow(githubMatch[0]);
      continue;
    }

    const shortGithubMatch = line.match(/\b([a-z0-9_.-]+\/[a-z0-9_.-]+(?:\.git)?)\b/i);
    if (shortGithubMatch && line.includes("/")) {
      const candidate = normalizeGithubUrl(shortGithubMatch[1]);
      if (candidate.startsWith("https://github.com/")) {
        const prefix = line.replace(shortGithubMatch[1], "").trim();
        if (prefix && !pendingName) {
          pendingName = prefix.replace(/^(name\s*:)?/i, "").trim();
        }
        flushRow(shortGithubMatch[1]);
        continue;
      }
    }

    if (!pendingName) {
      pendingName = line;
    }
  }

  return rows.filter((row) => row.fullName && row.githubUrl);
}

export default function ImportSubmissions() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [assignmentId, setAssignmentId] = useState("");
  const [pastedDoc, setPastedDoc] = useState("");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [message, setMessage] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<Array<{ email?: string; fullName: string; githubUrl: string; createdStudent: boolean; submissionId: string }> | null>(null);

  useEffect(() => {
    api<Assignment[]>("/assignments").then((data) => {
      setAssignments(data);
      if (data[0]) setAssignmentId(data[0].id);
    }).catch(() => setAssignments([]));
  }, []);

  const missingFields = useMemo(() => rows.filter((row) => !row.fullName || !row.githubUrl).length, [rows]);

  function parseRows() {
    setRows(parsePastedDoc(pastedDoc));
    setResult(null);
    setMessage("");
  }

  async function handleDocFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setPastedDoc(text);
    setRows(parsePastedDoc(text));
  }

  function updateRow(id: string, field: keyof Omit<ImportRow, "id">, value: string) {
    setRows((current) => current.map((row) => (
      row.id === id
        ? {
            ...row,
            [field]: field === "githubUrl" ? normalizeGithubUrl(value) : value,
          }
        : row
    )));
  }

  async function importRows() {
    try {
      setIsImporting(true);
      setMessage("");
      const response = await api<{ imported: Array<{ email?: string; fullName: string; githubUrl: string; createdStudent: boolean; submissionId: string }> }>("/submissions/import", {
        method: "POST",
        body: JSON.stringify({
          assignmentId,
          entries: rows.map((row) => ({ fullName: row.fullName, email: row.email, githubUrl: row.githubUrl })),
        }),
      });
      setResult(response.imported);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Import failed");
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <TeacherShell section="submissions" searchPlaceholder="Search imports...">
      <div className="page stack">
        <h1 className="page-title">Import Submissions</h1>

        <div className="teacher-form-grid">
          <div className="stack">
            <div className="card stack">
              <label className="field">
                <span>Assignment</span>
                <select value={assignmentId} onChange={(event) => setAssignmentId(event.target.value)}>
                  {assignments.map((assignment) => (
                    <option key={assignment.id} value={assignment.id}>{assignment.title}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Pasted docs content</span>
                <textarea value={pastedDoc} onChange={(event) => setPastedDoc(event.target.value)} placeholder="Supports NAME / LINK pairs, full GitHub URLs, or short owner/repo links." />
              </label>
              <label className="field">
                <span>Or load text export</span>
                <input accept=".txt,.md,.csv" onChange={handleDocFile} type="file" />
              </label>
              <div className="row">
                <button className="button" onClick={parseRows} type="button">Parse document</button>
                <span className="muted">Detected rows: {rows.length}</span>
              </div>
            </div>

            {rows.length > 0 && (
              <div className="card stack">
                <div className="section-header">
                  <div>
                    <h2 style={{ margin: 0 }}>Import Preview</h2>
                    <p className="muted" style={{ margin: 0 }}>{missingFields ? `${missingFields} row(s) need edits.` : "Ready to import."}</p>
                  </div>
                </div>
                {rows.map((row) => (
                  <div className="card stack" key={row.id}>
                    <div className="grid two">
                      <label className="field">
                        <span>Full name</span>
                        <input value={row.fullName} onChange={(event) => updateRow(row.id, "fullName", event.target.value)} />
                      </label>
                      <label className="field">
                        <span>Email (Optional)</span>
                        <input placeholder="Leave blank if you do not need email yet" value={row.email} onChange={(event) => updateRow(row.id, "email", event.target.value)} />
                      </label>
                    </div>
                    <label className="field">
                      <span>GitHub URL</span>
                      <input value={row.githubUrl} onChange={(event) => updateRow(row.id, "githubUrl", event.target.value)} />
                    </label>
                  </div>
                ))}
                <div className="row" style={{ justifyContent: "flex-end" }}>
                  <button className="button" disabled={!assignmentId || missingFields > 0 || isImporting} onClick={importRows} type="button">
                    {isImporting ? "Importing submissions..." : "Import submissions"}
                  </button>
                </div>
                {isImporting && (
                  <div className="muted" style={{ textAlign: "right" }}>
                    Cloning repositories and creating historical submission records...
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="stack">
            {message && <div className="soft-card" style={{ color: "#b91c1c" }}>{message}</div>}
            <div className="queue-panel">
              <h3 style={{ margin: 0 }}>Format tips</h3>
              <p className="muted" style={{ margin: 0 }}>
                Paste NAME / LINK pairs, full GitHub URLs, or short <code>owner/repo</code> paths. Email is optional.
              </p>
            </div>
            {result && (
              <div className="card stack">
                <h3 style={{ margin: 0 }}>Import Result</h3>
                {result.map((item) => (
                  <div className="history-card" key={item.submissionId} style={{ gridTemplateColumns: "1fr", background: "#eef4ff" }}>
                    <strong>{item.fullName}</strong>
                    {item.email && <span className="muted">{item.email}</span>}
                    <span className="muted">{item.githubUrl}</span>
                    <span>{item.createdStudent ? "Student record created." : "Used existing student record."}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </TeacherShell>
  );
}
