import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createCohort, deleteCohort, listCohorts, updateCohort } from "../api";
import TeacherShell from "../components/TeacherShell";
import { toast } from "../components/Toast";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icons";
import { Input, Select } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import type { Cohort, Track } from "../types";
import { TRACKS } from "../types";

const TRACK_COLORS: Record<Track, string> = {
  frontend: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  backend: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  data_analytics: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  product_design: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
  digital_marketing: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  cyber_security: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

type CohortWithCount = Cohort & { studentCount: number };

function TrackBadge({ track }: { track: Track }) {
  const label = TRACKS.find((t) => t.value === track)?.label ?? track;
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${TRACK_COLORS[track]}`}>
      {label}
    </span>
  );
}

export default function CohortsPage() {
  const navigate = useNavigate();
  const [cohorts, setCohorts] = useState<CohortWithCount[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editCohort, setEditCohort] = useState<CohortWithCount | null>(null);
  const [formName, setFormName] = useState("");
  const [formTrack, setFormTrack] = useState<Track>("frontend");
  const [formDesc, setFormDesc] = useState("");
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<CohortWithCount | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    listCohorts()
      .then(setCohorts)
      .catch(() => toast().error("Failed to load cohorts"))
      .finally(() => setLoading(false));
  }, []);

  function openCreate() {
    setEditCohort(null);
    setFormName("");
    setFormTrack("frontend");
    setFormDesc("");
    setModalOpen(true);
  }

  function openEdit(e: React.MouseEvent, cohort: CohortWithCount) {
    e.stopPropagation();
    setEditCohort(cohort);
    setFormName(cohort.name);
    setFormTrack(cohort.track);
    setFormDesc(cohort.description ?? "");
    setModalOpen(true);
  }

  async function handleSave() {
    if (!formName.trim()) return;
    setSaving(true);
    try {
      if (editCohort) {
        const updated = await updateCohort(editCohort.id, { name: formName, track: formTrack, description: formDesc || null });
        setCohorts((prev) => prev.map((c) => c.id === editCohort.id ? { ...c, ...updated } : c));
        toast().success("Cohort updated");
      } else {
        const created = await createCohort({ name: formName, track: formTrack, description: formDesc || undefined });
        setCohorts((prev) => [{ ...created, studentCount: 0 }, ...prev]);
        toast().success("Cohort created");
      }
      setModalOpen(false);
    } catch (err: any) {
      toast().error(err.message ?? "Failed to save cohort");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteCohort(deleteTarget.id);
      setCohorts((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      toast().success("Cohort deleted");
      setDeleteTarget(null);
    } catch (err: any) {
      toast().error(err.message ?? "Failed to delete cohort");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <TeacherShell section="cohorts">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-[var(--fg)]">Cohorts</h1>
            <p className="mt-0.5 text-sm text-[var(--fg-muted)]">Organise students by track and batch.</p>
          </div>
          <Button onClick={openCreate}>
            <Icon.Plus className="h-4 w-4 mr-1.5" /> New cohort
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-[var(--fg-muted)]">Loading…</p>
        ) : cohorts.length === 0 ? (
          <div className="rounded border border-dashed border-[var(--border)] py-14 text-center">
            <Icon.Layers className="mx-auto mb-3 h-8 w-8 text-[var(--fg-subtle)]" />
            <p className="text-sm font-medium text-[var(--fg)]">No cohorts yet</p>
            <p className="mt-1 text-xs text-[var(--fg-muted)]">Create your first cohort to group students by track.</p>
            <Button className="mt-4" onClick={openCreate}>New cohort</Button>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)] rounded border border-[var(--border)] bg-[var(--surface)]">
            {cohorts.map((cohort) => (
              <div
                key={cohort.id}
                className="flex cursor-pointer items-center gap-4 px-4 py-3 hover:bg-[var(--surface-muted)] transition-colors"
                onClick={() => navigate(`/teacher/cohorts/${cohort.id}`)}
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Icon.ChevronRight className="h-4 w-4 shrink-0 text-[var(--fg-muted)]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-[var(--fg)]">{cohort.name}</span>
                    {cohort.description && (
                      <span className="block truncate text-xs text-[var(--fg-muted)]">{cohort.description}</span>
                    )}
                  </span>
                </div>
                <TrackBadge track={cohort.track} />
                <span className="text-xs text-[var(--fg-muted)]">{cohort.studentCount} student{cohort.studentCount !== 1 ? "s" : ""}</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    title="Edit cohort"
                    className="rounded p-1.5 text-[var(--fg-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--fg)]"
                    onClick={(e) => openEdit(e, cohort)}
                  >
                    <Icon.Edit className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Delete cohort"
                    className="rounded p-1.5 text-[var(--fg-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--danger)]"
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(cohort); }}
                  >
                    <Icon.Trash className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create / Edit modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editCohort ? "Edit cohort" : "New cohort"}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!formName.trim() || saving}>
              {saving ? "Saving…" : editCohort ? "Save changes" : "Create cohort"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4 py-1">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--fg)]">Name</label>
            <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Cohort 2025 A" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--fg)]">Track</label>
            <Select
              value={formTrack}
              onChange={(e) => setFormTrack(e.target.value as Track)}
            >
              {TRACKS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--fg)]">Description <span className="text-[var(--fg-subtle)]">(optional)</span></label>
            <Input value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder="Brief description…" />
          </div>
        </div>
      </Modal>

      {/* Delete confirm */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete cohort"
        description={`Delete "${deleteTarget?.name}"? Students will be unlinked but not deleted.`}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete cohort"}
            </Button>
          </div>
        }
      >
        <span />
      </Modal>
    </TeacherShell>
  );
}
