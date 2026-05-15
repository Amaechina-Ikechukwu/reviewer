import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import TeacherShell from "../components/TeacherShell";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Icon } from "../components/ui/Icons";
import { api } from "../api";

export type ApiItem = {
  icon: string;
  heading: string;
  detail: string;
  category: "backend" | "frontend" | "infra" | "feature";
};

export type ApiEntry = {
  id: string;
  version: string;
  date: string;
  label: "latest" | "stable" | "major";
  title: string;
  summary: string;
  motivation: string;
  deepDive: string;
  items: ApiItem[];
};

const ICON_MAP: Record<string, React.ReactNode> = {
  Megaphone: <Icon.Megaphone className="h-3.5 w-3.5" />,
  Newspaper: <Icon.Newspaper className="h-3.5 w-3.5" />,
  Shield: <Icon.Shield className="h-3.5 w-3.5" />,
  Upload: <Icon.Upload className="h-3.5 w-3.5" />,
  Refresh: <Icon.Refresh className="h-3.5 w-3.5" />,
  FileText: <Icon.FileText className="h-3.5 w-3.5" />,
  Bell: <Icon.Bell className="h-3.5 w-3.5" />,
  Check: <Icon.Check className="h-3.5 w-3.5" />,
  Users: <Icon.Users className="h-3.5 w-3.5" />,
  Layers: <Icon.Layers className="h-3.5 w-3.5" />,
  Edit: <Icon.Edit className="h-3.5 w-3.5" />,
  Activity: <Icon.Activity className="h-3.5 w-3.5" />,
  Sparkles: <Icon.Sparkles className="h-3.5 w-3.5" />,
  Inbox: <Icon.Inbox className="h-3.5 w-3.5" />,
  FileCode: <Icon.FileCode className="h-3.5 w-3.5" />,
  Book: <Icon.Book className="h-3.5 w-3.5" />,
  Calendar: <Icon.Calendar className="h-3.5 w-3.5" />,
  Send: <Icon.Send className="h-3.5 w-3.5" />,
  Clock: <Icon.Clock className="h-3.5 w-3.5" />,
  Dashboard: <Icon.Dashboard className="h-3.5 w-3.5" />,
  FilePlus: <Icon.FilePlus className="h-3.5 w-3.5" />,
  Search: <Icon.Search className="h-3.5 w-3.5" />,
  Link: <Icon.Link className="h-3.5 w-3.5" />,
  Trash: <Icon.Trash className="h-3.5 w-3.5" />,
  Copy: <Icon.Copy className="h-3.5 w-3.5" />,
  External: <Icon.External className="h-3.5 w-3.5" />,
  Github: <Icon.Github className="h-3.5 w-3.5" />,
  AlertTriangle: <Icon.AlertTriangle className="h-3.5 w-3.5" />,
};

const CATEGORY_TONE = {
  backend: "accent",
  frontend: "success",
  infra: "warn",
  feature: "neutral",
} as const;

const CATEGORY_LABEL = {
  backend: "Backend",
  frontend: "UI",
  infra: "Infra",
  feature: "Feature",
} as const;

const labelTone = { latest: "success", stable: "accent", major: "warn" } as const;
const labelText = { latest: "Latest", stable: "Stable", major: "Major release" } as const;

