import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { deleteSubmission, getAssignmentRoster, markAssignmentDone, unmarkAssignment } from "../api";
import { cn } from "../lib/cn";
import { formatDateTime } from "../lib/format";
import { toast } from "./Toast";
import { useAuth } from "../context/AuthContext";
import { Avatar } from "./ui/Avatar";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";
import { Card, CardHeader, CardTitle } from "./ui/Card";
import { Icon } from "./ui/Icons";
import { Input } from "./ui/Input";
import { Table, TBody, TD, TH, THead, TR, EmptyRow } from "./ui/Table";
import { hasPermission, type RosterRow } from "../types";

type Filter = "all" | "outstanding" | "submitted" | "graded";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "Everyone" },
  { value: "outstanding", label: "Not marked" },
  { value: "submitted", label: "Submitted" },
  { value: "graded", label: "Marked" },
];

/** A student counts as handled once someone has put a grade or a tick on them. */
function isMarked(row: RosterRow) {
  return row.score !== null || row.markedDone || row.reviewStatus === "completed";
}

function matchesFilter(row: RosterRow, filter: Filter) {
  if (filter === "submitted") return !!row.submissionId && row.submissionType !== "manual";
  if (filter === "graded") return isMarked(row);
  if (filter === "outstanding") return !isMarked(row);
  return true;
}

function StatusCell({ row }: { row: RosterRow }) {
  if (row.score !== null) {
    return (
      <Badge tone="success" dot>
        {row.scoredByTeacher ? "Graded" : "AI reviewed"}
      </Badge>
    );
  }
  if (row.markedDone) return <Badge tone="success" dot>Done</Badge>;
  if (row.reviewStatus === "reviewing") return <Badge tone="info" dot>Reviewing</Badge>;
  if (row.reviewStatus === "failed") return <Badge tone="danger" dot>Review failed</Badge>;
  if (row.submissionId) return <Badge tone="accent" dot>Submitted</Badge>;
  return <Badge tone="neutral" dot>Not submitted</Badge>;
}

/**
 * The grading surface for an assignment: every student it was set for, whether
 * or not anything was handed in. Work assessed in person — handwritten, a
 * presentation, an oral or practical — is graded here with full marks or a
 * score, stored on the same submission record the AI review path uses.
 */
