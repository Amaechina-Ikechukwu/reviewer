import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import TeacherShell from "../components/TeacherShell";
import { useAuth } from "../context/AuthContext";
import { cn } from "../lib/cn";
import { api, pollEmailJob } from "../api";
import { toast } from "../components/Toast";
import { Avatar } from "../components/ui/Avatar";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Input, Label, Textarea, Select } from "../components/ui/Input";
import { Icon } from "../components/ui/Icons";
import type { Cohort } from "../types";

type Tab = "profile" | "notifications" | "activity" | "management" | "forms" | "changelog" | "account";

const TABS: { key: Tab; label: string; icon: ReactNode }[] = [
  { key: "profile", label: "Profile", icon: <Icon.Users className="h-4 w-4" /> },
  { key: "notifications", label: "Notifications", icon: <Icon.Bell className="h-4 w-4" /> },
  { key: "activity", label: "Activity", icon: <Icon.Activity className="h-4 w-4" /> },
  { key: "management", label: "Management", icon: <Icon.Shield className="h-4 w-4" /> },
  { key: "forms", label: "Forms", icon: <Icon.Edit className="h-4 w-4" /> },
  { key: "changelog", label: "Changelog", icon: <Icon.Newspaper className="h-4 w-4" /> },
  { key: "account", label: "Account", icon: <Icon.Sparkles className="h-4 w-4" /> },
];