const FALLBACK_ENTRIES: ApiEntry[] = [
  {
    id: "v2.3",
    version: "v2.3",
    date: "May 2025",
    label: "latest",
    title: "Notifications & Changelog",
    summary: "This release adds a dedicated notification center for instructors and administrators, along with this changelog page. It's a quality-of-life release focused on communication — making sure the right people get the right information at the right time.",
    motivation: "As class sizes grew, instructors found themselves repeating the same announcements across multiple channels. Students missed important updates buried in chat history. We needed a single, authoritative broadcast system baked directly into the platform.",
    deepDive: "The notification system was designed with a permission-first architecture. Rather than a flat 'can send' flag, we modeled it after the existing role hierarchy — owners and admins can broadcast globally, managers can target their cohorts, and instructors can send to their assigned groups. This prevents accidental cross-cohort leaks while keeping the UI simple for each role.",
    items: [
      { icon: "Megaphone", heading: "Email notification center", detail: "Compose and send emails to students, staff, or specific cohorts from a single interface.", category: "feature" },
      { icon: "Newspaper", heading: "Changelog page", detail: "Every v2 release is now documented here — not just a list of changes, but the context and reasoning behind each one.", category: "frontend" },
      { icon: "Shield", heading: "Role-scoped notification access", detail: "Broadcast permissions follow the staff hierarchy: Owner (unrestricted), Admin (all cohorts), Manager (assigned cohorts).", category: "backend" },
    ],
  },
  {
    id: "v2.2",
    version: "v2.2",
    date: "May 2025",
    label: "stable",
    title: "Firebase Storage & Assignment Brief Viewer",
    summary: "Persistent file storage and an inline brief viewer for students. No more lost uploads on container restart.",
    motivation: "Uploaded files were stored on the local filesystem, which meant they disappeared every time the container restarted. Students couldn't view assignment briefs inline.",
    deepDive: "We moved all file operations to Firebase Storage with a cold-start recovery layer. On first request after a deploy, files are re-downloaded from Storage to /tmp for fast local access.",
    items: [
      { icon: "Upload", heading: "Persistent file storage", detail: "Assignment PDFs and student submissions are now stored in Firebase Storage. Uploads survive deploys and restarts.", category: "infra" },
      { icon: "Refresh", heading: "Cold-start recovery", detail: "On container cold start, files are re-downloaded from Firebase Storage to /tmp on demand.", category: "infra" },
      { icon: "FileText", heading: "Inline assignment brief viewer", detail: "Students can view assignment briefs without leaving the page. PDFs render inline, Markdown as HTML.", category: "frontend" },
      { icon: "Bell", heading: "Toast notifications across all pages", detail: "Every mutation now triggers a toast notification for success, error, and loading states.", category: "frontend" },
      { icon: "Check", heading: "Brief serving bug fix", detail: "Fixed a UUID resolution bug where brief IDs weren't correctly mapped to their Firebase Storage paths.", category: "backend" },
    ],
  },
  {
    id: "v2.1",
    version: "v2.1",
    date: "May 2025",
    label: "stable",
    title: "Roles, Cohorts, Groups & Forms",
    summary: "The biggest feature release of v2. Introduced a full staff hierarchy, cohort management, group project support, and a custom form builder.",
    motivation: "Early v2 users needed more than just code review. They needed to organize students into cohorts, assign staff with varying permissions, and create group projects.",
    deepDive: "The role hierarchy mirrors real school org charts. Cohorts are multi-track and support both individual and group assignments. The form builder uses a JSON schema approach internally.",
    items: [
      { icon: "Shield", heading: "Staff role hierarchy", detail: "Four-tier permission model: Owner, Admin, Manager, Instructor. Each role inherits from the level above.", category: "feature" },
      { icon: "Layers", heading: "Cohort management", detail: "Create cohorts by track, assign students in bulk, filter by track or status.", category: "feature" },
      { icon: "Users", heading: "Group assignment support", detail: "Auto-grouping and manual group creation. Each group submission is reviewed as a unit.", category: "feature" },
      { icon: "Edit", heading: "Custom form builder", detail: "Drag-and-drop builder for intake surveys, feedback forms, and assessments.", category: "feature" },
      { icon: "Activity", heading: "Multi-track support", detail: "Six tracks: Frontend, Backend, Data Analytics, Product Design, Cyber, Marketing.", category: "backend" },
      { icon: "Users", heading: "Student profile pages", detail: "Each student gets a profile page with cohort, track enrollment, and submission history.", category: "frontend" },
    ],
  },
  {
    id: "v2.0",
    version: "v2.0",
    date: "April 2025",
    label: "major",
    title: "Firebase / Firestore Migration",
    summary: "A complete architectural rewrite. The entire backend moved from PostgreSQL to Firestore, enabling real-time updates and serverless scaling.",
    motivation: "PostgreSQL required manual scaling and had cold-start issues. Firestore offered real-time sync, automatic scaling, and serverless billing.",
    deepDive: "The migration was executed in three phases: dual-write, read-from-Firestore with fallback, then decommission PostgreSQL. Data integrity was verified with automated comparison scripts.",
    items: [
      { icon: "Sparkles", heading: "PostgreSQL to Firestore migration", detail: "All application data migrated from PostgreSQL to Firestore. Real-time listeners replace polling.", category: "backend" },
      { icon: "Sparkles", heading: "Cloud Run auto-scaling", detail: "Deployed on Google Cloud Run with zero minimum instances. Scales from 0 to hundreds.", category: "infra" },
      { icon: "Shield", heading: "Firebase Admin SDK integration", detail: "Unified auth, database, and storage under Firebase Admin SDK.", category: "backend" },
      { icon: "Inbox", heading: "AI review pipeline preserved", detail: "Gemma 4 31B and Gemini 2.5 Flash continue to power code reviews, unchanged.", category: "feature" },
      { icon: "FileCode", heading: "React preview sandbox", detail: "In-browser live coding: HTML, CSS, JS or full React with instant preview.", category: "frontend" },
      { icon: "Book", heading: "Gradebook, audit logs, class notes migrated", detail: "All PostgreSQL tables migrated to Firestore with referential integrity preserved.", category: "backend" },
      { icon: "Calendar", heading: "Data migration with integrity checks", detail: "Custom scripts compared every row. Full migration completed in under 10 minutes.", category: "infra" },
    ],
  },
];

