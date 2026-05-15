import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import TeacherShell from "../components/TeacherShell";
import { toast } from "../components/Toast";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Icon } from "../components/ui/Icons";
import { Input, Label, Select, Textarea } from "../components/ui/Input";
import { PageHeader } from "../components/ui/PageHeader";
import { api } from "../api";
import type { CustomForm, CustomFormField, CustomFormFieldType, CustomFormStatus, CustomFormTargetType, StudentRecord } from "../types";

type EditableField = CustomFormField & { _key: string };

const fieldTypeOptions: { value: CustomFormFieldType; label: string }[] = [
  { value: "short_text", label: "Short text" },
  { value: "long_text", label: "Long text" },
  { value: "number", label: "Number" },
  { value: "url", label: "URL" },
  { value: "single_choice", label: "Single choice" },
  { value: "multi_choice", label: "Multiple choice" },
];

function newField(): EditableField {
  const id = Math.random().toString(36).slice(2, 10);
  return { _key: id, id: `f_${id}`, label: "", type: "short_text", required: false, repeatCount: 1 };
}

function toIsoLocal(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CustomFormBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<CustomFormStatus>("draft");
  const [closesAt, setClosesAt] = useState<string>("");
  const [fields, setFields] = useState<EditableField[]>([newField()]);
  const [lockedFields, setLockedFields] = useState(false);
  const [targetType, setTargetType] = useState<CustomFormTargetType>("all");
  const [targetStudentId, setTargetStudentId] = useState<string>("");
  const [students, setStudents] = useState<StudentRecord[]>([]);

  useEffect(() => {
    api<StudentRecord[]>("/students")
      .then(setStudents)
      .catch(() => { /* non-fatal */ });
  }, []);

  useEffect(() => {
    if (!id) return;
    api<CustomForm>(`/forms/${id}`)
      .then((form) => {
        setTitle(form.title);
        setDescription(form.description || "");
        setStatus(form.status);
        setClosesAt(toIsoLocal(form.closesAt));
        setTargetType(form.targetType === "specific" ? "specific" : "all");
        setTargetStudentId(form.targetStudentId || "");
        setFields(
          (form.fields || []).map((f, idx) => ({
            ...f,
            _key: `existing-${idx}-${f.id}`,
            repeatCount: f.repeatCount ?? 1,
          })),
        );
      })
      .catch((err) => toast().error(err instanceof Error ? err.message : "Failed to load form."))
      .finally(() => setLoading(false));
  }, [id]);

  function updateField(key: string, patch: Partial<EditableField>) {
    setFields((prev) =>
      prev.map((f) => {
        if (f._key !== key) return f;
        const next = { ...f, ...patch };
        if (
          patch.type &&
          (patch.type === "single_choice" || patch.type === "multi_choice") &&
          (!next.options || next.options.length === 0)
        ) {
          next.options = ["Option 1"];
        }
        return next;
      }),
    );
  }

  function addField() {
    setFields((prev) => [...prev, newField()]);
  }

  function removeField(key: string) {
    setFields((prev) => prev.filter((f) => f._key !== key));
  }

  function moveField(key: string, dir: -1 | 1) {
    setFields((prev) => {
      const idx = prev.findIndex((f) => f._key === key);
      if (idx === -1) return prev;
      const next = idx + dir;
      if (next < 0 || next >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[next]] = [copy[next], copy[idx]];
      return copy;
    });
  }

  async function save() {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      toast().error("Add a form title.");
      return;
    }
    const cleanedFields = fields
      .flatMap((f) => {
        const label = f.label.trim();
        if (!label) return [];
        const count = Math.max(1, Math.min(20, f.repeatCount ?? 1));
        const base = {
          id: f.id,
          label,
          type: f.type,
          required: f.required,
          options: (f.type === "single_choice" || f.type === "multi_choice")
            ? (f.options ?? []).map((o) => o.trim()).filter(Boolean)
            : undefined,
          helpText: f.helpText?.trim() || undefined,
        };
        if (count <= 1) return [base];
        return Array.from({ length: count }, (_, i) => ({
          ...base,
          id: i === 0 ? base.id : `${base.id}_r${i + 1}`,
          label: `${label} (${i + 1})`,
        }));
      });

    if (cleanedFields.length === 0) {
      toast().error("Add at least one field with a label.");
      return;
    }
    for (const f of cleanedFields) {
      if ((f.type === "single_choice" || f.type === "multi_choice") && (!f.options || f.options.length === 0)) {
        toast().error(`Add at least one option for "${f.label}".`);
        return;
      }
    }

    if (targetType === "specific" && !targetStudentId) {
      toast().error("Choose a student to send this form to, or switch to 'All students'.");
      return;
    }

    const payload = {
      title: cleanTitle,
      description: description.trim(),
      status,
      closesAt: closesAt ? new Date(closesAt).toISOString() : null,
      targetType,
      targetStudentId: targetType === "specific" ? targetStudentId : null,
      ...(lockedFields ? {} : { fields: cleanedFields }),
    };

    setSaving(true);
    try {
      if (isEdit) {
        await api(`/forms/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
        toast().success("Form saved.");
      } else {
        const created = await api<CustomForm>("/forms", { method: "POST", body: JSON.stringify(payload) });
        toast().success("Form created.");
        navigate(`/teacher/forms/${created.id}/edit`, { replace: true });
        return;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save.";
      if (msg.toLowerCase().includes("locked")) {
        setLockedFields(true);
        toast().error("Fields can't be changed after responses exist. Title, description, status, and deadline are still editable.");
      } else {
        toast().error(msg);
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <TeacherShell section="forms">
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--fg-muted)]">Loading…</div>
      </TeacherShell>
    );
  }

  return (
    <TeacherShell section="forms">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Link
            to="/teacher/forms"
            className="inline-flex w-fit items-center gap-1 text-xs font-medium text-[var(--fg-muted)] hover:text-[var(--accent)]"
          >
            <Icon.ChevronLeft className="h-3 w-3" />
            All forms
          </Link>
          <PageHeader
            title={isEdit ? "Edit form" : "New custom form"}
            description="Define the questions you want answered. Set the status to 'open' when you're ready to collect responses."
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Label required>
              Title
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Final project proposals" />
            </Label>
            <Label>
              Description
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional instructions shown to students before they answer."
                rows={3}
              />
            </Label>
            <div className="grid gap-3 sm:grid-cols-2">
              <Label>
                Status
                <Select value={status} onChange={(e) => setStatus(e.target.value as CustomFormStatus)}>
                  <option value="draft">Draft — hidden from students</option>
                  <option value="open">Open — accepting responses</option>
                  <option value="closed">Closed — read-only</option>
                </Select>
              </Label>
              <Label>
                Closes at (optional)
                <Input type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />
              </Label>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Audience</span>
              <div className="flex flex-wrap gap-2">
                <label
                  className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                    targetType === "all"
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--fg)]"
                      : "border-[var(--border)] bg-[var(--surface)] text-[var(--fg-muted)] hover:border-[var(--border-strong)]"
                  }`}
                >
                  <input
                    type="radio"
                    name="form-target"
                    checked={targetType === "all"}
                    onChange={() => setTargetType("all")}
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                  All students
                </label>
                <label
                  className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                    targetType === "specific"
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--fg)]"
                      : "border-[var(--border)] bg-[var(--surface)] text-[var(--fg-muted)] hover:border-[var(--border-strong)]"
                  }`}
                >
                  <input
                    type="radio"
                    name="form-target"
                    checked={targetType === "specific"}
                    onChange={() => setTargetType("specific")}
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                  Specific student
                </label>
              </div>
              {targetType === "specific" && (
                <Label>
                  Student
                  <Select
                    value={targetStudentId}
                    onChange={(e) => setTargetStudentId(e.target.value)}
                  >
                    <option value="">— Choose a student —</option>
                    {students
                      .filter((s) => !s.email.endsWith("@historical.reviewai.local"))
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.fullName} ({s.email})
                        </option>
                      ))}
                  </Select>
                </Label>
              )}
              <p className="text-xs text-[var(--fg-muted)]">
                {targetType === "all"
                  ? "All students will see this form and be emailed when you open it."
                  : "Only the chosen student will see this form and receive the email when you open it."}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Fields</CardTitle>
            {lockedFields && (
              <span className="text-xs text-[var(--warn)]">Fields are locked — responses already exist.</span>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {fields.map((f, idx) => (
              <div
                key={f._key}
                className="flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)]/40 p-3"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-[var(--fg-muted)]">#{idx + 1}</span>
                  <div className="ml-auto flex items-center gap-1">
                    <button
                      type="button"
                      disabled={lockedFields || idx === 0}
                      onClick={() => moveField(f._key, -1)}
                      title="Move up"
                      className="rounded-md p-1 text-[var(--fg-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--fg)] disabled:opacity-30"
                    >
                      <Icon.ChevronLeft className="h-3.5 w-3.5 rotate-90" />
                    </button>
                    <button
                      type="button"
                      disabled={lockedFields || idx === fields.length - 1}
                      onClick={() => moveField(f._key, 1)}
                      title="Move down"
                      className="rounded-md p-1 text-[var(--fg-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--fg)] disabled:opacity-30"
                    >
                      <Icon.ChevronRight className="h-3.5 w-3.5 rotate-90" />
                    </button>
                    <button
                      type="button"
                      disabled={lockedFields}
                      onClick={() => removeField(f._key)}
                      title="Delete field"
                      className="rounded-md p-1 text-[var(--fg-subtle)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)] disabled:opacity-30"
                    >
                      <Icon.Trash className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Label className="sm:col-span-2" required>
                    Question
                    <Input
                      disabled={lockedFields}
                      value={f.label}
                      onChange={(e) => updateField(f._key, { label: e.target.value })}
                      placeholder="What's your project idea?"
                    />
                  </Label>
                  <Label>
                    Type
                    <Select
                      disabled={lockedFields}
                      value={f.type}
                      onChange={(e) => updateField(f._key, { type: e.target.value as CustomFormFieldType })}
                    >
                      {fieldTypeOptions.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </Select>
                  </Label>
                </div>
                <Label>
                  Help text (optional)
                  <Input
                    disabled={lockedFields}
                    value={f.helpText || ""}
                    onChange={(e) => updateField(f._key, { helpText: e.target.value })}
                    placeholder="A hint shown beneath the question."
                  />
                </Label>
                {(f.type === "single_choice" || f.type === "multi_choice") && (
                  <Label>
                    Options (one per line)
                    <Textarea
                      disabled={lockedFields}
                      rows={3}
                      value={(f.options ?? []).join("\n")}
                      onChange={(e) =>
                        updateField(f._key, {
                          options: e.target.value.split("\n").map((s) => s).filter((_, i, arr) => i < arr.length),
                        })
                      }
                      placeholder={"Option 1\nOption 2"}
                    />
                  </Label>
                )}
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 text-xs text-[var(--fg-muted)]">
                    <input
                      type="checkbox"
                      disabled={lockedFields}
                      checked={f.required}
                      onChange={(e) => updateField(f._key, { required: e.target.checked })}
                    />
                    Required
                  </label>
                  <label className="flex items-center gap-2 text-xs text-[var(--fg-muted)]">
                    Appears
                    <input
                      type="number"
                      disabled={lockedFields}
                      min={1}
                      max={20}
                      value={f.repeatCount ?? 1}
                      onChange={(e) => updateField(f._key, { repeatCount: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })}
                      className="w-14 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-xs text-[var(--fg)] focus:border-[var(--accent)] focus:outline-none disabled:opacity-50"
                    />
                    time{(f.repeatCount ?? 1) !== 1 ? "s" : ""}
                  </label>
                </div>
              </div>
            ))}
            <Button variant="ghost" onClick={addField} disabled={lockedFields}>
              <Icon.Plus className="h-3.5 w-3.5" />
              Add field
            </Button>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Link to="/teacher/forms">
            <Button variant="ghost">Cancel</Button>
          </Link>
          <Button onClick={save} loading={saving}>
            <Icon.Check className="h-3.5 w-3.5" />
            {isEdit ? "Save changes" : "Create form"}
          </Button>
        </div>
      </div>
    </TeacherShell>
  );
}
