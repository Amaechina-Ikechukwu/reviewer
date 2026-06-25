import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import TeacherShell from "../components/TeacherShell";
import { toast } from "../components/Toast";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icons";
import type { StudentRecord, Track } from "../types";
import { TRACKS } from "../types";
import { formatDate } from "../lib/format";

type StudentWithPending = StudentRecord & { pending?: boolean };

type GradebookAssignment = { id: string; title: string; maxScore: number; isGroupAssignment: boolean };

type ScoreEntry = { score: number | null; maxScore: number; submissionId: string; status?: string } | null;

type GradebookRow = {
  student: { id: string; fullName: string; email: string };
  scores: Record<string, ScoreEntry>;
  grandTotal: number;
  grandMaxTotal: number;
};

type GradebookData = {
  assignments: GradebookAssignment[];
  rows: GradebookRow[];
};

const TRACK_COLORS: Record<Track, string> = {
  frontend: "bg-blue-100 text-blue-700",
  backend: "bg-green-100 text-green-700",
  data_analytics: "bg-purple-100 text-purple-700",
  product_design: "bg-pink-100 text-pink-700",
  digital_marketing: "bg-orange-100 text-orange-700",
  cyber_security: "bg-red-100 text-red-700",
};

function scoreColor(pct: number | null) {
  if (pct === null) return "text-[var(--fg-subtle)]";
  if (pct >= 70) return "text-green-600 dark:text-green-400";
  if (pct >= 50) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

export default function StudentProfilePage() {
  const { studentId } = useParams<{ studentId: string }>();
  const navigate = useNavigate();

  const [student, setStudent] = useState<StudentWithPending | null>(null);
  const [cohortName, setCohortName] = useState<string | null>(null);
  const [gradebook, setGradebook] = useState<GradebookData | null>(null);
  const [perfRow, setPerfRow] = useState<GradebookRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!studentId) return;
    Promise.all([
      api<StudentWithPending[]>("/students"),
      api<GradebookData>("/gradebook"),
    ])
      .then(([students, gb]) => {
        const found = students.find((s) => s.id === studentId) ?? null;
        setStudent(found);
        setGradebook(gb);
        if (found) {
          const row = gb.rows.find((r) => r.student.id === studentId) ?? null;
          setPerfRow(row);
        }
      })
      .catch(() => toast().error("Failed to load student data"))
      .finally(() => setLoading(false));
  }, [studentId]);

  // Load cohort name separately if student has one
  useEffect(() => {
    if (!student?.cohortId) return;
    api<{ name: string }>(`/cohorts/${student.cohortId}`)
      .then((c) => setCohortName(c.name))
      .catch(() => {});
  }, [student?.cohortId]);

  if (loading) {
    return (
      <TeacherShell section="students">
        <p className="text-sm text-[var(--fg-muted)]">Loading…</p>
      </TeacherShell>
    );
  }

  if (!student) {
    return (
      <TeacherShell section="students">
        <p className="text-sm text-[var(--fg-muted)]">Student not found.</p>
      </TeacherShell>
    );
  }

  const overallPct =
    perfRow && perfRow.grandMaxTotal > 0
      ? Math.round((perfRow.grandTotal / perfRow.grandMaxTotal) * 100)
      : null;

  const submittedCount = perfRow
    ? Object.values(perfRow.scores).filter((s) => s !== null).length
    : 0;

  const totalAssignments = perfRow
    ? Object.values(perfRow.scores).filter((s) => s !== undefined).length
    : 0;

  const trackLabel = student.track ? TRACKS.find((t) => t.value === student.track)?.label : null;

  return (
    <TeacherShell section="students">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        {/* Back */}
        <Link
          to="/teacher/students"
          className="inline-flex items-center gap-1 text-xs font-medium text-[var(--fg-muted)] hover:text-[var(--accent)]"
        >
          <Icon.ChevronLeft className="h-3 w-3" />
          All students
        </Link>

        {/* Profile header */}
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/10 text-xl font-bold text-[var(--accent)]">
                {student.fullName.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-lg font-semibold text-[var(--fg)]">{student.fullName}</h1>
                  {student.pending && (
                    <span className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--fg-subtle)]">
                      Invite pending
                    </span>
                  )}
                  {trackLabel && student.track && (
                    <span className={`rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${TRACK_COLORS[student.track as Track]}`}>
                      {trackLabel}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-sm text-[var(--fg-muted)]">{student.email}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-[var(--fg-subtle)]">
                  <span>Joined {formatDate(student.createdAt)}</span>
                  {cohortName && (
                    <span className="flex items-center gap-1">
                      <Icon.Layers className="h-3 w-3" />
                      {cohortName}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Overall score */}
            {overallPct !== null && (
              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-5 py-3 text-center">
                <div className={`text-3xl font-bold ${scoreColor(overallPct)}`}>{overallPct}%</div>
                <div className="mt-0.5 text-xs text-[var(--fg-muted)]">overall score</div>
                <div className="mt-0.5 text-xs text-[var(--fg-subtle)]">
                  {perfRow!.grandTotal}/{perfRow!.grandMaxTotal} pts
                </div>
              </div>
            )}
          </div>

          {/* Stats row */}
          <div className="mt-4 grid grid-cols-3 gap-3 border-t border-[var(--border)] pt-4">
            <div className="text-center">
              <div className="text-xl font-bold text-[var(--fg)]">{submittedCount}</div>
              <div className="text-xs text-[var(--fg-muted)]">submissions</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-[var(--fg)]">{totalAssignments - submittedCount}</div>
              <div className="text-xs text-[var(--fg-muted)]">missing</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-[var(--fg)]">{totalAssignments}</div>
              <div className="text-xs text-[var(--fg-muted)]">total assignments</div>
            </div>
          </div>
        </div>

        {/* Assignment performance */}
        <div>
          <h2 className="mb-3 text-sm font-semibold text-[var(--fg)]">Assignment performance</h2>
          {!gradebook || gradebook.assignments.length === 0 ? (
            <div className="rounded border border-dashed border-[var(--border)] py-10 text-center text-sm text-[var(--fg-muted)]">
              No assignments yet.
            </div>
          ) : (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] divide-y divide-[var(--border)]">
              {/* Header */}
              <div className="grid grid-cols-[1fr_80px_80px_80px] gap-2 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--fg-subtle)]">
                <span>Assignment</span>
                <span className="text-right">Score</span>
                <span className="text-right">Out of</span>
                <span className="text-right">Grade</span>
              </div>

              {gradebook.assignments
                .filter((a) => !perfRow || perfRow.scores[a.id] !== undefined)
                .map((a) => {
                const s = perfRow?.scores[a.id] ?? null;
                const score = s?.score ?? null;
                const pct = score !== null && a.maxScore > 0
                  ? Math.round((score / a.maxScore) * 100)
                  : null;

                return (
                  <div
                    key={a.id}
                    className="grid grid-cols-[1fr_80px_80px_80px] items-center gap-2 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm text-[var(--fg)]">{a.title}</div>
                      {a.isGroupAssignment && (
                        <div className="mt-0.5 flex items-center gap-1 text-[11px] text-[var(--fg-subtle)]">
                          <Icon.Users className="h-3 w-3" />
                          Group project
                        </div>
                      )}
                    </div>
                    <div className="text-right text-sm font-medium text-[var(--fg)]">
                      {score !== null ? score : "—"}
                    </div>
                    <div className="text-right text-sm text-[var(--fg-muted)]">
                      {a.maxScore}
                    </div>
                    <div className={`text-right text-sm font-semibold ${scoreColor(pct)}`}>
                      {pct !== null ? `${pct}%` : (
                        <span className="text-xs font-normal text-[var(--fg-subtle)]">No sub.</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </TeacherShell>
  );
}