export function ChangelogContent({ publicView }: { publicView?: boolean }) {
  const [entries, setEntries] = useState<ApiEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<ApiEntry[]>("/changelogs")
      .then((data) => {
        if (data && data.length > 0) {
          setEntries(data);
        } else {
          setEntries(FALLBACK_ENTRIES);
        }
      })
      .catch(() => setEntries(FALLBACK_ENTRIES))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Changelog</h1>
        <p className="text-sm text-[var(--fg-muted)]">
          A record of every improvement shipped to Scholar AI v2 — with the story behind each release.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-sm text-[var(--fg-muted)]">
          <svg className="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
            <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
          Loading changelog…
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-20">
          <Icon.Newspaper className="h-10 w-10 text-[var(--fg-muted)]" />
          <p className="text-sm text-[var(--fg-muted)]">No changelog entries yet.</p>
        </div>
      ) : (
        <div className="relative flex flex-col gap-0">
          <div className="absolute left-[11px] top-3 bottom-3 w-px bg-[var(--border)]" />

          {entries.map((entry, i) => (
            <div key={entry.id} className="relative flex gap-5 pb-12 last:pb-0">
              <div className="relative z-10 mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-[var(--border)] bg-[var(--surface)]">
                <div className={`h-2 w-2 rounded-full ${i === 0 ? "bg-[var(--success)]" : "bg-[var(--border)]"}`} />
              </div>

              <div className="min-w-0 flex-1 flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-base font-semibold text-[var(--fg)]">{entry.version}</span>
                  <Badge tone={labelTone[entry.label]}>{labelText[entry.label]}</Badge>
                  <span className="text-xs text-[var(--fg-muted)]">{entry.date}</span>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">{entry.title}</CardTitle>
                    <p className="text-sm leading-relaxed text-[var(--fg)]">{entry.summary}</p>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-5">
                    {entry.motivation && (
                      <section>
                        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--fg-muted)]">Why this release</h3>
                        <p className="text-sm leading-relaxed text-[var(--fg)]">{entry.motivation}</p>
                      </section>
                    )}

                    {entry.items.length > 0 && (
                      <section>
                        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--fg-muted)]">What changed</h3>
                        <div className="flex flex-col gap-3">
                          {entry.items.map((item, j) => (
                            <div key={j} className="flex items-start gap-3">
                              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--surface-muted)] text-[var(--fg-muted)]">
                                {ICON_MAP[item.icon] || <Icon.Sparkles className="h-3.5 w-3.5" />}
                              </div>
                              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                <div className="flex items-start gap-2">
                                  <span className="text-sm font-medium leading-relaxed text-[var(--fg)]">{item.heading}</span>
                                  <Badge tone={CATEGORY_TONE[item.category]} className="mt-0.5 shrink-0">{CATEGORY_LABEL[item.category]}</Badge>
                                </div>
                                <span className="text-sm leading-relaxed text-[var(--fg-muted)]">{item.detail}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}

                    {entry.deepDive && (
                      <section>
                        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--fg-muted)]">Behind the scenes</h3>
                        <p className="text-sm leading-relaxed text-[var(--fg)]">{entry.deepDive}</p>
                      </section>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ChangelogPage() {
  const location = useLocation();
  const isPublic = location.pathname === "/changelog";

  if (isPublic) {
    return (
      <div className="mx-auto min-h-screen max-w-3xl px-4 py-10 sm:px-6">
        <div className="mb-6">
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-[var(--accent)] hover:underline">
            <Icon.ChevronLeft className="h-3.5 w-3.5" />
            Back to home
          </Link>
        </div>
        <ChangelogContent publicView />
      </div>
    );
  }

  return (
    <TeacherShell section="changelog">
      <ChangelogContent />
    </TeacherShell>
  );
}