function ProfileTab() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [resetting, setResetting] = useState(false);

  async function handleResetPassword() {
    setResetting(true);
    try {
      await api("/auth/request-reset", {
        method: "POST",
        body: JSON.stringify({ email: user?.email }),
      });
      toast().success("Reset link sent to your email.");
      setTimeout(() => { logout(); navigate("/login"); }, 1500);
    } catch (err) {
      toast().error(err instanceof Error ? err.message : "Failed to send reset email.");
      setResetting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>
            <span className="inline-flex items-center gap-2">
              <Icon.Users className="h-4 w-4 text-[var(--fg-muted)]" />
              Personal Information
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex items-center gap-4">
            <Avatar name={user?.fullName || "?"} size="lg" />
            <div>
              <Button variant="secondary" size="sm">Change avatar</Button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Label>
              Full name
              <Input defaultValue={user?.fullName} />
            </Label>
            <Label>
              Email address
              <Input defaultValue={user?.email} disabled />
            </Label>
            <Label>
              Role
              <Input defaultValue={user?.role || ""} disabled />
            </Label>
          </div>

          <div className="flex gap-2">
            <Button size="sm">Save changes</Button>
            <Button variant="ghost" size="sm">Cancel</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <span className="inline-flex items-center gap-2">
              <Icon.Shield className="h-4 w-4 text-[var(--fg-muted)]" />
              Password
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm leading-relaxed text-[var(--fg-muted)]">
            A reset link will be sent to your email. You will be logged out immediately and must verify with a one-time code to set a new password.
          </p>
          <div>
            <Button onClick={handleResetPassword} loading={resetting} disabled={resetting} variant="secondary" size="sm">
              <Icon.Send className="h-3.5 w-3.5" />
              {resetting ? "Sending…" : "Send reset link"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function NotificationsTab() {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>
            <span className="inline-flex items-center gap-2">
              <Icon.Megaphone className="h-4 w-4 text-[var(--fg-muted)]" />
              Email Notification Settings
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm leading-relaxed text-[var(--fg-muted)]">
            Configure default sender settings, email templates, and delivery preferences for notifications sent from the platform.
          </p>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between rounded-lg border border-[var(--border)] px-4 py-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-[var(--fg)]">Send notifications</span>
                <span className="text-xs text-[var(--fg-muted)]">
                  Compose and send email blasts to students, staff, or cohorts
                </span>
              </div>
              <Link to="/teacher/notifications">
                <Button variant="secondary" size="sm">
                  <Icon.Send className="h-3.5 w-3.5" />
                  Compose
                </Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ActivityTab() {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>
            <span className="inline-flex items-center gap-2">
              <Icon.Activity className="h-4 w-4 text-[var(--fg-muted)]" />
              Activity Log
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm leading-relaxed text-[var(--fg-muted)]">
            View the full audit trail of all actions taken on the platform — user changes, submissions, reviews, and
            system events.
          </p>
          <Link to="/teacher/logs">
            <Button variant="secondary" size="sm">
              <Icon.Activity className="h-3.5 w-3.5" />
              View activity log
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

function ManagementTab() {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>
            <span className="inline-flex items-center gap-2">
              <Icon.Shield className="h-4 w-4 text-[var(--fg-muted)]" />
              Staff & Roles
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm leading-relaxed text-[var(--fg-muted)]">
            Manage your staff team — invite new members, assign roles (Owner, Admin, Manager, Instructor), and control
            platform access.
          </p>
          <Link to="/teacher/staff">
            <Button variant="secondary" size="sm">
              <Icon.Shield className="h-3.5 w-3.5" />
              Manage staff
            </Button>
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <span className="inline-flex items-center gap-2">
              <Icon.Layers className="h-4 w-4 text-[var(--fg-muted)]" />
              Cohorts
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm leading-relaxed text-[var(--fg-muted)]">
            Create and manage cohorts, assign students, and configure cohort-specific settings.
          </p>
          <Link to="/teacher/cohorts">
            <Button variant="secondary" size="sm">
              <Icon.Layers className="h-3.5 w-3.5" />
              Manage cohorts
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

function FormsTab() {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>
            <span className="inline-flex items-center gap-2">
              <Icon.Edit className="h-4 w-4 text-[var(--fg-muted)]" />
              Form Builder
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm leading-relaxed text-[var(--fg-muted)]">
            Build custom intake forms, feedback surveys, and assessments using the drag-and-drop form builder.
            Manage templates and view responses.
          </p>
          <Link to="/teacher/forms">
            <Button variant="secondary" size="sm">
              <Icon.Edit className="h-3.5 w-3.5" />
              Go to forms
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

type Person = { id: string; email: string; fullName: string; role: string };
type Target = "all" | "students" | "staff" | "cohort" | "individual";

const TARGETS: { value: Target; label: string; description: string }[] = [
  { value: "all", label: "Everyone", description: "All students and staff" },
  { value: "students", label: "Students", description: "All active students" },
  { value: "staff", label: "Staff", description: "All staff roles" },
  { value: "cohort", label: "Cohort", description: "Students in one cohort" },
  { value: "individual", label: "Specific People", description: "Pick individuals" },
];

function RecipientSelect({
  people, selected, onChange,
}: {
  people: Person[]; selected: Person[]; onChange: (ids: Person[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const filtered = people.filter((p) => !query.trim() || p.fullName.toLowerCase().includes(query.toLowerCase()) || p.email.toLowerCase().includes(query.toLowerCase()));
  const selectedIds = new Set(selected.map((s) => s.id));

  function toggle(person: Person) {
    onChange(selectedIds.has(person.id) ? selected.filter((s) => s.id !== person.id) : [...selected, person]);
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      {selected.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selected.map((p) => (
            <span key={p.id} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs font-medium text-[var(--fg)]">
              {p.fullName}
              <button type="button" onClick={() => toggle(p)} className="text-[var(--fg-muted)] hover:text-[var(--danger)]"><Icon.X className="h-3 w-3" /></button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <Icon.Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--fg-muted)]" />
        <Input placeholder="Search by name or email…" value={query} onChange={(e) => { setQuery(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} className="pl-8" />
      </div>
      {open && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-[var(--fg-muted)]">No matches found.</div>
          ) : (
            filtered.map((p) => (
              <button key={p.id} type="button" onClick={() => toggle(p)} className={cn("flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--surface-muted)]", selectedIds.has(p.id) && "bg-[var(--accent-soft)]")}>
                <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors", selectedIds.has(p.id) ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border)]")}>
                  {selectedIds.has(p.id) && <Icon.Check className="h-3 w-3" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-[var(--fg)]">{p.fullName}</span>
                  <span className="block truncate text-[11px] text-[var(--fg-muted)]">{p.email}</span>
                </span>
                <Badge tone={p.role === "student" ? "success" : "accent"} className="shrink-0">{p.role}</Badge>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

const ICON_OPTIONS = [
  "Megaphone", "Newspaper", "Shield", "Upload", "Refresh", "FileText",
  "Bell", "Check", "Users", "Layers", "Edit", "Activity", "Sparkles",
  "Inbox", "FileCode", "Book", "Calendar", "Send", "Clock", "Link", "Search",
];

const CATEGORY_OPTIONS = ["backend", "frontend", "infra", "feature"] as const;

type FormItem = { icon: string; heading: string; detail: string; category: string };

function emptyItem(): FormItem {
  return { icon: "Sparkles", heading: "", detail: "", category: "feature" };
}

type ChangelogEntry = { id: string; version: string; title: string; summary: string };

const FALLBACK_ENTRIES: ChangelogEntry[] = [
  { id: "v2.3", version: "v2.3", title: "Notifications & Changelog", summary: "Email notification center, changelog page, role-scoped notification access." },
  { id: "v2.2", version: "v2.2", title: "Firebase Storage & Assignment Brief Viewer", summary: "Persistent file storage, inline brief viewer, toast notifications." },
  { id: "v2.1", version: "v2.1", title: "Roles, Cohorts, Groups & Forms", summary: "Staff hierarchy, cohort management, group projects, custom form builder." },
  { id: "v2.0", version: "v2.0", title: "Firebase / Firestore Migration", summary: "Complete PostgreSQL to Firestore migration, Cloud Run auto-scaling." },
];

function ChangelogTab() {
  const [entries, setEntries] = useState<ChangelogEntry[]>(FALLBACK_ENTRIES);
  const [selectedId, setSelectedId] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number; total: number } | null>(null);

  const [emailHeading, setEmailHeading] = useState("New Update");
  const [target, setTarget] = useState<Target>("all");
  const [cohortId, setCohortId] = useState("");
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [selectedPeople, setSelectedPeople] = useState<Person[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(false);

  // Create entry form
  const [version, setVersion] = useState("");
  const [date, setDate] = useState("");
  const [label, setLabel] = useState<"latest" | "stable" | "major">("latest");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [motivation, setMotivation] = useState("");
  const [deepDive, setDeepDive] = useState("");
  const [items, setItems] = useState<FormItem[]>([emptyItem()]);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    api<ChangelogEntry[]>("/changelogs").then((data) => {
      if (data && data.length > 0) setEntries(data);
    }).catch(() => {});
    api<Cohort[]>("/cohorts").then(setCohorts).catch(() => setCohorts([]));
  }, []);

  useEffect(() => {
    if (target !== "individual") { setSelectedPeople([]); return; }
    setPeopleLoading(true);
    Promise.all([
      api<any[]>("/students").catch(() => []),
      api<any[]>("/staff").catch(() => []),
    ])
      .then(([students, staff]) => {
        const all: Person[] = [
          ...students.map((s: any) => ({ id: s.id, email: s.email, fullName: s.fullName, role: s.role })),
          ...staff.map((s: any) => ({ id: s.id, email: s.email, fullName: s.fullName, role: s.role })),
        ];
        all.sort((a, b) => a.fullName.localeCompare(b.fullName));
        setPeople(all);
      })
      .finally(() => setPeopleLoading(false));
  }, [target]);

  const selectedEntry = entries.find((e) => e.id === selectedId);

  async function ensureEntryInDb(entry: ChangelogEntry): Promise<string> {
    try {
      await api(`/changelogs/${entry.id}/notify`, { method: "POST", body: JSON.stringify({ target: "all", dryRun: true }) });
      return entry.id;
    } catch {
      const created = await api<any>("/changelogs", {
        method: "POST",
        body: JSON.stringify({
          version: entry.version,
          date: "",
          label: "stable",
          title: entry.title,
          summary: entry.summary,
          motivation: "",
          deepDive: "",
          items: [],
        }),
      });
      setEntries((prev) => prev.map((e) => e.id === entry.id ? { ...e, id: created.id } : e));
      if (selectedId === entry.id) setSelectedId(created.id);
      return created.id;
    }
  }

  async function handleSend() {
    if (!selectedId) { toast().error("Select a changelog entry."); return; }
    if (target === "cohort" && !cohortId) { toast().error("Select a cohort."); return; }
    if (target === "individual" && selectedPeople.length === 0) { toast().error("Select at least one person."); return; }

    setSending(true);
    setResult(null);
    try {
      const entry = entries.find((e) => e.id === selectedId);
      if (!entry) { toast().error("Entry not found."); setSending(false); return; }

      const id = await ensureEntryInDb(entry);
      const res = await api<{ jobId?: string; total: number; status?: string; sent?: number; failed?: number; message?: string }>(
        `/changelogs/${id}/notify`,
        {
          method: "POST",
          body: JSON.stringify({
            heading: emailHeading.trim() || "New Update",
            target,
            cohortId: target === "cohort" ? cohortId : undefined,
            recipientIds: target === "individual" ? selectedPeople.map((p) => p.id) : undefined,
          }),
        },
      );
      if (!res.jobId) {
        setResult({ sent: res.sent ?? 0, failed: res.failed ?? 0, total: res.total });
        toast().info(res.message || "No eligible recipients found.");
      } else {
        toast().success(`Queued for ${res.total} recipient${res.total !== 1 ? "s" : ""}.`);
        setResult({ sent: 0, failed: 0, total: res.total });
        const final = await pollEmailJob(res.jobId);
        setResult({ sent: final.sent, failed: final.failed, total: final.total });
        if (final.failed === 0) {
          toast().success(`Delivered to ${final.sent} recipient${final.sent !== 1 ? "s" : ""}.`);
        } else {
          toast().info(`Delivered ${final.sent}, ${final.failed} failed.`);
        }
      }
    } catch (err) {
      toast().error(err instanceof Error ? err.message : "Failed to send.");
    } finally {
      setSending(false);
    }
  }

  function updateItem(index: number, field: keyof FormItem, value: string) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function addItem() {
    setItems((prev) => [...prev, emptyItem()]);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!version.trim()) { toast().error("Version is required."); return; }
    if (!title.trim()) { toast().error("Title is required."); return; }
    if (!summary.trim()) { toast().error("Summary is required."); return; }
    const validItems = items.filter((item) => item.heading.trim() && item.detail.trim());
    if (validItems.length === 0) { toast().error("Add at least one change item."); return; }

    setSaving(true);
    try {
      const entry = await api<any>("/changelogs", {
        method: "POST",
        body: JSON.stringify({
          version: version.trim(),
          date: date.trim() || new Date().toLocaleDateString("en-US", { year: "numeric", month: "long" }),
          label,
          title: title.trim(),
          summary: summary.trim(),
          motivation: motivation.trim(),
          deepDive: deepDive.trim(),
          items: validItems,
        }),
      });
      toast().success("Changelog entry created.");
      setEntries((prev) => [entry, ...prev]);
      setSelectedId(entry.id);
      setVersion(""); setDate(""); setTitle(""); setSummary("");
      setMotivation(""); setDeepDive(""); setItems([emptyItem()]);
      setShowCreate(false);
    } catch (err) {
      toast().error(err instanceof Error ? err.message : "Failed to create entry.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Send announcement */}
      <Card>
        <CardHeader>
          <CardTitle>
            <span className="inline-flex items-center gap-2">
              <Icon.Megaphone className="h-4 w-4 text-[var(--fg-muted)]" />
              Send Announcement
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Label required>
            Email heading
            <Input
              placeholder="e.g. New Update, Improvements, Bug Fixes"
              value={emailHeading}
              onChange={(e) => setEmailHeading(e.target.value)}
            />
          </Label>

          <Label required>
            Changelog entry
            <Select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
              <option value="">Select a version…</option>
              {entries.map((e) => (
                <option key={e.id} value={e.id}>{e.version} — {e.title}</option>
              ))}
            </Select>
          </Label>

          {selectedEntry && (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)]/50 px-4 py-3">
              <p className="text-sm font-medium text-[var(--fg)]">{selectedEntry.version}: {selectedEntry.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-[var(--fg-muted)]">{selectedEntry.summary}</p>
            </div>
          )}

          <hr className="border-[var(--border)]" />

          <div>
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--fg-muted)]">Send to</span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {TARGETS.map((t) => (
                <button
                  key={t.value} type="button" onClick={() => setTarget(t.value)}
                  className={cn(
                    "flex flex-col gap-1 rounded-lg border px-2.5 py-2 text-left transition-all",
                    target === t.value
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] shadow-sm"
                      : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--fg-muted)]/30 hover:bg-[var(--surface-muted)]/50",
                  )}
                >
                  <span className="text-xs font-semibold text-[var(--fg)]">{t.label}</span>
                  <span className="text-[11px] text-[var(--fg-muted)]">{t.description}</span>
                </button>
              ))}
            </div>
          </div>

          {target === "cohort" && (
            <Label>
              Cohort
              <select value={cohortId} onChange={(e) => setCohortId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--fg)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
              >
                <option value="">Select a cohort…</option>
                {cohorts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Label>
          )}

          {target === "individual" && (
            peopleLoading
              ? <div className="flex items-center gap-2 py-2 text-sm text-[var(--fg-muted)]"><svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" /><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>Loading people…</div>
              : <RecipientSelect people={people} selected={selectedPeople} onChange={setSelectedPeople} />
          )}

          <hr className="border-[var(--border)]" />

          <div className="flex items-center gap-3">
            <Button onClick={handleSend} loading={sending} disabled={sending} className="min-w-[140px]">
              <Icon.Send className="h-3.5 w-3.5" />
              {sending ? "Sending…" : "Send announcement"}
            </Button>
            {result && (
              <div className={cn("flex items-center gap-2.5 rounded-lg border px-3.5 py-2 text-sm", result.failed === 0 ? "border-[var(--success)]/30 bg-[var(--success-soft)]" : "border-[var(--warn)]/30 bg-[var(--warn-soft)]")}>
                {result.failed === 0 ? <Icon.Check className="h-4 w-4 shrink-0 text-[var(--success)]" /> : <Icon.AlertTriangle className="h-4 w-4 shrink-0 text-[var(--warn)]" />}
                <span><strong className="text-[var(--fg)]">{result.sent}</strong><span className="text-[var(--fg-muted)]"> sent</span>{result.failed > 0 && <span className="text-[var(--fg-muted)]"> · <strong className="text-[var(--danger)]">{result.failed}</strong> failed</span>}<span className="text-[var(--fg-muted)]"> of {result.total}</span></span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* View changelog */}
      <Card>
        <CardHeader>
          <CardTitle>
            <span className="inline-flex items-center gap-2">
              <Icon.Newspaper className="h-4 w-4 text-[var(--fg-muted)]" />
              System Updates
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm leading-relaxed text-[var(--fg-muted)]">
            See all published releases with full context and details.
          </p>
          <Link to="/teacher/changelog">
            <Button variant="secondary" size="sm">
              <Icon.Newspaper className="h-3.5 w-3.5" />
              View changelog
            </Button>
          </Link>
        </CardContent>
      </Card>

      {/* Create new entry */}
      <Card>
        <CardHeader>
          <CardTitle>
            <span className="inline-flex items-center gap-2">
              <Icon.Plus className="h-4 w-4 text-[var(--fg-muted)]" />
              Create New Entry
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {showCreate ? (
            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <Label required>
                  Version
                  <Input placeholder="v2.4" value={version} onChange={(e) => setVersion(e.target.value)} />
                </Label>
                <Label>
                  Date
                  <Input placeholder="June 2025" value={date} onChange={(e) => setDate(e.target.value)} />
                </Label>
                <Label required>
                  Label
                  <Select value={label} onChange={(e) => setLabel(e.target.value as any)}>
                    <option value="latest">Latest</option>
                    <option value="stable">Stable</option>
                    <option value="major">Major release</option>
                  </Select>
                </Label>
              </div>
              <Label required>
                Title
                <Input placeholder="e.g. Changelog Management System" value={title} onChange={(e) => setTitle(e.target.value)} />
              </Label>
              <Label required>
                Summary
                <Textarea rows={3} placeholder="High-level overview of the release" value={summary} onChange={(e) => setSummary(e.target.value)} />
              </Label>
              <Label>
                Motivation
                <Textarea rows={3} placeholder="What problem does this solve?" value={motivation} onChange={(e) => setMotivation(e.target.value)} />
              </Label>
              <Label>
                Behind the Scenes
                <Textarea rows={3} placeholder="Implementation details and technical decisions" value={deepDive} onChange={(e) => setDeepDive(e.target.value)} />
              </Label>
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[var(--fg-muted)]">Changes</span>
                  <Button type="button" variant="ghost" size="sm" onClick={addItem}><Icon.Plus className="h-3.5 w-3.5" />Add item</Button>
                </div>
                {items.map((item, i) => (
                  <div key={i} className="flex flex-col gap-2 rounded-lg border border-[var(--border)] p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-[var(--fg-muted)]">Item {i + 1}</span>
                      {items.length > 1 && (
                        <button type="button" onClick={() => removeItem(i)} className="text-[var(--fg-muted)] hover:text-[var(--danger)]"><Icon.Trash className="h-3.5 w-3.5" /></button>
                      )}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-4">
                      <Label>Icon<Select value={item.icon} onChange={(e) => updateItem(i, "icon", e.target.value)}>{ICON_OPTIONS.map((ico) => <option key={ico} value={ico}>{ico}</option>)}</Select></Label>
                      <Label>Category<Select value={item.category} onChange={(e) => updateItem(i, "category", e.target.value)}>{CATEGORY_OPTIONS.map((cat) => <option key={cat} value={cat}>{cat}</option>)}</Select></Label>
                      <div className="sm:col-span-2"><Label>Heading<Input placeholder="Feature name" value={item.heading} onChange={(e) => updateItem(i, "heading", e.target.value)} /></Label></div>
                    </div>
                    <Label>Detail<Input placeholder="Explanation of the change" value={item.detail} onChange={(e) => updateItem(i, "detail", e.target.value)} /></Label>
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
                <Button type="submit" loading={saving} disabled={saving}><Icon.Send className="h-3.5 w-3.5" />{saving ? "Creating…" : "Create entry"}</Button>
              </div>
            </form>
          ) : (
            <Button variant="secondary" onClick={() => setShowCreate(true)}>
              <Icon.Plus className="h-3.5 w-3.5" />
              Create new entry
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AccountTab() {
  const navigate = useNavigate();
  const { logout, user } = useAuth();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>
            <span className="inline-flex items-center gap-2">
              <Icon.Sparkles className="h-4 w-4 text-[var(--fg-muted)]" />
              Account
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-3 rounded-lg border border-[var(--border)] px-4 py-3">
            <Avatar name={user?.fullName || "?"} size="md" />
            <div>
              <div className="text-sm font-medium text-[var(--fg)]">{user?.fullName}</div>
              <div className="text-xs text-[var(--fg-muted)]">{user?.email}</div>
              <Badge tone="accent" className="mt-1">{user?.role}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <span className="inline-flex items-center gap-2">
              <Icon.Book className="h-4 w-4 text-[var(--fg-muted)]" />
              School & Billing
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm leading-relaxed text-[var(--fg-muted)]">
            School information, subscription plan, billing history, and invoice management.
          </p>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)]/50 px-4 py-3">
            <div className="text-sm text-[var(--fg-muted)]">
              Billing management is not yet available in this version.
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <span className="inline-flex items-center gap-2">
              <Icon.Logout className="h-4 w-4 text-[var(--fg-muted)]" />
              Sign Out
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Button variant="danger" size="sm" onClick={handleLogout}>
            <Icon.Logout className="h-3.5 w-3.5" />
            Log out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

const TAB_KEYS: Tab[] = ["profile", "notifications", "activity", "management", "forms", "changelog", "account"];

export default function SettingsPage() {
  const { tab: tabParam } = useParams<{ tab?: string }>();
  const navigate = useNavigate();
  const tab = TAB_KEYS.includes(tabParam as Tab) ? (tabParam as Tab) : "profile";

  function setTab(next: Tab) {
    navigate(`/teacher/settings/${next}`, { replace: true });
  }

  return (
    <TeacherShell section="settings">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-[var(--fg-muted)]">
            Manage your profile, preferences, and platform settings.
          </p>
        </div>

        <div className="flex flex-col gap-6 lg:flex-row">
          {/* Tab bar */}
          <div className="flex shrink-0 flex-col gap-1 lg:w-48">
            {TABS.map((t) => (
              <Link
                key={t.key}
                to={`/teacher/settings/${t.key}`}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
                  tab === t.key
                    ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "text-[var(--fg-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--fg)]",
                )}
              >
                <span className={cn("shrink-0", tab === t.key ? "text-[var(--accent)]" : "")}>{t.icon}</span>
                {t.label}
              </Link>
            ))}
          </div>

          {/* Tab content */}
          <div className="min-w-0 flex-1">
            {tab === "profile" && <ProfileTab />}
            {tab === "notifications" && <NotificationsTab />}
            {tab === "activity" && <ActivityTab />}
            {tab === "management" && <ManagementTab />}
            {tab === "forms" && <FormsTab />}
            {tab === "changelog" && <ChangelogTab />}
            {tab === "account" && <AccountTab />}
          </div>
        </div>
      </div>
    </TeacherShell>
  );
}
