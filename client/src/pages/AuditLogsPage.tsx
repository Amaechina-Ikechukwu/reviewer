import { useEffect, useState } from "react";
import TeacherShell from "../components/TeacherShell";
import { api } from "../api";

type AuditLog = {
  id: string;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
};

function actionLabel(action: string) {
  if (action.startsWith("POST ") || action.startsWith("GET ") || action.startsWith("PATCH ") || action.startsWith("DELETE ") || action.startsWith("ERROR ")) {
    return action;
  }
  const labels: Record<string, string> = {
    "review.run": "AI Review run",
    "review.grade_released": "Grade released",
    "student.updated": "Student edited",
    "student.deleted": "Student deleted",
    "student.password_reset": "Password reset sent",
    "student.merged": "Students merged",
    "submission.created": "Submission received",
    "auth.register": "Account registered",
    "auth.login": "Login",
    "auth.login_failed": "Login failed",
    "auth.invite_accepted": "Invite accepted",
  };
  return labels[action] ?? action;
}

function actionColor(action: string): string {
  if (action.includes("ERROR") || action.includes("failed") || action.includes("api_error")) return "#d62828";
  if (action.includes("grade_released") || action.includes("api_success")) return "#1a8a4a";
  if (action.includes("review") || action.includes("submission")) return "#0d56d8";
  if (action.includes("login") || action.includes("register") || action.includes("invite")) return "#0d9488";
  if (action.includes("deleted")) return "#b91c1c";
  if (action.includes("password_reset") || action.includes("merged")) return "#b45309";
  if (action.includes("updated")) return "#7c3aed";
  return "#44516d";
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<AuditLog[]>("/audit-logs?limit=200")
      .then(setLogs)
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <TeacherShell section="dashboard">
      <div className="page stack">
        <div className="section-header">
          <h1 className="page-title">Activity Log</h1>
          <span className="muted" style={{ fontSize: "0.9rem" }}>{logs.length} recent events</span>
        </div>

        <div className="card table-card">
          <div className="table-head" style={{ gridTemplateColumns: "1.2fr 1fr 0.8fr 1.2fr 0.9fr" }}>
            <span>Action</span>
            <span>Actor</span>
            <span>Target</span>
            <span>Details</span>
            <span>When</span>
          </div>

          {loading && (
            <div className="table-row" style={{ gridTemplateColumns: "1fr" }}>
              <span className="muted">Loading...</span>
            </div>
          )}

          {!loading && logs.length === 0 && (
            <div className="table-row" style={{ gridTemplateColumns: "1fr" }}>
              <span className="muted">No activity recorded yet.</span>
            </div>
          )}

          {logs.map((log) => (
            <div className="table-row" key={log.id} style={{ gridTemplateColumns: "1.2fr 1fr 0.8fr 1.2fr 0.9fr" }}>
              <span
                style={{
                  fontWeight: 600,
                  fontSize: "0.9rem",
                  color: actionColor(log.action),
                }}
              >
                {actionLabel(log.action)}
              </span>
              <span className="muted" style={{ fontSize: "0.88rem" }}>
                {log.actorEmail ?? "System"}
              </span>
              <span className="muted" style={{ fontSize: "0.82rem", fontFamily: "monospace" }}>
                {log.targetType && log.targetId
                  ? `${log.targetType}/${log.targetId.slice(0, 8)}`
                  : "—"}
              </span>
              <span className="muted" style={{ fontSize: "0.82rem" }}>
                {log.details
                  ? Object.entries(log.details)
                      .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
                      .join(" · ")
                  : "—"}
              </span>
              <span className="muted" style={{ fontSize: "0.82rem" }}>
                {new Date(log.createdAt).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </TeacherShell>
  );
}
