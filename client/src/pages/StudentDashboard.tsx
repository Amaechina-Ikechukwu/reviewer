import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import StudentShell from "../components/StudentShell";
import { toast } from "../components/Toast";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Icon } from "../components/ui/Icons";
import { PageHeader } from "../components/ui/PageHeader";
import { api } from "../api";
import { formatRelative } from "../lib/format";
import type { Assignment, Review } from "../types";

type SubmissionRow = {
  submission: { id: string; assignmentId?: string; submittedAt: string };
  assignmentTitle: string | null;
};

function useCountdown(target: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!target) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [target]);
  if (!target) return null;
  const diff = new Date(target).getTime() - now;
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, past: true };
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  return { days, hours, minutes, past: false };
}

function MilestoneHero({ assignment }: { assignment: Assignment | null }) {
  const countdown = useCountdown(assignment?.closesAt ?? null);
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#3a3fc9] via-[#2f3cb5] to-[#1f2a8a] p-6 text-white shadow-[var(--shadow-lg)] sm:p-8">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -left-16 h-64 w-64 rounded-full bg-indigo-400/20 blur-3xl"
      />

      <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 flex-1">
          <span className="inline-flex items-center rounded-full bg-emerald-400/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-950">
            Upcoming Milestone
          </span>
          <h2 className="mt-4 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            {assignment ? assignment.title : "No upcoming assignment"}
          </h2>
          {assignment?.description ? (
            <p className="mt-2 max-w-xl text-sm text-white/75 line-clamp-2">{assignment.description}</p>
          ) : (
            <p className="mt-2 max-w-xl text-sm text-white/75">
              You're all caught up. New assignments will appear here.
            </p>
          )}

          {countdown && !countdown.past && (
            <div className="mt-6 flex items-start gap-5">
              <TimeUnit value={countdown.days} label="Days" />
              <div className="h-12 w-px bg-white/20" />
              <TimeUnit value={countdown.hours} label="Hours" />
              <div className="h-12 w-px bg-white/20" />
              <TimeUnit value={countdown.minutes} label="Minutes" />
            </div>
          )}
        </div>

        {assignment && (
          <div className="shrink-0">
            <Link
              to={`/student/submit/${assignment.id}`}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-[#2f3cb5] shadow-lg transition hover:bg-white/95 hover:shadow-xl"
            >
              Submit Project
              <Icon.Upload className="h-4 w-4" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function TimeUnit({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="text-3xl font-bold leading-none tabular-nums sm:text-4xl">
        {String(value).padStart(2, "0")}
      </div>
      <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-white/70">{label}</div>
    </div>
  );
}

const DUE_TONES = {
  urgent: "bg-[var(--danger-soft)] text-[var(--danger)]",
  soon: "bg-[var(--warn-soft)] text-[var(--warn)]",
  normal: "bg-[var(--surface-muted)] text-[var(--fg-muted)]",
} as const;

function dueTone(closesAt: string): keyof typeof DUE_TONES {
  const diff = new Date(closesAt).getTime() - Date.now();
  if (diff < 2 * 86_400_000) return "urgent";
  if (diff < 7 * 86_400_000) return "soon";
  return "normal";
}

function AssignmentRow({ assignment }: { assignment: Assignment }) {
  const tone = dueTone(assignment.closesAt);
  const iconBg =
    tone === "urgent"
      ? "bg-[var(--accent-soft)] text-[var(--accent)]"
      : "bg-[var(--surface-muted)] text-[var(--fg-muted)]";
  return (
    <Link
      to={`/student/submit/${assignment.id}`}
      className="group flex items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 transition hover:border-[var(--accent)]/50 hover:shadow-[var(--shadow-sm)]"
    >
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
        <Icon.FileCode className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-[var(--fg)]">{assignment.title}</div>
        {assignment.description && (
          <div className="mt-0.5 truncate text-xs text-[var(--fg-muted)]">{assignment.description}</div>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${DUE_TONES[tone]}`}
        >
          {formatRelative(assignment.closesAt)}
        </span>
        <div className="flex items-center gap-1.5 text-[11px] text-[var(--fg-subtle)]">
          {assignment.allowGithub && <span>GitHub</span>}
          {assignment.allowGithub && assignment.allowFileUpload && <span>•</span>}
          {assignment.allowFileUpload && <span>ZIP</span>}
        </div>
      </div>
    </Link>
  );
}

function ResultCard({ row, review }: { row: SubmissionRow; review: Review | undefined }) {
  const score = review?.teacherOverrideScore ?? review?.aiScore;
  const max = review?.maxScore ?? 100;
  const insight = review?.feedback?.summary;
  const label = row.assignmentTitle ?? "Assignment";

  return (
    <div className="relative overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)]">
      <div className="absolute left-0 top-0 h-full w-1 bg-[var(--success)]" />
      <div className="flex items-start justify-between gap-3 pl-2">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--fg-subtle)]">
            Result
          </div>
          <div className="mt-1.5 truncate text-sm font-semibold text-[var(--fg)]">{label}</div>
        </div>
        <div className="shrink-0 text-right">
          <span className="text-xl font-bold text-[var(--success)]">
            {typeof score === "number" ? score : "—"}
          </span>
          <span className="text-xs font-medium text-[var(--fg-muted)]">/{max}</span>
        </div>
      </div>
      {insight && (
        <div className="mt-3 rounded-lg bg-[var(--accent-soft)] p-3 pl-2">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--accent)]">
            <Icon.Sparkles className="h-3 w-3" />
            Scholar Insight
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[var(--fg)]">{insight}</p>
        </div>
      )}
    </div>
  );
}

export default function StudentDashboard() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [overrideIds, setOverrideIds] = useState<Set<string>>(new Set());
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [reviews, setReviews] = useState<Record<string, Review>>({});

  useEffect(() => {
    api<Assignment[]>("/assignments").then(setAssignments).catch(() => {
      setAssignments([]);
      toast().error("Failed to load assignments");
    });
    api<{ assignmentIds: string[] }>("/students/my-overrides")
      .then((r) => setOverrideIds(new Set(r.assignmentIds)))
      .catch(() => setOverrideIds(new Set()));

    api<SubmissionRow[]>("/submissions").then(async (rows) => {
      setSubmissions(rows);
      const entries = await Promise.all(rows.map(async (row) => {
        try {
          return [row.submission.id, await api<Review>(`/reviews/${row.submission.id}`)] as const;
        } catch { return null; }
      }));
      setReviews(Object.fromEntries(entries.filter(Boolean) as Array<readonly [string, Review]>));
    }).catch(() => {
      setSubmissions([]); setReviews({});
      toast().error("Failed to load submissions");
    });
  }, []);

  const openAssignments = useMemo(() => {
    const now = new Date();
    return assignments
      .filter((a) => {
        const within = new Date(a.opensAt) <= now && new Date(a.closesAt) > now;
        return within || overrideIds.has(a.id);
      })
      .sort((a, b) => new Date(a.closesAt).getTime() - new Date(b.closesAt).getTime());
  }, [assignments, overrideIds]);

  const milestone = openAssignments[0] ?? null;
  const recentSubmissions = useMemo(() => submissions.slice(0, 4), [submissions]);

  return (
    <StudentShell section="dashboard">
      <div className="flex flex-col gap-6">
        <PageHeader title="Dashboard" description="Your open assignments and recent feedback." />

        <MilestoneHero assignment={milestone} />

        <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Active Assignments</CardTitle>
              <Link to="/student/results" className="text-xs font-medium text-[var(--accent)] hover:underline">
                View All Schedule
              </Link>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {openAssignments.length === 0 && (
                <div className="py-10 text-center text-sm text-[var(--fg-muted)]">
                  Your teacher hasn't opened any assignments yet.
                </div>
              )}
              {openAssignments.map((assignment) => (
                <AssignmentRow key={assignment.id} assignment={assignment} />
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Latest Results</CardTitle>
              <Link to="/student/results" className="text-xs font-medium text-[var(--accent)] hover:underline">
                Transcript
              </Link>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {recentSubmissions.length === 0 && (
                <div className="py-10 text-center text-sm text-[var(--fg-muted)]">
                  No results yet.
                </div>
              )}
              {recentSubmissions.map((row) => (
                <ResultCard key={row.submission.id} row={row} review={reviews[row.submission.id]} />
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </StudentShell>
  );
}
