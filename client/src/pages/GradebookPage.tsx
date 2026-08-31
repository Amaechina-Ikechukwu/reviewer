import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Select } from "../components/ui/Input";
import TeacherShell from "../components/TeacherShell";
import { toast } from "../components/Toast";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Icon } from "../components/ui/Icons";
import { PageHeader } from "../components/ui/PageHeader";
import { api } from "../api";
import { cn } from "../lib/cn";
import { useAuth } from "../context/AuthContext";
import { hasPermission } from "../types";

type GradebookAssignment = { id: string; title: string; maxScore: number };

type ScoreCell = {
  score: number | null;
  maxScore: number | null;
  status: string;
  submissionId: string;
} | null;

type GradebookRow = {
  student: { id: string; fullName: string; email: string; cohortId: string | null };
  scores: Record<string, ScoreCell>;
  grandTotal: number;
  grandMaxTotal: number;
};

type GradebookData = {
  assignments: GradebookAssignment[];
  rows: GradebookRow[];
  cohorts?: import("../types").Cohort[];
};

function scoreTone(score: number, maxScore: number) {
  const pct = maxScore > 0 ? score / maxScore : 0;
  if (pct >= 0.8) return "text-[var(--success)]";
  if (pct >= 0.6) return "text-[var(--warn)]";
  return "text-[var(--danger)]";
}

type SortKey = "student" | "total" | string;

function SortHeader({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
  className,
}: {
  label: ReactNode;
  sortKey: SortKey;
  activeKey: SortKey;
  dir: "asc" | "desc";
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = activeKey === sortKey;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={cn(
        "inline-flex w-full items-center gap-1 text-left transition-colors hover:text-[var(--fg)]",
        active ? "text-[var(--fg)]" : "text-[var(--fg-muted)]",
        className,
      )}
    >
      {label}
      <Icon.ChevronDown
        className={cn(
          "h-3 w-3 shrink-0 transition-transform",
          active ? "opacity-100" : "opacity-30",
          active && dir === "asc" ? "rotate-180" : "",
        )}
      />
    </button>
  );
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
  const { user } = useAuth();
  const [data, setData] = useState<GradebookData | null>(null);
  const [cohorts, setCohorts] = useState<import("../types").Cohort[]>([]);
  const [selectedCohortId, setSelectedCohortId] = useState("all");
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>("student");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const canEditGrades = hasPermission(user, "grades.edit");

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Names read naturally A-Z; scores read naturally highest-first.
      setSortDir(key === "student" ? "asc" : "desc");
    }
  }

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api<GradebookData>("/gradebook"),
      api<import("../types").Cohort[]>("/cohorts").catch(() => []),
    ])
      .then(([gradebookData, cohortsData]) => {
        setData(gradebookData);
        const combinedCohorts = (gradebookData.cohorts && gradebookData.cohorts.length > 0)
          ? gradebookData.cohorts
          : cohortsData;
        setCohorts(combinedCohorts);
      })
      .catch(() => toast().error("Failed to load gradebook"))
      .finally(() => setLoading(false));
  }, [refreshKey]);

  const assignments = data?.assignments ?? [];
  const rows = data?.rows ?? [];

  const displayRows = selectedCohortId === "all"
    ? rows
    : rows.filter((r) => r.student.cohortId === selectedCohortId);

  const displayAssignments = assignments.filter((a) => {
    return displayRows.some((row) => row.scores[a.id] !== undefined);
  });

  const sortedRows = useMemo(() => {
    const withRank = [...displayRows];
    withRank.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "student") {
        cmp = a.student.fullName.localeCompare(b.student.fullName);
      } else if (sortKey === "total") {
        const pa = a.grandMaxTotal > 0 ? a.grandTotal / a.grandMaxTotal : -1;
        const pb = b.grandMaxTotal > 0 ? b.grandTotal / b.grandMaxTotal : -1;
        cmp = pa - pb;
      } else {
        const sa = a.scores[sortKey]?.score;
        const sb = b.scores[sortKey]?.score;
        cmp = (typeof sa === "number" ? sa : -1) - (typeof sb === "number" ? sb : -1);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return withRank;
  }, [displayRows, sortKey, sortDir]);

  return (
    <TeacherShell section="gradebook">
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Gradebook"
          description="Scores across every student and assignment."
          actions={
            <div className="flex items-center gap-3">
              {!canEditGrades && (
                <Badge tone="neutral" className="px-2.5 py-1 text-xs">
                  Read-only view
                </Badge>
              )}
              <Select
                value={selectedCohortId}
                onChange={(e) => setSelectedCohortId(e.target.value)}
                className="w-48"
              >
                <option value="all">All cohorts ({rows.length} students)</option>
                {cohorts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
              <Button variant="secondary" size="sm" onClick={() => setRefreshKey((k) => k + 1)}>
                <Icon.Refresh className="h-3.5 w-3.5" />
                Refresh
              </Button>
            </div>
          }
        />

        {loading && <div className="text-sm text-[var(--fg-muted)]">Loading gradebook...</div>}

        {!loading && displayAssignments.length === 0 && (
          <Card className="p-10 text-center text-sm text-[var(--fg-muted)]">
            No assignments or submissions found for this cohort.
          </Card>
        )}

        {!loading && displayAssignments.length > 0 && (
          <Card className="overflow-hidden">
            <div className="max-h-[70vh] overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="sticky left-0 top-0 z-30 bg-[var(--surface-muted)] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider">
                      <SortHeader label="Student" sortKey="student" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                    </th>
                    {displayAssignments.map((a) => (
                      <th key={a.id} className="sticky top-0 z-20 min-w-[120px] bg-[var(--surface-muted)] px-3 py-3 text-center font-medium">
                        <SortHeader
                          label={
                            <span className="min-w-0 flex-1">
                              <div className="truncate text-xs text-[var(--fg)]" title={a.title}>{a.title}</div>
                              <div className="text-[10px] font-normal text-[var(--fg-subtle)]">/{a.maxScore}</div>
                            </span>
                          }
                          sortKey={a.id}
                          activeKey={sortKey}
                          dir={sortDir}
                          onSort={toggleSort}
                          className="justify-center"
                        />
                      </th>
                    ))}
                    <th className="sticky top-0 z-20 border-l-2 border-[var(--border)] bg-[var(--surface-muted)] px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-[var(--fg)]">
                      <SortHeader label="Total" sortKey="total" activeKey={sortKey} dir={sortDir} onSort={toggleSort} className="justify-center" />
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {sortedRows.map((row) => (
                    <tr key={row.student.id} className="transition-colors hover:bg-[var(--surface-muted)]/40">
                      <td className="sticky left-0 z-10 bg-[var(--surface)] px-4 py-3">
                        <div className="font-medium text-[var(--fg)]">{row.student.fullName}</div>
                        <div className="text-[11px] text-[var(--fg-muted)]">
                          {row.student.email.endsWith("@historical.reviewai.local") ? "—" : row.student.email}
                        </div>
                      </td>
                      {displayAssignments.map((a) => {
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
