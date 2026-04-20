import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import TeacherShell from "../components/TeacherShell";
import { toast } from "../components/Toast";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Icon } from "../components/ui/Icons";
import { PageHeader } from "../components/ui/PageHeader";
import { api } from "../api";
import { cn } from "../lib/cn";

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

function scoreTone(score: number, maxScore: number) {
  const pct = maxScore > 0 ? score / maxScore : 0;
  if (pct >= 0.8) return "text-[var(--success)]";
  if (pct >= 0.6) return "text-[var(--warn)]";
  return "text-[var(--danger)]";
}

function Cell({ cell }: { cell: ScoreCell }) {
  if (!cell) return <span className="text-[var(--fg-subtle)]">—</span>;
  if (cell.score === null) {
    if (cell.status === "completed") return <span className="text-[11px] text-[var(--warn)]">reviewed</span>;
    if (cell.status === "reviewing") return <span className="text-[11px] text-[var(--accent)]">reviewing</span>;
    return <span className="text-[11px] text-[var(--fg-muted)]">submitted</span>;
  }
  return (
    <span className={cn("text-sm font-semibold tabular-nums", scoreTone(cell.score, cell.maxScore ?? 100))}>
      {cell.score}
      <span className="text-[var(--fg-subtle)] font-normal">/{cell.maxScore}</span>
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
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Gradebook"
          description="Scores across every student and assignment."
          actions={
            <Button variant="secondary" size="sm" onClick={() => setRefreshKey((k) => k + 1)}>
              <Icon.Refresh className="h-3.5 w-3.5" />
              Refresh
            </Button>
          }
        />

        {loading && <div className="text-sm text-[var(--fg-muted)]">Loading gradebook...</div>}

        {!loading && assignments.length === 0 && (
          <Card className="p-10 text-center text-sm text-[var(--fg-muted)]">
            No assignments or submissions yet.
          </Card>
        )}

        {!loading && assignments.length > 0 && (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[var(--surface-muted)]">
                  <tr className="border-b border-[var(--border)]">
                    <th className="sticky left-0 z-10 bg-[var(--surface-muted)] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-muted)]">
                      Student
                    </th>
                    {assignments.map((a) => (
                      <th key={a.id} className="min-w-[120px] px-3 py-3 text-center font-medium">
                        <div className="truncate text-xs text-[var(--fg)]" title={a.title}>{a.title}</div>
                        <div className="text-[10px] font-normal text-[var(--fg-subtle)]">/{a.maxScore}</div>
                      </th>
                    ))}
                    <th className="border-l-2 border-[var(--border)] bg-[var(--surface-muted)] px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-[var(--fg)]">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {rows.map((row) => (
                    <tr key={row.student.id} className="transition-colors hover:bg-[var(--surface-muted)]/40">
                      <td className="sticky left-0 z-10 bg-[var(--surface)] px-4 py-3">
                        <div className="font-medium text-[var(--fg)]">{row.student.fullName}</div>
                        <div className="text-[11px] text-[var(--fg-muted)]">
                          {row.student.email.endsWith("@historical.reviewai.local") ? "—" : row.student.email}
                        </div>
                      </td>
                      {assignments.map((a) => {
                        const cell = row.scores[a.id];
                        return (
                          <td key={a.id} className="px-3 py-3 text-center">
                            {cell?.submissionId ? (
                              <Link to={`/teacher/review/${cell.submissionId}`} className="hover:underline">
                                <Cell cell={cell} />
                              </Link>
                            ) : (
                              <Cell cell={cell} />
                            )}
                          </td>
                        );
                      })}
                      <td className="border-l-2 border-[var(--border)] px-3 py-3 text-center font-semibold tabular-nums">
                        {row.grandMaxTotal > 0 ? (
                          <span className={scoreTone(row.grandTotal, row.grandMaxTotal)}>
                            {row.grandTotal}
                            <span className="text-[var(--fg-subtle)] font-normal">/{row.grandMaxTotal}</span>
                          </span>
                        ) : (
                          <span className="text-[var(--fg-subtle)]">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </TeacherShell>
  );
}
