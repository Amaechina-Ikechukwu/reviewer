import { useEffect, useRef, useState, type FormEvent } from "react";
import TeacherShell from "../components/TeacherShell";
import { toast } from "../components/Toast";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icons";
import { Input, Label, Select } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { PageHeader } from "../components/ui/PageHeader";
import { Table, TBody, TD, TH, THead, TR, EmptyRow } from "../components/ui/Table";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import StaffAccessModal from "../components/StaffAccessModal";
import { PERMISSIONS, STAFF_ROLE_LABELS, type StaffMember, type StaffRole } from "../types";

type InviteResponse = StaffMember & {
  inviteLink?: string;
  emailSent?: boolean;
  emailError?: string;
  reinvited?: boolean;
};

type ResendResponse = {
  sent: boolean;
  inviteLink?: string;
  emailSent?: boolean;
  emailError?: string;
};

const ROLE_OPTIONS: StaffRole[] = ["owner", "admin", "manager", "instructor", "assistant"];

function RoleDropdown({ member, onChanged }: { member: StaffMember; onChanged: (role: StaffRole) => void }) {
  const [saving, setSaving] = useState(false);

  async function handleChange(e: { target: { value: string } }) {
    const role = e.target.value as StaffRole;
    setSaving(true);
    try {
      await api(`/staff/${member.id}/role`, { method: "PATCH", body: JSON.stringify({ role }) });
      onChanged(role);
      toast().success("Role updated");
    } catch (err) {
      toast().error(err instanceof Error ? err.message : "Failed to update role");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Select
      value={member.role}
      onChange={handleChange}
      disabled={saving}
      className="h-7 text-xs"
    >
      {ROLE_OPTIONS.map((r) => (
        <option key={r} value={r}>{STAFF_ROLE_LABELS[r]}</option>
      ))}
    </Select>
  );
}

function RowMenu({ member, onResend, onRemove }: {
  member: StaffMember;
  onResend: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <Button variant="ghost" size="icon" onClick={() => setOpen((o) => !o)} aria-label={`Actions for ${member.fullName}`}>
        <Icon.MoreHorizontal className="h-4 w-4" />
      </Button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-44 overflow-hidden border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-lg)] animate-fade-in">
          {member.pending && (
            <div className="py-1">
              <button
                type="button"
                onClick={() => { setOpen(false); onResend(); }}
                className="block w-full px-3 py-2 text-left text-xs font-medium text-[var(--fg)] hover:bg-[var(--surface-muted)]"
              >
                Resend invite
              </button>
            </div>
          )}
          <div className={member.pending ? "border-t border-[var(--border)] py-1" : "py-1"}>
            <button
              type="button"
              onClick={() => { setOpen(false); onRemove(); }}
              className="block w-full px-3 py-2 text-left text-xs font-medium text-[var(--danger)] hover:bg-[var(--danger-soft)]"
            >
              Remove staff
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function StaffPage() {
  const { user: currentUser } = useAuth();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);

  const [showInvite, setShowInvite] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<StaffRole>("instructor");
  const [inviteError, setInviteError] = useState("");
  const [inviting, setInviting] = useState(false);

  const [confirmRemove, setConfirmRemove] = useState<StaffMember | null>(null);
  const [accessFor, setAccessFor] = useState<StaffMember | null>(null);
  const [removing, setRemoving] = useState(false);

  const [inviteLinkInfo, setInviteLinkInfo] = useState<
    { email: string; link: string; emailSent: boolean; emailError?: string } | null
  >(null);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    api<StaffMember[]>("/staff")
      .then(setStaff)
      .catch(() => toast().error("Failed to load staff"))
      .finally(() => setLoading(false));
  }, []);

  function openInvite() {
    setInviteName("");
    setInviteEmail("");
    setInviteRole("instructor");
    setInviteError("");
    setShowInvite(true);
  }

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    setInviteError("");
    setInviting(true);
    try {
      const res = await api<InviteResponse>("/staff", {
        method: "POST",
        body: JSON.stringify({ fullName: inviteName, email: inviteEmail, role: inviteRole }),
      });
      const member: StaffMember = {
        id: res.id, email: res.email, fullName: res.fullName, role: res.role, pending: res.pending,
        // A fresh invite follows its role until someone edits the access.
        permissions: res.permissions ?? [],
        customAccess: false,
      };
      setStaff((prev) => {
        const existing = prev.find((s) => s.id === member.id);
        return existing ? prev.map((s) => s.id === member.id ? member : s) : [...prev, member];
      });
      setShowInvite(false);
      if (res.emailSent) {
        toast().success(res.reinvited ? `Invite re-sent to ${res.email}` : `Invite sent to ${res.email}`);
      } else {
        toast().error(`Couldn't email the invite — copy the link below to share it manually.`);
      }
      if (res.inviteLink) {
        setLinkCopied(false);
        setInviteLinkInfo({
          email: res.email,
          link: res.inviteLink,
          emailSent: !!res.emailSent,
          emailError: res.emailError,
        });
      }
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Failed to invite staff member");
    } finally {
      setInviting(false);
    }
  }

  async function handleResend(member: StaffMember) {
    try {
      const res = await api<ResendResponse>(`/staff/${member.id}/resend-invite`, { method: "POST" });
      if (res.emailSent) {
        toast().success(`Invite resent to ${member.email}`);
      } else {
        toast().error(`Couldn't email the invite — copy the link below to share it manually.`);
      }
      if (res.inviteLink) {
        setLinkCopied(false);
        setInviteLinkInfo({
          email: member.email,
          link: res.inviteLink,
          emailSent: !!res.emailSent,
          emailError: res.emailError,
        });
      }
    } catch (err) {
      toast().error(err instanceof Error ? err.message : "Failed to resend invite");
    }
  }

  async function copyInviteLink() {
    if (!inviteLinkInfo) return;
    try {
      await navigator.clipboard.writeText(inviteLinkInfo.link);
      setLinkCopied(true);
      toast().success("Invite link copied");
    } catch {
      toast().error("Couldn't copy — select and copy manually");
    }
  }

  async function handleRemove() {
    if (!confirmRemove) return;
    setRemoving(true);
    try {
      await api(`/staff/${confirmRemove.id}`, { method: "DELETE" });
      setStaff((prev) => prev.filter((s) => s.id !== confirmRemove.id));
      setConfirmRemove(null);
      toast().success(`${confirmRemove.fullName} removed`);
    } catch (err) {
      toast().error(err instanceof Error ? err.message : "Failed to remove staff member");
    } finally {
      setRemoving(false);
    }
  }

  const sorted = [...staff].sort((a, b) => a.fullName.localeCompare(b.fullName));

  return (
    <TeacherShell section="staff">
      <div className="flex flex-col gap-6">
        <div className="flex items-start justify-between gap-4">
          <PageHeader
            title="Staff & Roles"
            description="Manage who has access to the teacher portal and their role."
          />
          <Button onClick={openInvite}>
            <Icon.Plus className="h-3.5 w-3.5" />
            Invite staff
          </Button>
        </div>

        <Table overflowVisible>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Email</TH>
              <TH>Role</TH>
              <TH>Access</TH>
              <TH>Status</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {loading ? (
              <EmptyRow cols={5}>Loading…</EmptyRow>
            ) : sorted.length === 0 ? (
              <EmptyRow cols={5}>No staff members yet.</EmptyRow>
            ) : (
              sorted.map((member) => {
                const isMe = member.id === currentUser?.id;
                return (
                  <TR key={member.id}>
                    <TD>
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-xs font-semibold text-[var(--accent)]">
                          {member.fullName.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-[var(--fg)]">{member.fullName}</span>
                        {isMe && <Badge tone="accent">You</Badge>}
                      </div>
                    </TD>
                    <TD className="text-[var(--fg-muted)]">{member.email}</TD>
                    <TD>
                      {isMe ? (
                        <span className="text-sm text-[var(--fg)]">{STAFF_ROLE_LABELS[member.role] ?? member.role}</span>
                      ) : (
                        <RoleDropdown
                          member={member}
                          onChanged={(role) =>
                            setStaff((prev) => prev.map((s) => s.id === member.id ? { ...s, role } : s))
                          }
                        />
                      )}
                    </TD>
                    <TD>
                      <button
                        type="button"
                        onClick={() => setAccessFor(member)}
                        disabled={isMe}
                        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-[var(--fg-muted)] transition-colors enabled:hover:bg-[var(--surface-muted)] enabled:hover:text-[var(--fg)] disabled:cursor-default"
                        title={isMe ? "You cannot change your own access" : "Choose what this person can do"}
                      >
                        <Icon.Shield className="h-3.5 w-3.5" />
                        {member.permissions.length === PERMISSIONS.length
                          ? "Everything"
                          : `${member.permissions.length} of ${PERMISSIONS.length}`}
                        {member.customAccess && <Badge tone="accent">Custom</Badge>}
                      </button>
                    </TD>
                    <TD>
                      {member.pending ? (
                        <Badge tone="warn">Invite pending</Badge>
                      ) : (
                        <Badge tone="success">Active</Badge>
                      )}
                    </TD>
                    <TD className="text-right">
                      {!isMe && (
                        <RowMenu
                          member={member}
                          onResend={() => handleResend(member)}
                          onRemove={() => setConfirmRemove(member)}
                        />
                      )}
                    </TD>
                  </TR>
                );
              })
            )}
          </TBody>
        </Table>

        <StaffAccessModal
          member={accessFor}
          onClose={() => setAccessFor(null)}
          onSaved={(updated) => setStaff((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))}
        />

        {/* Invite modal */}
        <Modal open={showInvite} onClose={() => setShowInvite(false)} title="Invite staff member">
          <form className="flex flex-col gap-4" onSubmit={handleInvite}>
            <Label required>
              Full name
              <Input
                placeholder="Jane Smith"
                required
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
              />
            </Label>
            <Label required>
              Email address
              <Input
                type="email"
                placeholder="jane@school.edu"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </Label>
            <Label required>
              Role
              <Select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as StaffRole)}
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>{STAFF_ROLE_LABELS[r]}</option>
                ))}
              </Select>
            </Label>
            {inviteError && (
              <div className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger)]">
                {inviteError}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setShowInvite(false)}>Cancel</Button>
              <Button type="submit" loading={inviting}>
                <Icon.Shield className="h-3.5 w-3.5" />
                Send invite
              </Button>
            </div>
          </form>
        </Modal>

        {/* Invite link modal — shown after invite/resend so the inviter can copy & share */}
        <Modal
          open={!!inviteLinkInfo}
          onClose={() => setInviteLinkInfo(null)}
          title={inviteLinkInfo?.emailSent ? "Invite sent" : "Invite created — email failed"}
        >
          {inviteLinkInfo && (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-[var(--fg-muted)]">
                {inviteLinkInfo.emailSent ? (
                  <>An email was sent to <strong className="text-[var(--fg)]">{inviteLinkInfo.email}</strong>. You can also share this link directly:</>
                ) : (
                  <>We couldn't email <strong className="text-[var(--fg)]">{inviteLinkInfo.email}</strong>. Share this link with them so they can set up their account:</>
                )}
              </p>
              <div className="flex items-stretch gap-2">
                <Input readOnly value={inviteLinkInfo.link} onFocus={(e) => e.currentTarget.select()} />
                <Button type="button" onClick={copyInviteLink}>
                  {linkCopied ? "Copied" : "Copy"}
                </Button>
              </div>
              {!inviteLinkInfo.emailSent && inviteLinkInfo.emailError && (
                <div className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger)]">
                  {inviteLinkInfo.emailError}
                </div>
              )}
              <p className="text-xs text-[var(--fg-muted)]">Link expires in 48 hours.</p>
              <div className="flex justify-end">
                <Button type="button" variant="ghost" onClick={() => setInviteLinkInfo(null)}>Done</Button>
              </div>
            </div>
          )}
        </Modal>

        {/* Remove confirm modal */}
        <Modal open={!!confirmRemove} onClose={() => setConfirmRemove(null)} title="Remove staff member">
          <div className="flex flex-col gap-4">
            <p className="text-sm text-[var(--fg-muted)]">
              Remove <strong className="text-[var(--fg)]">{confirmRemove?.fullName}</strong> from the staff list?
              They will lose access to the teacher portal immediately.
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setConfirmRemove(null)}>Cancel</Button>
              <Button variant="danger" loading={removing} onClick={handleRemove}>Remove</Button>
            </div>
          </div>
        </Modal>
      </div>
    </TeacherShell>
  );
}
