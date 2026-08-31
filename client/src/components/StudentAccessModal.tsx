import { useEffect, useMemo, useState } from "react";
import { api, updateStudentAccess } from "../api";
import { toast } from "./Toast";
import { Button } from "./ui/Button";
import { Modal } from "./ui/Modal";
import { Input } from "./ui/Input";
import { Icon } from "./ui/Icons";
import { PERMISSION_GROUPS, PERMISSIONS, STUDENT_GRANTABLE_PERMISSIONS, type Assignment, type Permission, type StudentRecord } from "../types";

const GRANTABLE = new Set(STUDENT_GRANTABLE_PERMISSIONS);

/**
 * Hands a student extra responsibilities — grading, creating assignments,
 * seeing scores, etc. — without touching their role. They stay a student:
 * same dashboard, same submission flow, just a tick away from doing more.
 */
export default function StudentAccessModal({
  student,
  onClose,
  onSaved,
}: {
  student: StudentRecord | null;
  onClose: () => void;
  onSaved: (student: StudentRecord) => void;
}) {
  const [granted, setGranted] = useState<Set<Permission>>(new Set());
  const [scopeMode, setScopeMode] = useState<"all" | "selected">("all");
  const [selectedAssignments, setSelectedAssignments] = useState<Set<string>>(new Set());
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [assignmentSearch, setAssignmentSearch] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setGranted(new Set(student?.permissions ?? []));
    if (student?.allowedAssignmentIds && student.allowedAssignmentIds.length > 0) {
      setScopeMode("selected");
      setSelectedAssignments(new Set(student.allowedAssignmentIds));
    } else {
      setScopeMode("all");
      setSelectedAssignments(new Set());
    }
  }, [student]);

  useEffect(() => {
    if (!student) return;
    setAssignmentsLoading(true);
    api<Assignment[]>("/assignments")
      .then((data) => setAssignments(data))
      .catch(() => setAssignments([]))
      .finally(() => setAssignmentsLoading(false));
  }, [student]);

  const hasGradingOrScores = useMemo(() => {
    return granted.has("grades.edit") || granted.has("scores.view") || granted.has("reviews.run") || granted.has("submissions.manage");
  }, [granted]);

  const changed = useMemo(() => {
    const beforePerms = new Set(student?.permissions ?? []);
    if (beforePerms.size !== granted.size) return true;
    if ([...granted].some((key) => !beforePerms.has(key))) return true;

    const beforeScopeMode = (student?.allowedAssignmentIds && student.allowedAssignmentIds.length > 0) ? "selected" : "all";
    if (beforeScopeMode !== scopeMode) return true;

    if (scopeMode === "selected") {
      const beforeIds = new Set(student?.allowedAssignmentIds ?? []);
      if (beforeIds.size !== selectedAssignments.size) return true;
      if ([...selectedAssignments].some((id) => !beforeIds.has(id))) return true;
    }

    return false;
  }, [granted, scopeMode, selectedAssignments, student]);

  if (!student) return null;

  function togglePerm(key: Permission) {
    setGranted((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAssignment(id: string) {
    setSelectedAssignments((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllAssignments() {
    setSelectedAssignments(new Set(assignments.map((a) => a.id)));
  }

  function clearAllAssignments() {
    setSelectedAssignments(new Set());
  }

  async function save() {
    if (!student) return;
    if (scopeMode === "selected" && hasGradingOrScores && selectedAssignments.size === 0) {
      toast().error("Please select at least one assignment, or choose 'All assignments'.");
      return;
    }

    setSaving(true);
    try {
      const allowedAssignmentIds = scopeMode === "selected" ? [...selectedAssignments] : null;
      const result = await updateStudentAccess(student.id, [...granted], allowedAssignmentIds);
      onSaved({
        ...student,
        permissions: result.permissions,
        allowedAssignmentIds: result.allowedAssignmentIds,
        customAccess: result.customAccess,
      });
      toast().success(
        granted.size === 0 ? `Access cleared for ${student.fullName}` : `Access updated for ${student.fullName}`,
      );
      onClose();
    } catch (err) {
      toast().error(err instanceof Error ? err.message : "Could not save access");
    } finally {
      setSaving(false);
    }
  }

  async function clearAccess() {
    if (!student) return;
    setSaving(true);
    try {
      const result = await updateStudentAccess(student.id, [], null);
      onSaved({
        ...student,
        permissions: result.permissions,
        allowedAssignmentIds: result.allowedAssignmentIds,
        customAccess: result.customAccess,
      });
      toast().success(`Access cleared for ${student.fullName}`);
      onClose();
    } catch (err) {
      toast().error(err instanceof Error ? err.message : "Could not clear access");
    } finally {
      setSaving(false);
    }
  }

  const filteredAssignments = assignments.filter((a) =>
    a.title.toLowerCase().includes(assignmentSearch.trim().toLowerCase()),
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={`Access for ${student.fullName}`}
      size="lg"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" size="sm" disabled={saving || (granted.size === 0 && !student.customAccess)} onClick={() => void clearAccess()}>
            Clear access
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" loading={saving} disabled={!changed} onClick={() => void save()}>
              Save access
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-5 max-h-[70vh] overflow-y-auto pr-1">
        <p className="text-xs text-[var(--fg-muted)]">
          They stay a student — same dashboard, same submissions. Ticking anything below just adds it on top.
        </p>

        {/* Permissions Groups */}
        <div className="flex flex-col gap-4">
          {PERMISSION_GROUPS.map((group) => {
            const entries = PERMISSIONS.filter((entry) => entry.group === group && GRANTABLE.has(entry.key));
            if (entries.length === 0) return null;
            return (
              <div key={group} className="flex flex-col gap-2">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-muted)]">{group}</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {entries.map((entry) => {
                    const isChecked = granted.has(entry.key);
                    return (
                      <label
                        key={entry.key}
                        className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 text-sm transition-colors ${
                          isChecked
                            ? "border-[var(--accent)] bg-[var(--accent-soft)]/20"
                            : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-strong)]"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => togglePerm(entry.key)}
                          className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
                        />
                        <span className="text-xs font-medium text-[var(--fg)]">{entry.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Graded Assignment Scope Selection */}
        {hasGradingOrScores && (
          <div className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]/40 p-4">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wider text-[var(--fg)]">
                Assignment Access Scope
              </div>
              <span className="text-[11px] text-[var(--fg-muted)]">
                Control which assignments this student can grade or view
              </span>
            </div>

            <div className="flex items-center gap-4 text-xs">
              <label className="flex cursor-pointer items-center gap-2 font-medium text-[var(--fg)]">
                <input
                  type="radio"
                  name="scopeMode"
                  value="all"
                  checked={scopeMode === "all"}
                  onChange={() => setScopeMode("all")}
                  className="accent-[var(--accent)]"
                />
                All assignments (workspace-wide)
              </label>
              <label className="flex cursor-pointer items-center gap-2 font-medium text-[var(--fg)]">
                <input
                  type="radio"
                  name="scopeMode"
                  value="selected"
                  checked={scopeMode === "selected"}
                  onChange={() => setScopeMode("selected")}
                  className="accent-[var(--accent)]"
                />
                Selected assignments only ({selectedAssignments.size})
              </label>
            </div>

            {scopeMode === "selected" && (
              <div className="mt-2 flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="relative flex-1">
                    <Icon.Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--fg-subtle)]" />
                    <Input
                      value={assignmentSearch}
                      onChange={(e) => setAssignmentSearch(e.target.value)}
                      placeholder="Filter assignments..."
                      className="h-8 pl-8 text-xs"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={selectAllAssignments} className="text-xs">
                      Select all
                    </Button>
                    <Button variant="ghost" size="sm" onClick={clearAllAssignments} className="text-xs">
                      Clear
                    </Button>
                  </div>
                </div>

                {assignmentsLoading ? (
                  <div className="py-4 text-center text-xs text-[var(--fg-muted)]">Loading assignments...</div>
                ) : filteredAssignments.length === 0 ? (
                  <div className="py-4 text-center text-xs text-[var(--fg-muted)]">No assignments found.</div>
                ) : (
                  <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pt-1">
                    {filteredAssignments.map((a) => {
                      const isSelected = selectedAssignments.has(a.id);
                      return (
                        <label
                          key={a.id}
                          className={`flex cursor-pointer items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors ${
                            isSelected
                              ? "bg-[var(--accent-soft)]/30 text-[var(--fg)] font-medium"
                              : "hover:bg-[var(--surface-muted)] text-[var(--fg-muted)]"
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleAssignment(a.id)}
                              className="h-3.5 w-3.5 accent-[var(--accent)]"
                            />
                            <span className="truncate">{a.title}</span>
                          </div>
                          {a.isGroupAssignment && (
                            <span className="shrink-0 rounded bg-[var(--surface-muted)] px-1.5 py-0.5 text-[10px] text-[var(--fg-subtle)]">
                              Group
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
