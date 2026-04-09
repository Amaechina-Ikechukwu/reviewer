import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import TeacherShell from "../components/TeacherShell";
import { toast } from "../components/Toast";
import { api } from "../api";

type GradebookAssignment = { id: string; title: string; maxScore: number };

type ScoreCell = {
  score: number | null;
  maxScore: number | null;
  status: string;
  submissionId: string;
} | null;

type GradebookRow = {
  student: { id: string; fullName: string; email: string };
  scores: Record<string, ScoreCell>;
  grandTotal: number;
  grandMaxTotal: number;
};

type GradebookData = {
  assignments: GradebookAssignment[];
  rows: GradebookRow[];
};

function scoreColor(score: number, maxScore: number) {
  const pct = maxScore > 0 ? score / maxScore : 0;
  if (pct >= 0.8) return "#1a8a4a";
  if (pct >= 0.6) return "#b45309";
  return "#b91c1c";
}

function statusDot(cell: ScoreCell) {
  if (!cell) return <span style={{ color: "#b0bac9", fontSize: "0.8rem" }}>—</span>;
  if (cell.score === null) {
    if (cell.status === "completed") return <span style={{ color: "#b45309", fontSize: "0.8rem" }}>reviewed</span>;
    if (cell.status === "reviewing") return <span style={{ color: "#2479a8", fontSize: "0.8rem" }}>reviewing</span>;
    return <span style={{ color: "#6b7a99", fontSize: "0.8rem" }}>submitted</span>;
  }
  const color = scoreColor(cell.score, cell.maxScore ?? 100);
  return (
    <span style={{ fontWeight: 700, color, fontSize: "0.92rem" }}>
      {cell.score}<span style={{ color: "#b0bac9", fontWeight: 400 }}>/{cell.maxScore}</span>
    </span>
  );
}

export default function GradebookPage() {
  const [data, setData] = useState<GradebookData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    api<GradebookData>("/gradebook")
      .then(setData)
      .catch(() => toast().error("Failed to load gradebook"))
      .finally(() => setLoading(false));
  }, [refreshKey]);

  const assignments = data?.assignments ?? [];
  const rows = data?.rows ?? [];

  return (
    <TeacherShell section="gradebook">
      <div className="page stack">
        <div className="section-header">
          <h1 className="page-title">Gradebook</h1>
          <button
            className="button secondary"
            style={{ padding: "8px 10px", lineHeight: 1 }}
            type="button"
            title="Refresh"
            onClick={() => setRefreshKey((k) => k + 1)}
          >
            <svg fill="none" height="16" viewBox="0 0 24 24" width="16"><path d="M4 12a8 8 0 0 1 14.93-4H15v2h7V3h-2v3.1A9.97 9.97 0 0 0 2 12h2Zm16 0a8 8 0 0 1-14.93 4H9v-2H2v7h2v-3.1A9.97 9.97 0 0 0 22 12h-2Z" fill="currentColor"/></svg>
          </button>
        </div>

        {loading && <div className="muted">Loading gradebook...</div>}

        {!loading && assignments.length === 0 && (
          <div className="card muted" style={{ padding: 24 }}>No assignments or submissions yet.</div>
        )}

        {!loading && assignments.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--border)" }}>
                  <th style={{ textAlign: "left", padding: "10px 14px", fontWeight: 700, minWidth: 180 }}>Student</th>
                  {assignments.map((a) => (
                    <th key={a.id} style={{ textAlign: "center", padding: "10px 12px", fontWeight: 600, minWidth: 110, color: "#44516d" }}>
                      <div style={{ maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={a.title}>{a.title}</div>
                      <div style={{ fontWeight: 400, color: "#9aaabf", fontSize: "0.8rem" }}>/{a.maxScore}</div>
                    </th>
                  ))}
                  <th style={{ textAlign: "center", padding: "10px 12px", fontWeight: 700, minWidth: 100, borderLeft: "2px solid var(--border)" }}>
                    Grand Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.student.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "10px 14px" }}>
                      <div style={{ fontWeight: 700 }}>{row.student.fullName}</div>
                      <div style={{ fontSize: "0.8rem", color: "#9aaabf" }}>{row.student.email.endsWith("@historical.reviewai.local") ? "—" : row.student.email}</div>
                    </td>
                    {assignments.map((a) => {
                      const cell = row.scores[a.id];
                      return (
                        <td key={a.id} style={{ textAlign: "center", padding: "10px 12px" }}>
                          {cell?.submissionId ? (
                            <Link to={`/teacher/review/${cell.submissionId}`} style={{ textDecoration: "none" }}>
                              {statusDot(cell)}
                            </Link>
                          ) : statusDot(cell)}
                        </td>
                      );
                    })}
                    <td style={{ textAlign: "center", padding: "10px 12px", borderLeft: "2px solid var(--border)", fontWeight: 700 }}>
                      {row.grandMaxTotal > 0 ? (
                        <span style={{ color: scoreColor(row.grandTotal, row.grandMaxTotal) }}>
                          {row.grandTotal}
                          <span style={{ color: "#b0bac9", fontWeight: 400 }}>/{row.grandMaxTotal}</span>
                        </span>
                      ) : (
                        <span style={{ color: "#b0bac9" }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </TeacherShell>
  );
}
