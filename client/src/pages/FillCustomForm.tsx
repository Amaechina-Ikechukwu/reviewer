import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import StudentShell from "../components/StudentShell";
import { toast } from "../components/Toast";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Icon } from "../components/ui/Icons";
import { Input, Label, Textarea } from "../components/ui/Input";
import { PageHeader } from "../components/ui/PageHeader";
import { api } from "../api";
import { formatRelative } from "../lib/format";
import type { CustomForm, CustomFormDecision, CustomFormField, CustomFormResponse } from "../types";

type FormWithMine = CustomForm & { myResponse: CustomFormResponse | null };

type AnswerValue = string | number | string[];

function decisionTone(d: CustomFormDecision) {
  if (d === "approved") return "success" as const;
  if (d === "rejected") return "danger" as const;
  return "warn" as const;
}

function initialAnswers(form: CustomForm, existing: CustomFormResponse | null): Record<string, AnswerValue> {
  const out: Record<string, AnswerValue> = {};
  for (const f of form.fields) {
    const v = existing?.answers?.[f.id];
    if (f.type === "multi_choice") {
      out[f.id] = Array.isArray(v) ? (v as string[]) : [];
    } else {
      out[f.id] = (v ?? "") as AnswerValue;
    }
  }
  return out;
}

export default function FillCustomForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState<FormWithMine | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});

  useEffect(() => {
    if (!id) return;
    api<FormWithMine>(`/forms/${id}`)
      .then((f) => {
        setForm(f);
        setAnswers(initialAnswers(f, f.myResponse));
      })
      .catch((err) => toast().error(err instanceof Error ? err.message : "Failed to load form."))
      .finally(() => setLoading(false));
  }, [id]);

  const locked = useMemo(() => {
    if (!form) return false;
    if (form.myResponse?.decision === "approved" || form.myResponse?.decision === "rejected") return true;
    if ((form.myResponse?.updateCount ?? 0) >= 1) return true;
    if (form.status !== "open") return true;
    if (form.closesAt && new Date(form.closesAt) < new Date()) return true;
    return false;
  }, [form]);

  function setAnswer(fieldId: string, value: AnswerValue) {
    setAnswers((prev) => ({ ...prev, [fieldId]: value }));
  }

  function toggleMulti(fieldId: string, option: string) {
    setAnswers((prev) => {
      const cur = (prev[fieldId] as string[]) || [];
      return {
        ...prev,
        [fieldId]: cur.includes(option) ? cur.filter((x) => x !== option) : [...cur, option],
      };
    });
  }

  async function submit() {
    if (!form || !id) return;
    setSubmitting(true);
    try {
      const cleaned: Record<string, AnswerValue> = {};
      for (const f of form.fields) {
        const v = answers[f.id];
        if (f.type === "number" && v !== "" && v !== undefined && v !== null) {
          cleaned[f.id] = Number(v);
        } else {
          cleaned[f.id] = v;
        }
      }
      await api<CustomFormResponse>(`/forms/${id}/responses`, {
        method: "POST",
        body: JSON.stringify({ answers: cleaned }),
      });
      toast().success(form.myResponse ? "Response updated." : "Response submitted.");
      navigate("/student/forms");
    } catch (err) {
      toast().error(err instanceof Error ? err.message : "Failed to submit.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <StudentShell section="forms">
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--fg-muted)]">Loading…</div>
      </StudentShell>
    );
  }
  if (!form) {
    return (
      <StudentShell section="forms">
        <div className="mx-auto max-w-2xl py-12 text-center text-sm text-[var(--fg-muted)]">Form not found.</div>
      </StudentShell>
    );
  }

  return (
    <StudentShell section="forms">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Link
            to="/student/forms"
            className="inline-flex w-fit items-center gap-1 text-xs font-medium text-[var(--fg-muted)] hover:text-[var(--accent)]"
          >
            <Icon.ChevronLeft className="h-3 w-3" />
            All forms
          </Link>
          <PageHeader title={form.title} description={form.description || undefined} />
          {form.myResponse && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge tone={decisionTone(form.myResponse.decision)} dot>
                {form.myResponse.decision}
              </Badge>
              <span className="text-[var(--fg-muted)]">
                Submitted {formatRelative(form.myResponse.submittedAt)}
              </span>
              {form.myResponse.reviewNotes && (
                <span className="rounded-md border border-[var(--border)] bg-[var(--surface-muted)] px-2 py-1 text-[var(--fg-muted)]">
                  Teacher note: {form.myResponse.reviewNotes}
                </span>
              )}
            </div>
          )}
        </div>

        {locked && (
          <div className="rounded-lg border border-[var(--warn)]/30 bg-[var(--warn-soft)] px-3 py-2 text-xs text-[var(--warn)]">
            {form.myResponse?.decision === "approved"
              ? "Your response has been approved and is locked."
              : form.myResponse?.decision === "rejected"
              ? "Your response was rejected. Contact your teacher for next steps."
              : (form.myResponse?.updateCount ?? 0) >= 1
              ? "You have already updated your response once. No further changes are allowed."
              : "This form is not accepting responses."}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Your answers</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {form.fields.map((field) => (
              <FieldInput
                key={field.id}
                field={field}
                value={answers[field.id]}
                disabled={locked}
                onChange={(v) => setAnswer(field.id, v)}
                onToggleMulti={(opt) => toggleMulti(field.id, opt)}
              />
            ))}
          </CardContent>
        </Card>

        {!locked && (
          <div className="flex justify-end">
            <Button onClick={submit} loading={submitting}>
              <Icon.Check className="h-3.5 w-3.5" />
              {form.myResponse ? "Update response" : "Submit response"}
            </Button>
          </div>
        )}
      </div>
    </StudentShell>
  );
}

