import { useEffect, useState } from "react";
import TeacherShell from "../components/TeacherShell";
import { Badge } from "../components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Icon } from "../components/ui/Icons";
import { api } from "../api";

type ApiItem = {
  icon: string;
  heading: string;
  detail: string;
  category: "backend" | "frontend" | "infra" | "feature";
};

type ApiEntry = {
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

export default function ChangelogPage() {
  const [entries, setEntries] = useState<ApiEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<ApiEntry[]>("/changelogs")
      .then(setEntries)
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <TeacherShell section="changelog">
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
                  <div
                    className={`h-2 w-2 rounded-full ${i === 0 ? "bg-[var(--success)]" : "bg-[var(--border)]"}`}
                  />
                </div>

                <div className="min-w-0 flex-1 flex flex-col gap-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-base font-semibold text-[var(--fg)]">
                      {entry.version}
                    </span>
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
                          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--fg-muted)]">
                            Why this release
                          </h3>
                          <p className="text-sm leading-relaxed text-[var(--fg)]">{entry.motivation}</p>
                        </section>
                      )}

                      {entry.items.length > 0 && (
                        <section>
                          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--fg-muted)]">
                            What changed
                          </h3>
                          <div className="flex flex-col gap-3">
                            {entry.items.map((item, j) => (
                              <div key={j} className="flex items-start gap-3">
                                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--surface-muted)] text-[var(--fg-muted)]">
                                  {ICON_MAP[item.icon] || <Icon.Sparkles className="h-3.5 w-3.5" />}
                                </div>
                                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                  <div className="flex items-start gap-2">
                                    <span className="text-sm font-medium leading-relaxed text-[var(--fg)]">
                                      {item.heading}
                                    </span>
                                    <Badge
                                      tone={CATEGORY_TONE[item.category]}
                                      className="mt-0.5 shrink-0"
                                    >
                                      {CATEGORY_LABEL[item.category]}
                                    </Badge>
                                  </div>
                                  <span className="text-sm leading-relaxed text-[var(--fg-muted)]">
                                    {item.detail}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </section>
                      )}

                      {entry.deepDive && (
                        <section>
                          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--fg-muted)]">
                            Behind the scenes
                          </h3>
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
    </TeacherShell>
  );
}
