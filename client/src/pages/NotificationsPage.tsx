import { useEffect, useMemo, useRef, useState } from "react";
import TeacherShell from "../components/TeacherShell";
import { toast } from "../components/Toast";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Icon } from "../components/ui/Icons";
import { Input, Label, Select, Textarea } from "../components/ui/Input";
import { api, pollEmailJob } from "../api";
import { useAuth } from "../context/AuthContext";
import { cn } from "../lib/cn";
import type { Cohort } from "../types";

const MANAGER_ROLES = new Set(["owner", "admin", "manager"]);

type Target = "all" | "students" | "staff" | "cohort" | "individual";

type Person = {
  id: string;
  email: string;
  fullName: string;
  role: string;
};

const TARGETS: { value: Target; label: string; description: string }[] = [
  { value: "all", label: "Everyone", description: "All students and staff" },
  { value: "students", label: "Students", description: "All active students" },
  { value: "staff", label: "Staff", description: "All staff roles" },
  { value: "cohort", label: "Cohort", description: "Students in one cohort" },
  { value: "individual", label: "Specific People", description: "Pick individuals" },
];

const TARGET_ICONS: Record<Target, React.ReactNode> = {
  all: <Icon.Users className="h-4 w-4" />,
  students: <Icon.Users className="h-4 w-4" />,
  staff: <Icon.Shield className="h-4 w-4" />,
  cohort: <Icon.Layers className="h-4 w-4" />,
  individual: <Icon.Check className="h-4 w-4" />,
};

