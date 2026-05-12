import { useEffect, useMemo, useState, type DragEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import TeacherShell from "../components/TeacherShell";
import { toast } from "../components/Toast";
import { Button } from "../components/ui/Button";
import { Card, CardContent } from "../components/ui/Card";
import { Icon } from "../components/ui/Icons";
import { Input } from "../components/ui/Input";
import { PageHeader } from "../components/ui/PageHeader";
import { api } from "../api";
import type { Assignment, AssignmentGroup } from "../types";

type Member = { id: string; fullName: string; email: string };
type GroupsPayload = {
  groups: AssignmentGroup[];
  members: Record<string, Member>;
};

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
    if (fromGroup === toGroupId) return;
    setGroups((prev) =>
      prev.map((g) => {
        if (g.id === fromGroup) return { ...g, memberIds: g.memberIds.filter((m) => m !== memberId) };
        if (g.id === toGroupId) return { ...g, memberIds: [...g.memberIds, memberId] };
        return g;
      }),
    );
    setDragMember(null);
  }

  function renameGroup(groupId: string, name: string) {
    setGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, name } : g)));
  }

  function addGroup() {
    const num = groups.length + 1;
    setGroups((prev) => [
      ...prev,
      { id: `new-${Date.now()}`, assignmentId: id!, name: `Group ${num}`, memberIds: [] },
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
        groups: groups.map((g) => ({ id: g.id.startsWith("new-") ? undefined : g.id, name: g.name, memberIds: g.memberIds })),
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
        body: JSON.stringify({ groupCount: regenCount }),
      });
      setGroups(res.groups);
      // Refetch members in case roster changed
      const g = await api<GroupsPayload>(`/assignments/${id}/groups`);
      setMembers(g.members);
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
      <TeacherShell section="assignments">
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--fg-muted)]">
          Loading groups...
        </div>
      </TeacherShell>
    );
  }

  if (!assignment || !assignment.isGroupAssignment) {
    return (
      <TeacherShell section="assignments">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 py-12 text-center">
          <PageHeader title="Not a group project" description="This assignment is not configured as a group project." />
          <Button onClick={() => navigate("/teacher")}>Back to dashboard</Button>
        </div>
      </TeacherShell>
    );
  }

  return (
    <TeacherShell section="assignments">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Link
            to="/teacher"
            className="inline-flex w-fit items-center gap-1 text-xs font-medium text-[var(--fg-muted)] hover:text-[var(--accent)]"
          >
            <Icon.ChevronLeft className="h-3 w-3" />
            Dashboard
          </Link>
          <PageHeader
            title={`Groups · ${assignment.title}`}
            description={`${groups.length} group${groups.length === 1 ? "" : "s"} · ${totalAssigned} member${totalAssigned === 1 ? "" : "s"} assigned. Drag members between groups, then save.`}
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
                        <Icon.Users className="h-3.5 w-3.5 shrink-0 text-[var(--fg-muted)]" />
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </TeacherShell>
  );
}
