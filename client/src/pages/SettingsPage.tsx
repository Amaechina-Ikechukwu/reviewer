import { useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import TeacherShell from "../components/TeacherShell";
import { useAuth } from "../context/AuthContext";
import { cn } from "../lib/cn";
import { api } from "../api";
import { toast } from "../components/Toast";
import { Avatar } from "../components/ui/Avatar";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Input, Label, Textarea, Select } from "../components/ui/Input";
import { Icon } from "../components/ui/Icons";

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
  const { user } = useAuth();
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
          <div className="grid gap-4 sm:grid-cols-2">
            <Label>
              Current password
              <Input type="password" placeholder="••••••••" />
            </Label>
            <Label>
              New password
              <Input type="password" placeholder="••••••••" />
            </Label>
            <Label>
              Confirm new password
              <Input type="password" placeholder="••••••••" />
            </Label>
          </div>
          <div>
            <Button size="sm">Update password</Button>
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

function ChangelogTab() {
  const [version, setVersion] = useState("");
  const [date, setDate] = useState("");
  const [label, setLabel] = useState<"latest" | "stable" | "major">("latest");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [motivation, setMotivation] = useState("");
  const [deepDive, setDeepDive] = useState("");
  const [items, setItems] = useState<FormItem[]>([emptyItem()]);
  const [saving, setSaving] = useState(false);

  function updateItem(index: number, field: keyof FormItem, value: string) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function addItem() {
    setItems((prev) => [...prev, emptyItem()]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!version.trim()) { toast().error("Version is required."); return; }
    if (!title.trim()) { toast().error("Title is required."); return; }
    if (!summary.trim()) { toast().error("Summary is required."); return; }

    const validItems = items.filter((item) => item.heading.trim() && item.detail.trim());
    if (validItems.length === 0) { toast().error("Add at least one change item."); return; }

    setSaving(true);
    try {
      await api("/changelogs", {
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
      toast().success("Changelog entry published.");
      setVersion(""); setDate(""); setTitle(""); setSummary("");
      setMotivation(""); setDeepDive(""); setItems([emptyItem()]);
    } catch (err) {
      toast().error(err instanceof Error ? err.message : "Failed to publish entry.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>
            <span className="inline-flex items-center gap-2">
              <Icon.Newspaper className="h-4 w-4 text-[var(--fg-muted)]" />
              System Updates & History
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm leading-relaxed text-[var(--fg-muted)]">
            Read about every improvement shipped to the platform.
          </p>
          <Link to="/teacher/changelog">
            <Button variant="secondary" size="sm">
              <Icon.Newspaper className="h-3.5 w-3.5" />
              View changelog
            </Button>
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <span className="inline-flex items-center gap-2">
              <Icon.Plus className="h-4 w-4 text-[var(--fg-muted)]" />
              Publish New Entry
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
              Motivation (why this release)
              <Textarea rows={3} placeholder="What problem does this solve?" value={motivation} onChange={(e) => setMotivation(e.target.value)} />
            </Label>

            <Label>
              Behind the Scenes (technical deep dive)
              <Textarea rows={3} placeholder="Implementation details and technical decisions" value={deepDive} onChange={(e) => setDeepDive(e.target.value)} />
            </Label>

            {/* Items */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--fg-muted)]">
                  Changes
                </span>
                <Button type="button" variant="ghost" size="sm" onClick={addItem}>
                  <Icon.Plus className="h-3.5 w-3.5" />
                  Add item
                </Button>
              </div>
              {items.map((item, i) => (
                <div key={i} className="flex flex-col gap-2 rounded-lg border border-[var(--border)] p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-[var(--fg-muted)]">Item {i + 1}</span>
                    {items.length > 1 && (
                      <button type="button" onClick={() => removeItem(i)} className="text-[var(--fg-muted)] hover:text-[var(--danger)]">
                        <Icon.Trash className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-4">
                    <Label>
                      Icon
                      <Select value={item.icon} onChange={(e) => updateItem(i, "icon", e.target.value)}>
                        {ICON_OPTIONS.map((ico) => (
                          <option key={ico} value={ico}>{ico}</option>
                        ))}
                      </Select>
                    </Label>
                    <Label>
                      Category
                      <Select value={item.category} onChange={(e) => updateItem(i, "category", e.target.value)}>
                        {CATEGORY_OPTIONS.map((cat) => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </Select>
                    </Label>
                    <div className="sm:col-span-2">
                      <Label>
                        Heading
                        <Input placeholder="Feature name" value={item.heading} onChange={(e) => updateItem(i, "heading", e.target.value)} />
                      </Label>
                    </div>
                  </div>
                  <Label>
                    Detail
                    <Input placeholder="Explanation of the change" value={item.detail} onChange={(e) => updateItem(i, "detail", e.target.value)} />
                  </Label>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="submit" loading={saving} disabled={saving}>
                <Icon.Send className="h-3.5 w-3.5" />
                {saving ? "Publishing…" : "Publish entry"}
              </Button>
            </div>
          </form>
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