function RecipientSelect({
  people,
  selected,
  onChange,
}: {
  people: Person[];
  selected: Person[];
  onChange: (ids: Person[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return people;
    const q = query.toLowerCase();
    return people.filter(
      (p) =>
        p.fullName.toLowerCase().includes(q) || p.email.toLowerCase().includes(q),
    );
  }, [people, query]);

  const selectedIds = useMemo(() => new Set(selected.map((s) => s.id)), [selected]);

  function togglePerson(person: Person) {
    if (selectedIds.has(person.id)) {
      onChange(selected.filter((s) => s.id !== person.id));
    } else {
      onChange([...selected, person]);
    }
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selected.map((person) => (
            <span
              key={person.id}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs font-medium text-[var(--fg)]"
            >
              {person.fullName}
              <button
                type="button"
                onClick={() => togglePerson(person)}
                className="text-[var(--fg-muted)] hover:text-[var(--danger)]"
              >
                <Icon.X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search input */}
      <div className="relative">
        <Icon.Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--fg-muted)]" />
        <Input
          placeholder="Search by name or email…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          className="pl-8"
        />
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-[var(--fg-muted)]">
              No matches found.
            </div>
          ) : (
            filtered.map((person) => (
              <button
                key={person.id}
                type="button"
                onClick={() => togglePerson(person)}
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--surface-muted)]",
                  selectedIds.has(person.id) ? "bg-[var(--accent-soft)]" : "",
                )}
              >
                <span
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                    selectedIds.has(person.id)
                      ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                      : "border-[var(--border)]",
                  )}
                >
                  {selectedIds.has(person.id) && <Icon.Check className="h-3 w-3" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-[var(--fg)]">
                    {person.fullName}
                  </span>
                  <span className="block truncate text-[11px] text-[var(--fg-muted)]">
                    {person.email}
                  </span>
                </span>
                <Badge tone={person.role === "student" ? "success" : "accent"} className="shrink-0">
                  {person.role}
                </Badge>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const isManager = !!user && MANAGER_ROLES.has(user.role);

  const availableTargets = useMemo(
    () => (isManager ? TARGETS : TARGETS.filter((t) => t.value !== "all" && t.value !== "staff")),
    [isManager],
  );

  const [target, setTarget] = useState<Target>("students");
  const [cohortId, setCohortId] = useState("");
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number; total: number; status?: string } | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [selectedPeople, setSelectedPeople] = useState<Person[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(false);

  useEffect(() => {
    api<Cohort[]>("/cohorts").then(setCohorts).catch(() => setCohorts([]));
  }, []);

  useEffect(() => {
    if (target !== "individual") { setSelectedPeople([]); return; }
    setPeopleLoading(true);
    Promise.all([
      api<any[]>("/students").catch(() => []),
      // Teachers cannot email staff — skip the /staff fetch.
      isManager ? api<any[]>("/staff").catch(() => []) : Promise.resolve([] as any[]),
    ])
      .then(([students, staff]) => {
        // Teachers see only their own students in the picker.
        const visibleStudents = isManager
          ? students
          : students.filter((s: any) => s.teacherId === user?.id);
        const all: Person[] = [
          ...visibleStudents.map((s: any) => ({ id: s.id, email: s.email, fullName: s.fullName, role: s.role })),
          ...staff.map((s: any) => ({ id: s.id, email: s.email, fullName: s.fullName, role: s.role })),
        ];
        all.sort((a, b) => a.fullName.localeCompare(b.fullName));
        setPeople(all);
      })
      .finally(() => setPeopleLoading(false));
  }, [target, isManager, user?.id]);

  async function handleSend() {
    if (!subject.trim()) { toast().error("Subject is required."); return; }
    if (!message.trim()) { toast().error("Message body is required."); return; }
    if (target === "cohort" && !cohortId) { toast().error("Select a cohort."); return; }
    if (target === "individual" && selectedPeople.length === 0) { toast().error("Select at least one person."); return; }

    setSending(true);
    setResult(null);
    try {
      const res = await api<{ jobId?: string; total: number; status?: string; sent?: number; failed?: number; message?: string }>(
        "/notifications/send",
        {
          method: "POST",
          body: JSON.stringify({
            subject,
            message,
            target,
            cohortId: target === "cohort" ? cohortId : undefined,
            recipientIds: target === "individual" ? selectedPeople.map((p) => p.id) : undefined,
          }),
        },
      );
      if (!res.jobId) {
        // Empty-recipients short-circuit returns synchronously with {sent,failed,total,message}
        setResult({ sent: res.sent ?? 0, failed: res.failed ?? 0, total: res.total });
        toast().info(res.message || "No eligible recipients found.");
        return;
      }
      setResult({ sent: 0, failed: 0, total: res.total, status: res.status });
      const final = await pollEmailJob(res.jobId);
      setResult({ sent: final.sent, failed: final.failed, total: final.total, status: final.status });
      if (final.failed === 0) {
        toast().success(`Delivered to ${final.sent} recipient${final.sent !== 1 ? "s" : ""}.`);
      } else if (final.sent > 0) {
        toast().info(`Delivered ${final.sent}, ${final.failed} failed.`);
      } else {
        toast().error(`All ${final.failed} sends failed. Check the server logs.`);
      }
    } catch (err) {
      toast().error(err instanceof Error ? err.message : "Failed to send notification.");
    } finally {
      setSending(false);
    }
  }

  const previewHtml = useMemo(() => {
    if (!message) return "";
    return message
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/\n/g, "<br>");
  }, [message]);

  const audienceLabel = target === "individual"
    ? `${selectedPeople.length} selected`
    : TARGETS.find((t) => t.value === target)?.label ?? target;

  const recipientName = target === "individual" && selectedPeople.length === 1
    ? selectedPeople[0].fullName
    : target === "cohort"
      ? "Student"
      : TARGETS.find((t) => t.value === target)?.label ?? "Recipient";

  return (
    <TeacherShell section="notifications">
      <div className="flex flex-col gap-6">
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">Send Notification</h1>
            <p className="text-sm text-[var(--fg-muted)]">
              Compose an email and choose who receives it.
            </p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
          {/* Compose column */}
          <div className="flex flex-col gap-5">
            {/* Message (on top) */}
            <Card>
              <CardHeader>
                <CardTitle>
                  <span className="inline-flex items-center gap-2">
                    <Icon.Edit className="h-4 w-4 text-[var(--fg-muted)]" />
                    Message
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <Label required>
                  Subject
                  <div className="relative mt-1">
                    <Input
                      placeholder="e.g. Important update from your instructor"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      className="pr-8"
                    />
                    {subject && (
                      <button
                        type="button"
                        onClick={() => setSubject("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--fg-muted)] hover:text-[var(--fg)]"
                      >
                        <Icon.X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </Label>

                <Label required>
                  Body
                  <div className="relative mt-1">
                    <Textarea
                      placeholder="Write your message here…"
                      rows={9}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      className="min-h-[180px] resize-y"
                    />
                    <div className="mt-1.5 flex items-center justify-between">
                      <span className="text-[11px] text-[var(--fg-muted)]">
                        Plain text — line breaks are preserved
                      </span>
                      <span className="text-[11px] tabular-nums text-[var(--fg-muted)]">
                        {message.length.toLocaleString()}{" "}
                        <span className="text-[var(--fg-muted)]">chars</span>
                      </span>
                    </div>
                  </div>
                </Label>
              </CardContent>
            </Card>

            {/* Audience (below message) */}
            <Card>
              <CardHeader>
                <CardTitle>
                  <span className="inline-flex items-center gap-2">
                    <Icon.Users className="h-4 w-4 text-[var(--fg-muted)]" />
                    Audience
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className={cn("grid grid-cols-2 gap-2", availableTargets.length >= 5 ? "sm:grid-cols-5" : "sm:grid-cols-3")}>
                  {availableTargets.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setTarget(t.value)}
                      className={cn(
                        "flex flex-col gap-1 rounded-lg border px-2.5 py-2 text-left transition-all",
                        target === t.value
                          ? "border-[var(--accent)] bg-[var(--accent-soft)] shadow-sm"
                          : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--fg-muted)]/30 hover:bg-[var(--surface-muted)]/50",
                      )}
                    >
                      <span className={cn(
                        "text-[var(--fg-muted)]",
                        target === t.value ? "text-[var(--accent)]" : "",
                      )}>
                        {TARGET_ICONS[t.value]}
                      </span>
                      <span className="text-xs font-semibold text-[var(--fg)]">{t.label}</span>
                      <span className="text-[11px] text-[var(--fg-muted)]">{t.description}</span>
                    </button>
                  ))}
                </div>

                {/* Cohort selector */}
                {target === "cohort" && (
                  <div>
                    <Label>
                      Cohort
                      <Select
                        value={cohortId}
                        onChange={(e) => setCohortId(e.target.value)}
                        placeholder="Select a cohort…"
                      >
                        <option value="">Select a cohort…</option>
                        {cohorts.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </Select>
                    </Label>
                  </div>
                )}

                {/* Individual picker */}
                {target === "individual" && (
                  <div>
                    {peopleLoading ? (
                      <div className="flex items-center gap-2 py-2 text-sm text-[var(--fg-muted)]">
                        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                          <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                        </svg>
                        Loading people…
                      </div>
                    ) : (
                      <RecipientSelect
                        people={people}
                        selected={selectedPeople}
                        onChange={setSelectedPeople}
                      />
                    )}
                  </div>
                )}

                <hr className="border-[var(--border)]" />

                <div className="flex items-center gap-3">
                  <Button onClick={handleSend} loading={sending} disabled={sending} className="min-w-[140px]">
                    <Icon.Send className="h-3.5 w-3.5" />
                    {sending ? "Sending…" : "Send notification"}
                  </Button>

                  {result && (
                    <div className={cn(
                      "flex items-center gap-2.5 rounded-lg border px-3.5 py-2 text-sm",
                      result.failed === 0
                        ? "border-[var(--success)]/30 bg-[var(--success-soft)]"
                        : "border-[var(--warn)]/30 bg-[var(--warn-soft)]",
                    )}>
                      {result.failed === 0
                        ? <Icon.Check className="h-4 w-4 shrink-0 text-[var(--success)]" />
                        : <Icon.AlertTriangle className="h-4 w-4 shrink-0 text-[var(--warn)]" />}
                      <span>
                        <strong className="text-[var(--fg)]">{result.sent}</strong>
                        <span className="text-[var(--fg-muted)]"> sent</span>
                        {result.failed > 0 && (
                          <span className="text-[var(--fg-muted)]">
                            {" · "}<strong className="text-[var(--danger)]">{result.failed}</strong> failed
                          </span>
                        )}
                        <span className="text-[var(--fg-muted)]"> of {result.total}</span>
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Preview column */}
          <div className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle>
                    <span className="inline-flex items-center gap-2">
                      <Icon.FileText className="h-4 w-4 text-[var(--fg-muted)]" />
                      Preview
                    </span>
                  </CardTitle>
                  <Badge tone={target === "all" ? "accent" : "neutral"}>
                    {audienceLabel}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-hidden rounded-b-xl border-t border-[var(--border)] bg-[#f1f5f9]">
                  <div className="mx-4 mb-4 mt-4 overflow-hidden rounded-lg border border-[#e2e8f0] bg-white shadow-sm">
                    <div className="border-b border-[#e2e8f0] bg-[#fafafa] px-4 py-2.5">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-medium text-[#64748b]">To:</span>
                        <span className="text-[#0f172a]">{audienceLabel}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-medium text-[#64748b]">Subject:</span>
                        <span className={subject ? "font-medium text-[#0f172a]" : "italic text-[#94a3b8]"}>
                          {subject || "No subject"}
                        </span>
                      </div>
                    </div>

                    <div className="px-5 py-4">
                      <div className="mb-3 flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0d56d8] text-[11px] font-bold text-white">
                          {recipientName.charAt(0)}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-[#0f172a]">{recipientName}</div>
                          {target !== "individual" && (
                            <div className="text-[11px] text-[#94a3b8]">
                              {recipientName.toLowerCase()}@example.com
                            </div>
                          )}
                        </div>
                      </div>

                      <p className="mb-3 text-sm font-medium text-[#0f172a]">
                        Hi {recipientName},
                      </p>

                      {previewHtml ? (
                        <div
                          className="text-sm leading-relaxed text-[#334155] [&_br]:content-['']"
                          dangerouslySetInnerHTML={{ __html: previewHtml }}
                        />
                      ) : (
                        <div className="space-y-1">
                          <p className="text-sm italic text-[#94a3b8]">Your message will appear here…</p>
                          <div className="mt-3 flex flex-col gap-1.5">
                            <div className="h-3 w-full animate-pulse rounded bg-[#f1f5f9]" />
                            <div className="h-3 w-3/4 animate-pulse rounded bg-[#f1f5f9]" />
                            <div className="h-3 w-1/2 animate-pulse rounded bg-[#f1f5f9]" />
                          </div>
                        </div>
                      )}

                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle>
                  <span className="inline-flex items-center gap-2">
                    <Icon.Sparkles className="h-4 w-4 text-[var(--fg-muted)]" />
                    Tips
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {[
                  { icon: <Icon.Refresh className="h-3.5 w-3.5" />, text: "Line breaks in your message are preserved in the email." },
                  { icon: <Icon.Shield className="h-3.5 w-3.5" />, text: "Pending / unactivated accounts are excluded automatically." },
                  { icon: <Icon.Clock className="h-3.5 w-3.5" />, text: "Historical imported students are excluded." },
                  { icon: <Icon.Send className="h-3.5 w-3.5" />, text: "Test with a small cohort before sending to everyone." },
                ].map((tip) => (
                  <div key={tip.text} className="flex items-start gap-2.5 rounded-md bg-[var(--surface-muted)]/50 px-2.5 py-2">
                    <span className="mt-0.5 shrink-0 text-[var(--accent)]">{tip.icon}</span>
                    <span className="text-xs leading-relaxed text-[var(--fg-muted)]">{tip.text}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </TeacherShell>
  );
}
