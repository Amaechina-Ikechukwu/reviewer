import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import TeacherShell from "../components/TeacherShell";
import { toast } from "../components/Toast";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent } from "../components/ui/Card";
import { Icon } from "../components/ui/Icons";
import { PageHeader } from "../components/ui/PageHeader";
import { api } from "../api";
import { formatRelative } from "../lib/format";
import { decisionTone, overallDecision } from "../lib/customForm";
import type { CustomForm, CustomFormDecision, CustomFormResponse } from "../types";

type Row = {
  response: CustomFormResponse;
  studentName: string | null;
  studentEmail: string | null;
};

type Payload = { form: CustomForm; responses: Row[] };

export default function CustomFormResponses() {
  const { id } = useParams();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | CustomFormDecision>("all");

  useEffect(() => {
    if (!id) return;
    api<Payload>(`/forms/${id}/responses`)
      .then((d) => setData(d))
      .catch((err) => toast().error(err instanceof Error ? err.message : "Failed to load responses."))
      .finally(() => setLoading(false));
  }, [id]);

  const visible = useMemo(() => {
    if (!data) return [];
    if (filter === "all") return data.responses;
    return data.responses.filter((r) => overallDecision(r.response, data.form.fields) === filter);
  }, [data, filter]);

  const counts = useMemo(() => {
    const c = { all: 0, pending: 0, approved: 0, rejected: 0 };
    for (const r of data?.responses || []) {
      c.all++;
      c[overallDecision(r.response, data!.form.fields)]++;
    }
    return c;
  }, [data]);

  if (loading) {
    return (
      <TeacherShell section="forms">
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--fg-muted)]">Loading…</div>
      </TeacherShell>
    );
  }
  if (!data) {
    return (
      <TeacherShell section="forms">
        <div className="mx-auto max-w-2xl py-12 text-center text-sm text-[var(--fg-muted)]">Form not found.</div>
      </TeacherShell>
    );
  }

  return (
    <TeacherShell section="forms">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Link
            to="/teacher/forms"
            className="inline-flex w-fit items-center gap-1 text-xs font-medium text-[var(--fg-muted)] hover:text-[var(--accent)]"
          >
            <Icon.ChevronLeft className="h-3 w-3" />
            All forms
          </Link>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <PageHeader
              title={`Responses · ${data.form.title}`}
              description={data.form.description || `${counts.all} total response${counts.all === 1 ? "" : "s"}`}
            />
            <Link to={`/teacher/forms/${data.form.id}/edit`}>
              <Button variant="secondary">
                <Icon.Edit className="h-3.5 w-3.5" />
                Edit form
              </Button>
            </Link>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {(["all", "pending", "approved", "rejected"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={
                "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
                (filter === key
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "border-[var(--border)] text-[var(--fg-muted)] hover:border-[var(--border-strong)] hover:text-[var(--fg)]")
              }
            >
              {key.charAt(0).toUpperCase() + key.slice(1)} · {counts[key]}
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-[var(--fg-muted)]">
              No responses{filter !== "all" ? ` in "${filter}"` : " yet"}.
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--surface)]">
            {visible.map(({ response, studentName, studentEmail }) => {
              const displayEmail =
                studentEmail && !studentEmail.endsWith("@historical.reviewai.local") ? studentEmail : null;
              const overall = overallDecision(response, data.form.fields);
              return (
                <Link
                  key={response.id}
                  to={`/teacher/forms/${id}/responses/${response.id}`}
                  className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-[var(--surface-raised)]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-[var(--fg)]">
                      {studentName || "Anonymous student"}
                    </div>
                    {displayEmail && (
                      <div className="text-xs text-[var(--fg-muted)]">{displayEmail}</div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <Badge tone={decisionTone(overall)} dot>
                      {overall}
                    </Badge>
                    <span className="hidden text-xs text-[var(--fg-muted)] sm:inline">
                      {formatRelative(response.submittedAt)}
                    </span>
                    <Icon.ChevronRight className="h-4 w-4 text-[var(--fg-muted)]" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </TeacherShell>
  );
}
