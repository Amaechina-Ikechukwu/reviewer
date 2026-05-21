import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import TeacherShell from "../components/TeacherShell";
import { toast } from "../components/Toast";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Icon } from "../components/ui/Icons";
import { Textarea } from "../components/ui/Input";
import { PageHeader } from "../components/ui/PageHeader";
import { api } from "../api";
import { formatRelative } from "../lib/format";
import { decisionTone, overallDecision } from "../lib/customForm";
import type { CustomForm, CustomFormDecision, CustomFormResponse } from "../types";

type Row = { response: CustomFormResponse; studentName: string | null; studentEmail: string | null };
type Payload = { form: CustomForm; responses: Row[] };

function renderAnswer(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) return value.join(", ") || "—";
  return String(value);
}

export default function CustomFormResponseDetail() {
  const { id, responseId } = useParams();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});
  const [busyField, setBusyField] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api<Payload>(`/forms/${id}/responses`)
      .then((d) => {
        setData(d);
        const row = d.responses.find((r) => r.response.id === responseId);
        if (row) setNotesDraft({ ...(row.response.fieldNotes ?? {}) });
      })
      .catch((err) => toast().error(err instanceof Error ? err.message : "Failed to load."))
      .finally(() => setLoading(false));
  }, [id, responseId]);

  async function decide(fieldId: string, decision: CustomFormDecision) {
    if (!id || !responseId) return;
    setBusyField(fieldId);
    try {
      const updated = await api<CustomFormResponse>(`/forms/${id}/responses/${responseId}`, {
        method: "PATCH",
        body: JSON.stringify({ fieldId, decision, notes: notesDraft[fieldId] || "" }),
      });
      setData((prev) =>
        prev
          ? {
              ...prev,
              responses: prev.responses.map((r) =>
                r.response.id === responseId ? { ...r, response: updated } : r,
              ),
            }
          : prev,
      );
      toast().success(`Marked ${decision}.`);
    } catch (err) {
      toast().error(err instanceof Error ? err.message : "Failed to update.");
    } finally {
      setBusyField(null);
    }
  }

  const row = useMemo(
    () => data?.responses.find((r) => r.response.id === responseId),
    [data, responseId],
  );

  if (loading) {
    return (
      <TeacherShell section="forms">
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--fg-muted)]">Loading…</div>
      </TeacherShell>
    );
  }

  if (!data || !row) {
    return (
      <TeacherShell section="forms">
        <div className="mx-auto max-w-2xl py-12 text-center text-sm text-[var(--fg-muted)]">Response not found.</div>
      </TeacherShell>
    );
  }

  const { response, studentName, studentEmail } = row;
  const displayEmail =
    studentEmail && !studentEmail.endsWith("@historical.reviewai.local") ? studentEmail : null;
  const overall = overallDecision(response, data.form.fields);

  return (
    <TeacherShell section="forms">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Link
            to={`/teacher/forms/${id}/responses`}
            className="inline-flex w-fit items-center gap-1 text-xs font-medium text-[var(--fg-muted)] hover:text-[var(--accent)]"
          >
            <Icon.ChevronLeft className="h-3 w-3" />
            All responses
          </Link>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <PageHeader
              title={studentName || "Anonymous student"}
              description={displayEmail || undefined}
            />
            <div className="flex items-center gap-2">
              <Badge tone={decisionTone(overall)} dot>
                {overall}
              </Badge>
              <span className="text-xs text-[var(--fg-muted)]">{formatRelative(response.submittedAt)}</span>
            </div>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Answers</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {data.form.fields.map((field, index) => {
              const fieldDecision = (response.fieldDecisions?.[field.id] ?? "pending") as CustomFormDecision;
              const isBusy = busyField === field.id;
              return (
                <div
                  key={field.id}
                  className="flex flex-col gap-2 border-b border-[var(--border)] pb-5 last:border-b-0 last:pb-0"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs font-semibold uppercase tracking-wider text-[var(--fg-muted)]">
                      {field.label} {data.form.fields.length > 1 ? `(${index + 1})` : ""}
                    </div>
                    <Badge tone={decisionTone(fieldDecision)} dot>
                      {fieldDecision}
                    </Badge>
                  </div>
                  <div className="whitespace-pre-wrap text-sm text-[var(--fg)]">
                    {renderAnswer(response.answers?.[field.id])}
                  </div>
                  <Textarea
                    rows={2}
                    value={notesDraft[field.id] ?? ""}
                    onChange={(e) => setNotesDraft((prev) => ({ ...prev, [field.id]: e.target.value }))}
                    placeholder="Note for this answer (optional, shown to student)"
                  />
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={isBusy}
                      onClick={() => decide(field.id, "pending")}
                      disabled={fieldDecision === "pending"}
                    >
                      Reset
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      loading={isBusy}
                      onClick={() => decide(field.id, "rejected")}
                      disabled={fieldDecision === "rejected"}
                    >
                      <Icon.X className="h-3.5 w-3.5" />
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      loading={isBusy}
                      onClick={() => decide(field.id, "approved")}
                      disabled={fieldDecision === "approved"}
                    >
                      <Icon.Check className="h-3.5 w-3.5" />
                      Approve
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </TeacherShell>
  );
}
