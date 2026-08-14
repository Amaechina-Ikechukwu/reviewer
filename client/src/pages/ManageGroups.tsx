import { useEffect, useMemo, useState, type ChangeEvent, type DragEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import TeacherShell from "../components/TeacherShell";
import { toast } from "../components/Toast";
import { Button } from "../components/ui/Button";
import { Card, CardContent } from "../components/ui/Card";
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

  return (
    <TeacherShell section="groupProjects">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Link
            to="/teacher/group-projects"
            className="inline-flex w-fit items-center gap-1 text-xs font-medium text-[var(--fg-muted)] hover:text-[var(--accent)]"
          >
            <Icon.ChevronLeft className="h-3 w-3" />
            Group projects
          </Link>
          <PageHeader
            title={`Groups · ${assignment.title}`}
            description={
              `${groups.length} group${groups.length === 1 ? "" : "s"} · ${totalAssigned} member${totalAssigned === 1 ? "" : "s"} assigned · ` +
              (assignment.groupQuestionMode === "per_group"
                ? "Each team has its own description and rubric."
                : "All teams answer the same questions.") +
              " Drag members between groups, then save. Students are emailed when teams change."
            }
          />
        </div>

        <Card>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div className="flex items-end gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--fg-muted)]">Re-shuffle into</label>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={regenCount}
                  onChange={(e) => setRegenCount(Math.max(1, Number(e.target.value) || 1))}
                  className="w-24"
                />
              </div>
              <Button variant="secondary" onClick={regenerate} loading={saving}>
                <Icon.Refresh className="h-3.5 w-3.5" />
                Re-shuffle
              </Button>
            </div>
            <div className="flex flex-1 justify-end gap-2">
              <Button variant="ghost" onClick={addGroup}>
                <Icon.Plus className="h-3.5 w-3.5" />
                Add group
              </Button>
              <Button onClick={save} loading={saving}>
                <Icon.Check className="h-3.5 w-3.5" />
                Save changes
              </Button>
            </div>
          </CardContent>
        </Card>

        {error && (
          <div className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger)]">
            {error}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((g) => (
            <Card
              key={g.id}
              onDragOver={(e) => onDragOver(e as unknown as DragEvent, g.id)}
              onDragLeave={() => setHoverGroup((h) => (h === g.id ? null : h))}
              onDrop={(e) => onDrop(e as unknown as DragEvent, g.id)}
              className={hoverGroup === g.id ? "ring-2 ring-[var(--accent)]" : undefined}
            >
              <CardContent className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <Input
                    value={g.name}
                    onChange={(e) => renameGroup(g.id, e.target.value)}
                    className="flex-1 font-semibold"
                  />
                  <span className="text-xs text-[var(--fg-muted)]">{g.memberIds.length}</span>
                  <button
                    type="button"
                    onClick={() => removeGroup(g.id)}
                    title="Delete group"
                    className="rounded-md p-1.5 text-[var(--fg-muted)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
                  >
                    <Icon.Trash className="h-4 w-4" />
                  </button>
                </div>
                {assignment?.groupQuestionMode === "per_group" && (
                  <div className="flex flex-col gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-muted)]/40 p-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-muted)]">
                      Team-specific questions
                    </div>
                    {/* Source type selector */}
                    <div className="flex gap-1">
                      {(["markdown", "link", "pdf"] as GroupSourceType[]).map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => updateGroupField(g.id, { sourceType: type })}
                          className={`flex-1 rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                            (g.sourceType ?? "markdown") === type
                              ? "bg-[var(--accent)] text-white"
                              : "bg-[var(--surface)] text-[var(--fg-muted)] border border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                          }`}
                        >
                          {type === "markdown" ? "Markdown" : type === "link" ? "Link" : "PDF"}
                        </button>
                      ))}
                    </div>

                    {/* Source input by type */}
                    {(g.sourceType ?? "markdown") === "markdown" && (
                      <Textarea
                        rows={3}
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
                          className="text-xs text-[var(--fg-muted)] file:mr-2 file:rounded file:border file:border-[var(--border)] file:bg-[var(--surface)] file:px-2 file:py-1 file:text-xs file:text-[var(--fg)] file:hover:bg-[var(--surface-muted)]"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const fd = new FormData();
                            fd.append("file", file);
                            try {
                              const res = await api<{ briefId: string }>("/assignments/upload-brief", { method: "POST", body: fd });
                              updateGroupField(g.id, { sourcePdfPath: res.briefId });
                            } catch (err: any) {
                              toast().error(err.message ?? "Upload failed");
                            } finally {
                              e.target.value = "";
                            }
                          }}
                        />
                        {g.sourcePdfPath && (
                          <span className="text-[11px] text-[var(--accent)]">PDF uploaded ✓</span>
                        )}
                      </div>
                    )}

                    {/* Rubric (always shown) */}
                    <Textarea
                      rows={2}
                      placeholder="Rubric for this team only…"
                      value={g.rubric ?? ""}
                      onChange={(e) => updateGroupField(g.id, { rubric: e.target.value })}
                    />
                  </div>
                )}

                {/* Team assets — displayed in-app to this team only */}
                <div className="flex flex-col gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-muted)]/40 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-muted)]">
                      Team assets
                    </div>
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
                    className="text-xs text-[var(--fg-muted)] file:mr-2 file:rounded file:border file:border-[var(--border)] file:bg-[var(--surface)] file:px-2 file:py-1 file:text-xs file:text-[var(--fg)] file:hover:bg-[var(--surface-muted)]"
                    onChange={(e) => handleAssetUpload(g.id, e)}
                  />
                  {(g.assets ?? []).length === 0 ? (
                    <span className="text-[11px] text-[var(--fg-muted)]">
                      PDFs and images show inline for this team.
                    </span>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {(g.assets ?? []).map((a) => (
                        <div
                          key={a.id}
                          className="flex items-center gap-1.5 rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[11px]"
                        >
                          <Icon.FileText className="h-3 w-3 shrink-0 text-[var(--fg-muted)]" />
                          <span className="min-w-0 flex-1 truncate">{a.name}</span>
                          <button
                            type="button"
                            onClick={() => removeAsset(g.id, a.id)}
                            title="Remove asset"
                            className="shrink-0 rounded p-0.5 text-[var(--fg-muted)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
                          >
                            <Icon.X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex min-h-[80px] flex-col gap-1.5">
                  {g.memberIds.length === 0 && (
                    <div className="rounded-md border border-dashed border-[var(--border)] px-3 py-4 text-center text-xs text-[var(--fg-muted)]">
                      Drop members here
                    </div>
                  )}
                  {g.memberIds.map((mId) => {
                    const m = members[mId];
                    return (
                      <div
                        key={mId}
                        draggable
                        onDragStart={() => onDragStart(mId, g.id)}
                        className="flex cursor-move items-center justify-between gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm transition-colors hover:border-[var(--border-strong)]"
                      >
                        <div className="flex min-w-0 flex-col">
                          <div className="truncate font-medium">{m?.fullName || "Unknown student"}</div>
                          {m && !m.email.endsWith("@historical.reviewai.local") && (
                            <div className="truncate text-[11px] text-[var(--fg-muted)]">{m.email}</div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => excludeMember(mId, g.id)}
                          title="Remove from this project"
                          className="shrink-0 rounded p-1 text-[var(--fg-muted)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
                        >
                          <Icon.X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Students in no group — excluded from the project until dragged into a team */}
        <Card
          onDragOver={(e) => onDragOver(e as unknown as DragEvent, UNASSIGNED)}
          onDragLeave={() => setHoverGroup((h) => (h === UNASSIGNED ? null : h))}
          onDrop={(e) => onDrop(e as unknown as DragEvent, UNASSIGNED)}
          className={hoverGroup === UNASSIGNED ? "ring-2 ring-[var(--accent)]" : undefined}
        >
          <CardContent className="flex flex-col gap-2">
            <div className="text-sm font-semibold text-[var(--fg)]">
              Not participating
              <span className="ml-1 text-xs font-normal text-[var(--fg-muted)]">
                ({unassigned.length}) — in no team. Drag a student here to exclude them, or back into a team to include them.
              </span>
            </div>
            {unassigned.length === 0 ? (
              <div className="rounded-md border border-dashed border-[var(--border)] px-3 py-4 text-center text-xs text-[var(--fg-muted)]">
                Everyone is assigned to a team.
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {unassigned.map((mId) => {
                  const m = members[mId];
                  return (
                    <div
                      key={mId}
                      draggable
                      onDragStart={() => onDragStart(mId, UNASSIGNED)}
                      className="flex cursor-move items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-1.5 text-xs text-[var(--fg-muted)]"
                    >
                      <Icon.Users className="h-3 w-3 shrink-0" />
                      {m?.fullName || "Unknown student"}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </TeacherShell>
  );
}
