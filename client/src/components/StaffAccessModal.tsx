import { useEffect, useMemo, useState } from "react";
import { updateStaffAccess } from "../api";
import { toast } from "./Toast";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";
import { Modal } from "./ui/Modal";
import { PERMISSION_GROUPS, PERMISSIONS, STAFF_ROLE_LABELS, type Permission, type StaffMember } from "../types";

/**
 * Picks exactly what one staff member can do. Roles only decide where someone
 * starts — a teaching assistant who also runs the quizzes is a tick away.
 */
export default function StaffAccessModal({
  member,
  onClose,
  onSaved,
}: {
  member: StaffMember | null;
  onClose: () => void;
  onSaved: (member: StaffMember) => void;
}) {
  const [granted, setGranted] = useState<Set<Permission>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setGranted(new Set(member?.permissions ?? []));
  }, [member]);

  const changed = useMemo(() => {
    const before = new Set(member?.permissions ?? []);
    if (before.size !== granted.size) return true;
    return [...granted].some((key) => !before.has(key));
  }, [granted, member]);

  if (!member) return null;

  function toggle(key: Permission) {
    setGranted((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function save(useRoleDefaults = false) {
    if (!member) return;
    setSaving(true);
    try {
      const result = await updateStaffAccess(member.id,
        useRoleDefaults ? { useRoleDefaults: true } : { permissions: [...granted] },
      );
      onSaved({ ...member, permissions: result.permissions, customAccess: result.customAccess });
      toast().success(useRoleDefaults ? `${member.fullName} follows the role defaults again` : `Access updated for ${member.fullName}`);
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
      title={`Access for ${member.fullName}`}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" size="sm" disabled={saving || !member.customAccess} onClick={() => void save(true)}>
            Reset to role defaults
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" loading={saving} disabled={!changed && member.customAccess} onClick={() => void save()}>
              Save access
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--fg-muted)]">
          <Badge tone="accent">{STAFF_ROLE_LABELS[member.role] ?? member.role}</Badge>
          {member.customAccess ? (
            <span>Access has been set by hand for this person.</span>
          ) : (
            <span>Following the defaults for this role. Ticking anything below pins their access.</span>
          )}
        </div>

        <div className="flex flex-col gap-4">
          {PERMISSION_GROUPS.map((group) => (
            <div key={group} className="flex flex-col gap-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-muted)]">{group}</div>
              <div className="flex flex-col gap-1.5">
                {PERMISSIONS.filter((entry) => entry.group === group).map((entry) => (
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
          ))}
        </div>
      </div>
    </Modal>
  );
}