export default function AssignmentRoster({
  assignmentId,
  onChanged,
}: {
  assignmentId: string;
  onChanged?: () => void;
}) {
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [maxScore, setMaxScore] = useState(100);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkScore, setBulkScore] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const { user } = useAuth();
  // Someone without grading access still sees the roster, just read-only.
  const canGrade = hasPermission(user, "grades.edit");
  const canDeleteSubmissions = hasPermission(user, "submissions.manage");

  const load = useCallback(async () => {
    try {
      const result = await getAssignmentRoster(assignmentId);
      setRows(result.students);
      setMaxScore(result.maxScore);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the roster");
    } finally {
      setLoading(false);
    }
  }, [assignmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter(
      (row) =>
        matchesFilter(row, filter) &&
        (!needle ||
          row.fullName.toLowerCase().includes(needle) ||
          row.email.toLowerCase().includes(needle) ||
          (row.groupName || "").toLowerCase().includes(needle)),
    );
  }, [rows, filter, query]);

  const markedCount = rows.filter(isMarked).length;
  const selectedVisible = visible.filter((row) => selected.has(row.studentId));
  const allVisibleSelected = visible.length > 0 && selectedVisible.length === visible.length;

  function toggle(studentId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelected((current) => {
      const next = new Set(current);
      if (allVisibleSelected) visible.forEach((row) => next.delete(row.studentId));
      else visible.forEach((row) => next.add(row.studentId));
      return next;
    });
  }

  /** An empty score box means "done" — and done is worth full marks. */
  async function submitMark(studentIds: string[], rawScore: string, busyKey: string) {
    const trimmed = rawScore.trim();
    const score = trimmed === "" ? maxScore : Number(trimmed);
    if (!Number.isFinite(score) || score < 0 || score > maxScore) {
      toast().error(`Enter a score between 0 and ${maxScore}.`);
      return;
    }

    setBusy(busyKey);
    try {
      await markAssignmentDone(assignmentId, { studentIds, score });
      const who = studentIds.length === 1 ? "1 student" : `${studentIds.length} students`;
      toast().success(`Marked ${who} ${score}/${maxScore}`);
      await load();
      onChanged?.();
    } catch (err) {
      toast().error(err instanceof Error ? err.message : "Could not save the mark");
    } finally {
      setBusy(null);
    }
  }

  async function undo(row: RosterRow) {
    setBusy(row.studentId);
    try {
      await unmarkAssignment(assignmentId, row.studentId);
      setDrafts((current) => ({ ...current, [row.studentId]: "" }));
      toast().success(`Cleared the mark for ${row.fullName}`);
      await load();
      onChanged?.();
    } catch (err) {
      toast().error(err instanceof Error ? err.message : "Could not undo the mark");
    } finally {
      setBusy(null);
    }
  }

  async function removeSubmission(row: RosterRow) {
    if (!row.submissionId) return;
    if (!confirm(`Delete ${row.fullName}'s submission? They will be able to resubmit.`)) return;
    setBusy(row.studentId);
    try {
      await deleteSubmission(row.submissionId);
      toast().success("Submission deleted");
      await load();
      onChanged?.();
    } catch (err) {
      toast().error(err instanceof Error ? err.message : "Could not delete the submission");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-col items-stretch gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>
            Grading ({markedCount}/{rows.length} marked)
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Icon.Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--fg-subtle)]" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find a student"
                className="h-8 w-44 pl-8 text-xs"
              />
            </div>
            <Button variant="ghost" size="sm" onClick={() => void load()} title="Refresh">
              <Icon.Refresh className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setFilter(option.value)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                filter === option.value
                  ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "text-[var(--fg-muted)] hover:bg-[var(--surface-muted)]",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        {canGrade && selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)]/50 px-3 py-2">
            <span className="text-xs font-medium">{selected.size} selected</span>
            <Input
              type="number"
              min={0}
              max={maxScore}
              value={bulkScore}
              onChange={(event) => setBulkScore(event.target.value)}
              placeholder={`Score /${maxScore}`}
              className="h-8 w-28 text-xs"
            />
            <Button
              size="sm"
              loading={busy === "bulk"}
              onClick={() => void submitMark([...selected], bulkScore, "bulk")}
            >
              <Icon.Check className="h-3.5 w-3.5" />
              {bulkScore.trim() ? "Save score" : `Full mark (${maxScore})`}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        )}
      </CardHeader>

      {error ? (
        <div className="px-4 py-6 text-sm text-[var(--danger)]">{error}</div>
      ) : (
        <Table>
          <THead>
            <TR>
              {canGrade && <TH className="w-8">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleAllVisible}
                  aria-label="Select all"
                  className="h-3.5 w-3.5 accent-[var(--accent)]"
                />
              </TH>}
              <TH>Student</TH>
              <TH>Status</TH>
              <TH>Submitted</TH>
              <TH className="w-44">Score</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {loading && <EmptyRow cols={6}>Loading roster…</EmptyRow>}
            {!loading && visible.length === 0 && (
              <EmptyRow cols={6}>
                {rows.length === 0
                  ? "No students are assigned to this assignment yet."
                  : "No students match this filter."}
              </EmptyRow>
            )}
            {!loading &&
              visible.map((row) => {
                const draft = drafts[row.studentId] ?? (row.score !== null ? String(row.score) : "");
                const rowBusy = busy === row.studentId;
                const hasFiles = !!row.submissionId && row.submissionType !== "manual";

                return (
                  <TR key={row.studentId}>
                    {canGrade && (
                      <TD>
                        <input
                          type="checkbox"
                          checked={selected.has(row.studentId)}
                          onChange={() => toggle(row.studentId)}
                          aria-label={`Select ${row.fullName}`}
                          className="h-3.5 w-3.5 accent-[var(--accent)]"
                        />
                      </TD>
                    )}
                    <TD label="Student">
                      <div className="flex items-center gap-3">
                        <Avatar name={row.fullName} size="sm" />
                        <div className="min-w-0">
                          <div className="truncate font-medium">{row.fullName}</div>
                          <div className="truncate text-xs text-[var(--fg-muted)]">
                            {row.groupName ? `${row.groupName} · ${row.email}` : row.email}
                          </div>
                        </div>
                      </div>
                    </TD>
                    <TD label="Status">
                      <StatusCell row={row} />
                    </TD>
                    <TD label="Submitted" className="text-xs text-[var(--fg-muted)]">
                      {row.submissionId ? (
                        <span className="inline-flex items-center gap-1.5">
                          {row.submissionType === "manual"
                            ? "Marked by instructor"
                            : formatDateTime(row.submittedAt || "")}
                          {row.isLate && <Badge tone="warn">Late</Badge>}
                          {row.viaGroup && <Badge tone="neutral">Team</Badge>}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TD>
                    <TD label="Score">
                      {!canGrade ? (
                        <span className="text-sm tabular-nums">
                          {row.score === null ? "—" : `${row.score}/${row.maxScore || maxScore}`}
                        </span>
                      ) : (
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="number"
                          min={0}
                          max={maxScore}
                          value={draft}
                          onChange={(event) =>
                            setDrafts((current) => ({ ...current, [row.studentId]: event.target.value }))
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Enter") void submitMark([row.studentId], draft, row.studentId);
                          }}
                          placeholder={`/${maxScore}`}
                          className="h-8 w-20 text-xs"
                        />
                        <span className="text-xs text-[var(--fg-subtle)]">/{row.maxScore || maxScore}</span>
                      </div>
                      )}
                    </TD>
                    <TD label="Actions" className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {canGrade && (
                          <Button
                            variant={draft.trim() ? "primary" : "secondary"}
                            size="sm"
                            loading={rowBusy}
                            onClick={() => void submitMark([row.studentId], draft, row.studentId)}
                            title={draft.trim() ? "Save this score" : `Mark done — full marks (${maxScore})`}
                          >
                            <Icon.Check className="h-3.5 w-3.5" />
                            {draft.trim() ? "Save" : "Full mark"}
                          </Button>
                        )}
                        {hasFiles && (
                          <Link to={`/teacher/review/${row.submissionId}`}>
                            <Button variant="ghost" size="sm">
                              {row.reviewStatus === "completed" ? "View" : "Review"}
                              <Icon.ChevronRight className="h-3.5 w-3.5" />
                            </Button>
                          </Link>
                        )}
                        {canGrade && isMarked(row) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={rowBusy}
                            onClick={() => void undo(row)}
                            title="Clear this mark"
                          >
                            <Icon.X className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {hasFiles && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={rowBusy}
                            onClick={() => void removeSubmission(row)}
                            title="Delete submission"
                            className="text-[var(--danger)] hover:text-[var(--danger)]"
                          >
                            <Icon.Trash className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TD>
                  </TR>
                );
              })}
          </TBody>
        </Table>
      )}
    </Card>
  );
}