function FieldInput({
  field,
  value,
  disabled,
  onChange,
  onToggleMulti,
}: {
  field: CustomFormField;
  value: AnswerValue | undefined;
  disabled: boolean;
  onChange: (value: AnswerValue) => void;
  onToggleMulti: (option: string) => void;
}) {
  if (field.type === "long_text") {
    return (
      <Label required={field.required}>
        {field.label}
        <Textarea
          disabled={disabled}
          rows={4}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        />
        {field.helpText && <span className="text-[11px] text-[var(--fg-subtle)]">{field.helpText}</span>}
      </Label>
    );
  }

  if (field.type === "single_choice") {
    return (
      <Label required={field.required}>
        {field.label}
        <div className="flex flex-col gap-1.5">
          {(field.options || []).map((opt) => (
            <label key={opt} className="flex items-center gap-2 text-sm text-[var(--fg)]">
              <input
                type="radio"
                disabled={disabled}
                name={field.id}
                checked={value === opt}
                onChange={() => onChange(opt)}
              />
              {opt}
            </label>
          ))}
        </div>
        {field.helpText && <span className="text-[11px] text-[var(--fg-subtle)]">{field.helpText}</span>}
      </Label>
    );
  }

  if (field.type === "multi_choice") {
    const arr = Array.isArray(value) ? value : [];
    return (
      <Label required={field.required}>
        {field.label}
        <div className="flex flex-col gap-1.5">
          {(field.options || []).map((opt) => (
            <label key={opt} className="flex items-center gap-2 text-sm text-[var(--fg)]">
              <input
                type="checkbox"
                disabled={disabled}
                checked={arr.includes(opt)}
                onChange={() => onToggleMulti(opt)}
              />
              {opt}
            </label>
          ))}
        </div>
        {field.helpText && <span className="text-[11px] text-[var(--fg-subtle)]">{field.helpText}</span>}
      </Label>
    );
  }

  const inputType = field.type === "number" ? "number" : field.type === "url" ? "url" : "text";
  return (
    <Label required={field.required}>
      {field.label}
      <Input
        type={inputType}
        disabled={disabled}
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
      />
      {field.helpText && <span className="text-[11px] text-[var(--fg-subtle)]">{field.helpText}</span>}
    </Label>
  );
}
