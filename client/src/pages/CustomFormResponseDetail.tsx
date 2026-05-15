import { useEffect, useState } from "react";
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
import type { CustomForm, CustomFormDecision, CustomFormResponse } from "../types";

type Row = { response: CustomFormResponse; studentName: string | null; studentEmail: string | null };
type Payload = { form: CustomForm; responses: Row[] };

function decisionTone(d: CustomFormDecision) {
  if (d === "approved") return "success" as const;
  if (d === "rejected") return "danger" as const;
  return "warn" as const;
}

function renderAnswer(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) return value.join(", ") || "—";
  return String(value);
}

export default function CustomFormResponseDetail() {
  const { id, responseId } = useParams();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    api<Payload>(`/forms/${id}/responses`)
      .then((d) => {
        setData(d);
        const row = d.responses.find((r) => r.response.id === responseId);
        if (row) setNotes(row.response.reviewNotes || "");
      })
      .catch((err) => toast().error(err instanceof Error ? err.message : "Failed to load."))
      .finally(() => setLoading(false));
  }, [id, responseId]);

  async function decide(decision: CustomFormDecision) {
    if (!id || !responseId) return;
    setBusy(true);
    try {
      const updated = await api<CustomFormResponse>(`/forms/${id}/responses/${responseId}`, {
        method: "PATCH",
        body: JSON.stringify({ decision, reviewNotes: notes }),
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
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <TeacherShell section="forms">
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--fg-muted)]">Loading…</div>
      </TeacherShell>
    );
  }

  const row = data?.responses.find((r) => r.response.id === responseId);

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
              <Badge tone={decisionTone(response.decision)} dot>
                {response.decision}
              </Badge>
              <span className="text-xs text-[var(--fg-muted)]">{formatRelative(response.submittedAt)}</span>
            </div>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Answers</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {data.form.fields.map((field) => (
              <div key={field.id} className="flex flex-col gap-1">
                <div className="text-xs font-semibold uppercase tracking-wider text-[var(--fg-muted)]">
                  {field.label}
                </div>
                <div className="whitespace-pre-wrap text-sm text-[var(--fg)]">
                  {renderAnswer(response.answers?.[field.id])}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Review</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--fg-muted)]">Notes (optional)</label>
              <Textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Visible to the student in their submission view."
              />
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                loading={busy}
                onClick={() => decide("pending")}
                disabled={response.decision === "pending"}
              >
                Reset
              </Button>
              <Button
                variant="danger"
                size="sm"
                loading={busy}
                onClick={() => decide("rejected")}
                disabled={response.decision === "rejected"}
              >
                <Icon.X className="h-3.5 w-3.5" />
                Reject
              </Button>
              <Button
                size="sm"
                loading={busy}
                onClick={() => decide("approved")}
                disabled={response.decision === "approved"}
              >
                <Icon.Check className="h-3.5 w-3.5" />
                Approve
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </TeacherShell>
  );
}
