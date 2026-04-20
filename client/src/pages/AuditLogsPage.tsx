import { useEffect, useState } from "react";
import TeacherShell from "../components/TeacherShell";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Icon } from "../components/ui/Icons";
import { PageHeader } from "../components/ui/PageHeader";
import { Table, TBody, TD, TH, THead, TR, EmptyRow } from "../components/ui/Table";
import { api } from "../api";
import { formatDateTime } from "../lib/format";

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

type Tone = "neutral" | "accent" | "success" | "warn" | "danger" | "info";

function actionLabel(action: string) {
  if (/^(POST|GET|PATCH|DELETE|ERROR) /.test(action)) return action;
  const labels: Record<string, string> = {
    "review.run": "AI review run",
    "review.grade_released": "Grade released",
    "student.updated": "Student edited",
    "student.deleted": "Student deleted",
    "student.password_reset": "Password reset sent",
    "student.merged": "Students merged",
    "submission.created": "Submission received",
    "submission.created_by_teacher": "Submitted by teacher",
    "auth.register": "Account registered",
    "auth.login": "Login",
    "auth.login_failed": "Login failed",
    "auth.invite_accepted": "Invite accepted",
  };
  return labels[action] ?? action;
}

function actionTone(action: string): Tone {
  if (action.includes("ERROR") || action.includes("failed") || action.includes("api_error")) return "danger";
  if (action.includes("grade_released") || action.includes("api_success")) return "success";
  if (action.includes("review") || action.includes("submission")) return "info";
  if (action.includes("login") || action.includes("register") || action.includes("invite")) return "accent";
  if (action.includes("deleted")) return "danger";
  if (action.includes("password_reset") || action.includes("merged")) return "warn";
  if (action.includes("updated")) return "accent";
  return "neutral";
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    api<AuditLog[]>("/audit-logs?limit=200")
      .then(setLogs)
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, [refreshKey]);

  return (
    <TeacherShell section="logs">
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Activity"
          description="Everything that happens in your workspace — auth, submissions, reviews, grades."
          actions={
            <>
              <Badge tone="neutral">{logs.length} events</Badge>
              <Button variant="secondary" size="sm" onClick={() => setRefreshKey((k) => k + 1)}>
                <Icon.Refresh className="h-3.5 w-3.5" />
                Refresh
              </Button>
            </>
          }
        />

        <Card>
          <Table>
            <THead>
              <TR>
                <TH>Action</TH>
                <TH>Actor</TH>
                <TH>Target</TH>
                <TH>Details</TH>
                <TH>When</TH>
              </TR>
            </THead>
            <TBody>
              {loading && <EmptyRow cols={5}>Loading activity...</EmptyRow>}
              {!loading && logs.length === 0 && <EmptyRow cols={5}>No activity recorded yet.</EmptyRow>}
              {logs.map((log) => (
                <TR key={log.id}>
                  <TD label="Action">
                    <Badge tone={actionTone(log.action)} dot>{actionLabel(log.action)}</Badge>
                  </TD>
                  <TD label="Actor" className="text-xs text-[var(--fg-muted)]">{log.actorEmail ?? "System"}</TD>
                  <TD label="Target" className="font-mono text-[11px] text-[var(--fg-muted)]">
                    {log.targetType && log.targetId ? `${log.targetType}/${log.targetId.slice(0, 8)}` : "—"}
                  </TD>
                  <TD label="Details" className="text-xs text-[var(--fg-muted)]">
                    {log.details
                      ? Object.entries(log.details)
                          .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
                          .join(" · ")
                      : "—"}
                  </TD>
                  <TD label="When" className="whitespace-nowrap text-xs text-[var(--fg-muted)]">{formatDateTime(log.createdAt)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      </div>
    </TeacherShell>
  );
}
