import { useEffect, useMemo, useState, type ChangeEvent, type DragEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import TeacherShell from "../components/TeacherShell";
import { toast } from "../components/Toast";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Icon } from "../components/ui/Icons";
import { Input, Textarea } from "../components/ui/Input";
import { PageHeader } from "../components/ui/PageHeader";
import { api } from "../api";
import type { Assignment, AssignmentGroup, GroupAsset, GroupSourceType, StudentRecord } from "../types";

type Member = { id: string; fullName: string; email: string };
type GroupsPayload = {
  groups: AssignmentGroup[];
  members: Record<string, Member>;
};

const UNASSIGNED = "__unassigned__";

export default function ManageGroups() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [groups, setGroups] = useState<AssignmentGroup[]>([]);
  const [members, setMembers] = useState<Record<string, Member>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [dragMember, setDragMember] = useState<{ memberId: string; fromGroup: string } | null>(null);
  const [hoverGroup, setHoverGroup] = useState<string | null>(null);
  const [regenCount, setRegenCount] = useState(0);
  const [unassigned, setUnassigned] = useState<string[]>([]);
  const [copiedGroup, setCopiedGroup] = useState<string | null>(null);
  const [panels, setPanels] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const a = await api<Assignment>(`/assignments/${id}`);
        setAssignment(a);
        setRegenCount(a.groupCount || 0);
        const g = await api<GroupsPayload>(`/assignments/${id}/groups`);
        setGroups(g.groups);
        setMembers(g.members);

        // Roster for this assignment's cohort, so students who are in no group
        // are still visible and can be dragged back in.
        const all = await api<StudentRecord[]>("/students").catch(() => [] as StudentRecord[]);
        const eligible = a.cohortId ? all.filter((s) => s.cohortId === a.cohortId) : all;
        setMembers((prev) => {
          const next = { ...prev };
          for (const s of eligible) {
            if (!next[s.id]) next[s.id] = { id: s.id, fullName: s.fullName, email: s.email };
          }
          return next;
        });
        const assigned = new Set(g.groups.flatMap((x) => x.memberIds));
        setUnassigned(eligible.filter((s) => !assigned.has(s.id)).map((s) => s.id));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load groups");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const totalAssigned = useMemo(
    () => groups.reduce((sum, g) => sum + g.memberIds.length, 0),
    [groups],
  );

  function onDragStart(memberId: string, fromGroup: string) {
    setDragMember({ memberId, fromGroup });
  }

  function onDragOver(e: DragEvent, groupId: string) {
    e.preventDefault();
    setHoverGroup(groupId);
  }

  function onDrop(e: DragEvent, toGroupId: string) {
    e.preventDefault();
    setHoverGroup(null);
    if (!dragMember) return;
    const { memberId, fromGroup } = dragMember;
    setDragMember(null);
    if (fromGroup === toGroupId) return;

    setGroups((prev) =>
      prev.map((g) => {
        if (g.id === fromGroup) return { ...g, memberIds: g.memberIds.filter((m) => m !== memberId) };
        if (g.id === toGroupId) return { ...g, memberIds: [...g.memberIds, memberId] };
        return g;
      }),
    );
    setUnassigned((prev) => {
      if (toGroupId === UNASSIGNED) return prev.includes(memberId) ? prev : [...prev, memberId];
      return prev.filter((m) => m !== memberId);
    });
  }

  function excludeMember(memberId: string, fromGroup: string) {
    setGroups((prev) =>
      prev.map((g) => (g.id === fromGroup ? { ...g, memberIds: g.memberIds.filter((m) => m !== memberId) } : g)),
    );
    setUnassigned((prev) => (prev.includes(memberId) ? prev : [...prev, memberId]));
  }

  function renameGroup(groupId: string, name: string) {
    setGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, name } : g)));
  }

  function updateGroupField(groupId: string, patch: Partial<AssignmentGroup>) {
    setGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, ...patch } : g)));
  }

  async function handleAssetUpload(groupId: string, e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    try {
      for (const file of files) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await api<{ assetId: string; ext: string; name: string }>("/assignments/upload-group-asset", {
          method: "POST",
          body: fd,
        });
        setGroups((prev) =>
          prev.map((g) =>
            g.id === groupId
              ? {
                  ...g,
                  assets: [
                    ...(g.assets ?? []),
                    { id: res.assetId, name: res.name, kind: "file" as const, ext: res.ext, url: null },
                  ],
                }
              : g,
          ),
        );
      }
      toast().success("Asset uploaded — remember to save changes.");
    } catch (err) {
      toast().error(err instanceof Error ? err.message : "Asset upload failed");
    } finally {
      e.target.value = "";
    }
  }

  function addAssetLink(groupId: string) {
    const url = prompt("Link URL (https://…)");
    if (!url || !/^https?:\/\//i.test(url.trim())) {
      if (url) toast().error("Please enter a URL starting with http:// or https://");
      return;
    }
    const name = prompt("Label for this link (optional)") || url.trim();
    const asset: GroupAsset = { id: crypto.randomUUID(), name, kind: "link", ext: null, url: url.trim() };
    setGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, assets: [...(g.assets ?? []), asset] } : g)));
  }

  async function copyGroupLink(groupId: string) {
    if (!id) return;
    if (groupId.startsWith("new-")) {
      toast().error("Save changes first, then copy this team's link.");
      return;
    }
    try {
      const g = groups.find((x) => x.id === groupId);
      const token =
        g?.shareToken ||
        (await api<{ shareToken: string }>(`/assignments/${id}/groups/${groupId}/share`, { method: "POST" })).shareToken;
      updateGroupField(groupId, { shareToken: token });
      await navigator.clipboard.writeText(`${window.location.origin}/g/${token}`);
      setCopiedGroup(groupId);
      setTimeout(() => setCopiedGroup((c) => (c === groupId ? null : c)), 2000);
    } catch (err) {
      toast().error(err instanceof Error ? err.message : "Could not copy link");
    }
  }

  function removeAsset(groupId: string, assetId: string) {
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, assets: (g.assets ?? []).filter((a) => a.id !== assetId) } : g)),
    );
  }

  function addGroup() {
    const num = groups.length + 1;
    setGroups((prev) => [
      ...prev,
      { id: `new-${Date.now()}`, assignmentId: id!, name: `Group ${num}`, memberIds: [], description: null, rubric: null },
    ]);
  }

  function removeGroup(groupId: string) {
    const g = groups.find((x) => x.id === groupId);
    if (!g) return;
    if (g.memberIds.length > 0) {
      toast().error("Move members out before deleting this group.");
      return;
    }
    setGroups((prev) => prev.filter((x) => x.id !== groupId));
  }

  async function save() {
    if (!id) return;
    setSaving(true);
    setError("");
    try {
      const payload = {
        groups: groups.map((g) => ({
          id: g.id.startsWith("new-") ? undefined : g.id,
          name: g.name,
          memberIds: g.memberIds,
          description: g.description ?? null,
          rubric: g.rubric ?? null,
          sourceType: g.sourceType ?? null,
          sourceUrl: g.sourceUrl ?? null,
          sourcePdfPath: g.sourcePdfPath ?? null,
          assets: g.assets ?? [],
        })),
      };
      const res = await api<{ groups: AssignmentGroup[] }>(`/assignments/${id}/groups`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      setGroups(res.groups);
      toast().success("Groups saved");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save groups";
      setError(msg);
      toast().error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function regenerate() {
    if (!id) return;
    if (!confirm(`Re-shuffle all students into ${regenCount} groups? This replaces the current composition.`)) return;
    setSaving(true);
    setError("");
    try {
      const res = await api<{ groups: AssignmentGroup[] }>(`/assignments/${id}/groups/regenerate`, {
        method: "POST",
        body: JSON.stringify({ groupCount: regenCount, excludedStudentIds: unassigned }),
      });
      setGroups(res.groups);
      // Refetch members in case roster changed
      const g = await api<GroupsPayload>(`/assignments/${id}/groups`);
      setMembers((prev) => ({ ...prev, ...g.members }));
      toast().success("Groups regenerated");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to regenerate";
      setError(msg);
      toast().error(msg);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <TeacherShell section="groupProjects">
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--fg-muted)]">
          Loading groups...
        </div>
      </TeacherShell>
    );
  }

  if (!assignment || !assignment.isGroupAssignment) {
    return (
      <TeacherShell section="groupProjects">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 py-12 text-center">
          <PageHeader title="Not a group project" description="This assignment is not configured as a group project." />
          <Button onClick={() => navigate("/teacher/group-projects")}>Back to group projects</Button>
        </div>
      </TeacherShell>
    );
  }

  const perTeamQuestions = assignment.groupQuestionMode === "per_group";
  const togglePanel = (key: string) => setPanels((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <TeacherShell section="groupProjects">
      <div className="flex flex-col gap-5">
        <div className="border-b border-[var(--border)] pb-5">
          <Link
            to={`/teacher/assignments/${id}`}
            className="inline-flex w-fit items-center gap-1 text-xs font-medium text-[var(--fg-muted)] hover:text-[var(--accent)]"
          >
            <Icon.ChevronLeft className="h-3 w-3" />
            Back to project
          </Link>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-[var(--fg-muted)]">
                <Icon.Users className="h-3.5 w-3.5" />
                Teams
              </div>
              <h1 className="text-2xl font-semibold tracking-tight">{assignment.title}</h1>
              <p className="mt-1 max-w-2xl text-sm text-[var(--fg-muted)]">
                Drag members between teams, then save. Students are emailed when teams change.{" "}
                {perTeamQuestions
                  ? "Each team has its own brief and rubric."
                  : "All teams answer the same questions."}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge>
                {groups.length} team{groups.length === 1 ? "" : "s"}
              </Badge>
              <Badge tone="accent">{totalAssigned} assigned</Badge>
              {unassigned.length > 0 && <Badge tone="warn">{unassigned.length} sitting out</Badge>}
            </div>
          </div>
        </div>

        <div className="sticky top-14 z-20 flex flex-wrap items-center justify-between gap-3 border border-[var(--border)] bg-[var(--surface)]/95 px-4 py-3 backdrop-blur">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-[var(--fg-muted)]">Re-shuffle into</span>
            <Input
              type="number"
              min={1}
              max={50}
              value={regenCount}
              onChange={(e) => setRegenCount(Math.max(1, Number(e.target.value) || 1))}
              className="h-8 w-16 px-2 text-center"
              aria-label="Number of teams to re-shuffle into"
            />
            <span className="text-xs text-[var(--fg-muted)]">teams</span>
            <Button variant="secondary" size="sm" onClick={regenerate} loading={saving}>
              <Icon.Refresh className="h-3.5 w-3.5" />
              Re-shuffle
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={addGroup}>
              <Icon.Plus className="h-3.5 w-3.5" />
              Add team
            </Button>
            <Button size="sm" onClick={save} loading={saving}>
              <Icon.Check className="h-3.5 w-3.5" />
              Save changes
            </Button>
          </div>
        </div>

        {error && (
          <div className="border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger)]">
            {error}
          </div>
        )}

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="grid min-w-0 gap-4 md:grid-cols-2">
            {groups.map((g, index) => {
              const briefKey = `${g.id}:brief`;
              const assetsKey = `${g.id}:assets`;
              const assets = g.assets ?? [];
              const isHovered = hoverGroup === g.id;
              const hasBrief = Boolean(g.description || g.sourceUrl || g.sourcePdfPath || g.rubric);
              return (
                <Card
                  key={g.id}
                  onDragOver={(e) => onDragOver(e as unknown as DragEvent, g.id)}
                  onDragLeave={() => setHoverGroup((h) => (h === g.id ? null : h))}
                  onDrop={(e) => onDrop(e as unknown as DragEvent, g.id)}
                  className={`flex flex-col transition-colors ${
                    isHovered ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/30" : ""
                  }`}
                >
                  <CardHeader className="gap-2 px-4 py-3">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center bg-[var(--accent-soft)] text-[11px] font-semibold text-[var(--accent)]">
                        {index + 1}
                      </span>
                      <input
                        value={g.name}
                        aria-label="Team name"
                        onChange={(e) => renameGroup(g.id, e.target.value)}
                        className="min-w-0 flex-1 border border-transparent bg-transparent px-1.5 py-1 text-sm font-semibold text-[var(--fg)] transition-colors hover:border-[var(--border)] focus:border-[var(--accent)] focus:bg-[var(--surface)] focus:outline-none"
                      />
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Badge tone={g.memberIds.length === 0 ? "warn" : "neutral"}>{g.memberIds.length}</Badge>
                      <button
                        type="button"
                        onClick={() => copyGroupLink(g.id)}
                        title="Copy the shareable link for this team"
                        className="p-1.5 text-[var(--fg-muted)] transition-colors hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
                      >
                        {copiedGroup === g.id ? (
                          <Icon.Check className="h-3.5 w-3.5" />
                        ) : (
                          <Icon.Link className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeGroup(g.id)}
                        title="Delete team"
                        className="p-1.5 text-[var(--fg-muted)] transition-colors hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
                      >
                        <Icon.Trash className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </CardHeader>

                  <CardContent className="flex flex-1 flex-col gap-3 p-4">
                    <div className="flex flex-col gap-1.5">
                      {g.memberIds.length === 0 ? (
                        <div
                          className={`border border-dashed px-3 py-6 text-center text-xs ${
                            isHovered
                              ? "border-[var(--accent)] text-[var(--accent)]"
                              : "border-[var(--border)] text-[var(--fg-muted)]"
                          }`}
                        >
                          Drop members here
                        </div>
                      ) : (
                        g.memberIds.map((mId) => {
                          const m = members[mId];
                          return (
                            <div
                              key={mId}
                              draggable
                              onDragStart={() => onDragStart(mId, g.id)}
                              className="group/member flex cursor-grab items-center gap-2 border border-[var(--border)] bg-[var(--surface-muted)]/40 px-2 py-1.5 transition-colors hover:border-[var(--border-strong)] active:cursor-grabbing"
                            >
                              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[10px] font-semibold text-[var(--accent)]">
                                {initials(m?.fullName)}
                              </span>
                              <div className="flex min-w-0 flex-1 flex-col">
                                <span className="truncate text-[13px] font-medium leading-tight">
                                  {m?.fullName || "Unknown student"}
                                </span>
                                {m && !m.email.endsWith("@historical.reviewai.local") && (
                                  <span className="truncate text-[11px] leading-tight text-[var(--fg-muted)]">
                                    {m.email}
                                  </span>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => excludeMember(mId, g.id)}
                                title="Remove from this project"
                                className="shrink-0 p-1 text-[var(--fg-subtle)] opacity-0 transition-opacity hover:text-[var(--danger)] focus:opacity-100 group-hover/member:opacity-100"
                              >
                                <Icon.X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>

                    <div className="mt-auto flex flex-col gap-2 border-t border-[var(--border)] pt-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {perTeamQuestions && (
                          <button
                            type="button"
                            onClick={() => togglePanel(briefKey)}
                            className={`inline-flex items-center gap-1.5 border px-2 py-1 text-[11px] font-medium transition-colors ${
                              panels[briefKey]
                                ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                                : "border-[var(--border)] text-[var(--fg-muted)] hover:border-[var(--border-strong)] hover:text-[var(--fg)]"
                            }`}
                          >
                            <Icon.FileText className="h-3 w-3" />
                            Team brief
                            {hasBrief && <span className="h-1.5 w-1.5 rounded-full bg-[var(--success)]" />}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => togglePanel(assetsKey)}
                          className={`inline-flex items-center gap-1.5 border px-2 py-1 text-[11px] font-medium transition-colors ${
                            panels[assetsKey]
                              ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                              : "border-[var(--border)] text-[var(--fg-muted)] hover:border-[var(--border-strong)] hover:text-[var(--fg)]"
                          }`}
                        >
                          <Icon.Folder className="h-3 w-3" />
                          Assets
                          {assets.length > 0 && (
                            <span className="bg-[var(--surface-muted)] px-1 text-[10px] font-semibold text-[var(--fg-muted)]">
                              {assets.length}
                            </span>
                          )}
                        </button>
                        {g.shareToken && (
                          <button
                            type="button"
                            onClick={() => copyGroupLink(g.id)}
                            title={`${window.location.origin}/g/${g.shareToken}`}
                            className="inline-flex items-center gap-1.5 border border-[var(--border)] px-2 py-1 font-mono text-[11px] text-[var(--fg-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                          >
                            <Icon.Link className="h-3 w-3" />
                            {copiedGroup === g.id ? "Copied!" : `/g/${g.shareToken.slice(0, 8)}…`}
                          </button>
                        )}
                      </div>

                      {perTeamQuestions && panels[briefKey] && (
                        <div className="flex flex-col gap-2 border border-[var(--border)] bg-[var(--surface-muted)]/40 p-3">
                          <div className="flex gap-1">
                            {(["markdown", "link", "pdf"] as GroupSourceType[]).map((type) => (
                              <button
                                key={type}
                                type="button"
                                onClick={() => updateGroupField(g.id, { sourceType: type })}
                                className={`flex-1 px-2 py-1 text-[11px] font-medium transition-colors ${
                                  (g.sourceType ?? "markdown") === type
                                    ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                                    : "border border-[var(--border)] bg-[var(--surface)] text-[var(--fg-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                                }`}
                              >
                                {type === "markdown" ? "Markdown" : type === "link" ? "Link" : "PDF"}
                              </button>
                            ))}
                          </div>

                          {(g.sourceType ?? "markdown") === "markdown" && (
                            <Textarea
                              rows={4}
                              placeholder="Description / prompt for this team (markdown)…"
                              value={g.description ?? ""}
                              onChange={(e) => updateGroupField(g.id, { description: e.target.value })}
                            />
                          )}
                          {g.sourceType === "link" && (
                            <Input
                              type="url"
                              placeholder="https://docs.google.com/… or any URL"
                              value={g.sourceUrl ?? ""}
                              onChange={(e) => updateGroupField(g.id, { sourceUrl: e.target.value })}
                            />
                          )}
                          {g.sourceType === "pdf" && (
                            <div className="flex flex-col gap-1.5">
                              <input
                                type="file"
                                accept=".pdf"
                                className="text-xs text-[var(--fg-muted)] file:mr-2 file:border file:border-[var(--border)] file:bg-[var(--surface)] file:px-2 file:py-1 file:text-xs file:text-[var(--fg)] file:hover:bg-[var(--surface-muted)]"
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  const fd = new FormData();
                                  fd.append("file", file);
                                  try {
                                    const res = await api<{ briefId: string }>("/assignments/upload-brief", {
                                      method: "POST",
                                      body: fd,
                                    });
                                    updateGroupField(g.id, { sourcePdfPath: res.briefId });
                                  } catch (err: any) {
                                    toast().error(err.message ?? "Upload failed");
                                  } finally {
                                    e.target.value = "";
                                  }
                                }}
                              />
                              {g.sourcePdfPath && (
                                <span className="inline-flex items-center gap-1 text-[11px] text-[var(--success)]">
                                  <Icon.Check className="h-3 w-3" />
                                  PDF uploaded
                                </span>
                              )}
                            </div>
                          )}

                          <div className="flex flex-col gap-1 pt-1">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--fg-muted)]">
                              Rubric for this team
                            </span>
                            <Textarea
                              rows={3}
                              placeholder="Rubric for this team only…"
                              value={g.rubric ?? ""}
                              onChange={(e) => updateGroupField(g.id, { rubric: e.target.value })}
                            />
                          </div>
                        </div>
                      )}

                      {panels[assetsKey] && (
                        <div className="flex flex-col gap-2 border border-[var(--border)] bg-[var(--surface-muted)]/40 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--fg-muted)]">
                              Shown in-app to this team
                            </span>
                            <button
                              type="button"
                              onClick={() => addAssetLink(g.id)}
                              className="text-[11px] font-medium text-[var(--accent)] hover:underline"
                            >
                              + Link
                            </button>
                          </div>
                          <input
                            type="file"
                            multiple
                            accept=".pdf,.png,.jpg,.jpeg,.gif,.webp"
                            className="text-xs text-[var(--fg-muted)] file:mr-2 file:border file:border-[var(--border)] file:bg-[var(--surface)] file:px-2 file:py-1 file:text-xs file:text-[var(--fg)] file:hover:bg-[var(--surface-muted)]"
                            onChange={(e) => handleAssetUpload(g.id, e)}
                          />
                          {assets.length === 0 ? (
                            <span className="text-[11px] text-[var(--fg-muted)]">
                              PDFs and images show inline for this team.
                            </span>
                          ) : (
                            <div className="flex flex-col gap-1">
                              {assets.map((a) => (
                                <div
                                  key={a.id}
                                  className="flex items-center gap-1.5 border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[11px]"
                                >
                                  {a.kind === "link" ? (
                                    <Icon.Link className="h-3 w-3 shrink-0 text-[var(--fg-muted)]" />
                                  ) : (
                                    <Icon.FileText className="h-3 w-3 shrink-0 text-[var(--fg-muted)]" />
                                  )}
                                  <span className="min-w-0 flex-1 truncate">{a.name}</span>
                                  <button
                                    type="button"
                                    onClick={() => removeAsset(g.id, a.id)}
                                    title="Remove asset"
                                    className="shrink-0 p-0.5 text-[var(--fg-muted)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
                                  >
                                    <Icon.X className="h-3 w-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            <button
              type="button"
              onClick={addGroup}
              className="flex min-h-[140px] flex-col items-center justify-center gap-2 border border-dashed border-[var(--border)] text-xs font-medium text-[var(--fg-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              <Icon.Plus className="h-4 w-4" />
              Add team
            </button>
          </div>

          <aside className="xl:sticky xl:top-32">
            <Card
              onDragOver={(e) => onDragOver(e as unknown as DragEvent, UNASSIGNED)}
              onDragLeave={() => setHoverGroup((h) => (h === UNASSIGNED ? null : h))}
              onDrop={(e) => onDrop(e as unknown as DragEvent, UNASSIGNED)}
              className={`transition-colors ${
                hoverGroup === UNASSIGNED ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/30" : ""
              }`}
            >
              <CardHeader className="px-4 py-3">
                <CardTitle className="text-sm">Not participating</CardTitle>
                <Badge tone={unassigned.length > 0 ? "warn" : "neutral"}>{unassigned.length}</Badge>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 p-4">
                <p className="text-[11px] leading-relaxed text-[var(--fg-muted)]">
                  Drag a student here to leave them out of this project, or back into a team to include them.
                </p>
                {unassigned.length === 0 ? (
                  <div
                    className={`border border-dashed px-3 py-6 text-center text-xs ${
                      hoverGroup === UNASSIGNED
                        ? "border-[var(--accent)] text-[var(--accent)]"
                        : "border-[var(--border)] text-[var(--fg-muted)]"
                    }`}
                  >
                    Everyone is on a team.
                  </div>
                ) : (
                  <div className="flex max-h-[60vh] flex-col gap-1.5 overflow-y-auto">
                    {unassigned.map((mId) => {
                      const m = members[mId];
                      return (
                        <div
                          key={mId}
                          draggable
                          onDragStart={() => onDragStart(mId, UNASSIGNED)}
                          className="flex cursor-grab items-center gap-2 border border-[var(--border)] bg-[var(--surface-muted)]/40 px-2 py-1.5 transition-colors hover:border-[var(--border-strong)] active:cursor-grabbing"
                        >
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--surface-muted)] text-[10px] font-semibold text-[var(--fg-muted)]">
                            {initials(m?.fullName)}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[13px]">
                            {m?.fullName || "Unknown student"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </TeacherShell>
  );
}

function initials(name?: string) {
  const parts = (name ?? "").split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((p) => p[0]!.toUpperCase()).join("") || "?";
}
