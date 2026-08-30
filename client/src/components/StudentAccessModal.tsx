import { useEffect, useMemo, useState } from "react";
import { updateStudentAccess } from "../api";
import { toast } from "./Toast";
import { Button } from "./ui/Button";
import { Modal } from "./ui/Modal";
import { PERMISSION_GROUPS, PERMISSIONS, STUDENT_GRANTABLE_PERMISSIONS, type Permission, type StudentRecord } from "../types";

const GRANTABLE = new Set(STUDENT_GRANTABLE_PERMISSIONS);

/**
 * Hands a student extra responsibilities — grading, creating assignments,
 * etc. — without touching their role. They stay a student: same dashboard,
 * same submission flow, just a tick away from doing more.
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
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setGranted(new Set(student?.permissions ?? []));
  }, [student]);

  const changed = useMemo(() => {
    const before = new Set(student?.permissions ?? []);
    if (before.size !== granted.size) return true;
    return [...granted].some((key) => !before.has(key));
  }, [granted, student]);

  if (!student) return null;

  function toggle(key: Permission) {
    setGranted((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function save(permissions: Permission[]) {
    if (!student) return;
    setSaving(true);
    try {
      const result = await updateStudentAccess(student.id, permissions);
      onSaved({ ...student, permissions: result.permissions, customAccess: result.customAccess });
      toast().success(
        permissions.length === 0 ? `Access cleared for ${student.fullName}` : `Access updated for ${student.fullName}`,
      );
      onClose();
    } catch (err) {
      toast().error(err instanceof Error ? err.message : "Could not save access");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Access for ${student.fullName}`}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" size="sm" disabled={saving || granted.size === 0} onClick={() => void save([])}>
            Clear access
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" loading={saving} disabled={!changed} onClick={() => void save([...granted])}>
              Save access
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-xs text-[var(--fg-muted)]">
          They stay a student — same dashboard, same submissions. Ticking anything below just adds it on top.
        </p>

        <div className="flex flex-col gap-4">
          {PERMISSION_GROUPS.map((group) => {
            const entries = PERMISSIONS.filter((entry) => entry.group === group && GRANTABLE.has(entry.key));
            if (entries.length === 0) return null;
            return (
              <div key={group} className="flex flex-col gap-2">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-muted)]">{group}</div>
                <div className="flex flex-col gap-1.5">
                  {entries.map((entry) => (
                    <label
                      key={entry.key}
                      className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm transition-colors hover:border-[var(--border-strong)]"
                    >
                      <input
                        type="checkbox"
                        checked={granted.has(entry.key)}
                        onChange={() => toggle(entry.key)}
                        className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
                      />
                      <span className="text-[var(--fg)]">{entry.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
