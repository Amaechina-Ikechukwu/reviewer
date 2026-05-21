import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import StudentShell from "../components/StudentShell";
import { toast } from "../components/Toast";
import { Badge } from "../components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Icon } from "../components/ui/Icons";
import { PageHeader } from "../components/ui/PageHeader";
import { api } from "../api";
import { formatRelative } from "../lib/format";
import { decisionTone, overallDecision } from "../lib/customForm";
import type { CustomForm, CustomFormResponse } from "../types";

type FormWithMine = CustomForm & { myResponse: CustomFormResponse | null };

export default function StudentFormsPage() {
  const [forms, setForms] = useState<FormWithMine[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<FormWithMine[]>("/forms")
      .then(setForms)
      .catch((err) => toast().error(err instanceof Error ? err.message : "Failed to load forms."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <StudentShell section="forms">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <PageHeader
          title="Forms"
          description="Open forms from your teacher. Click any form to fill it out."
        />

        {loading ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-[var(--fg-muted)]">Loading…</CardContent>
          </Card>
        ) : forms.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-[var(--fg-muted)]">
              No open forms right now.
            </CardContent>
          </Card>
        ) : (
          forms.map((form) => {
            const closesAt = form.closesAt ? new Date(form.closesAt) : null;
            const overdue = closesAt && closesAt < new Date();
            return (
              <Link key={form.id} to={`/student/forms/${form.id}`} className="block">
                <Card className="transition-colors hover:border-[var(--accent)]/50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Icon.FileText className="h-4 w-4 text-[var(--fg-muted)]" />
                      {form.title}
                    </CardTitle>
                    {form.myResponse ? (() => {
                      const overall = overallDecision(form.myResponse, form.fields);
                      return (
                        <Badge tone={decisionTone(overall)} dot>
                          {overall}
                        </Badge>
                      );
                    })() : overdue ? (
                      <Badge tone="danger" dot>Closed</Badge>
                    ) : (
                      <Badge tone="accent">Not submitted</Badge>
                    )}
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2 text-sm text-[var(--fg-muted)]">
                    {form.description && <p className="text-[var(--fg)]">{form.description}</p>}
                    <div className="flex flex-wrap gap-3 text-xs">
                      <span>{form.fields.length} question{form.fields.length === 1 ? "" : "s"}</span>
                      {closesAt && (
                        <span>{overdue ? "Closed" : "Closes"} {formatRelative(closesAt.toISOString())}</span>
                      )}
                      {form.myResponse && (
                        <span>Submitted {formatRelative(form.myResponse.submittedAt)}</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })
        )}
      </div>
    </StudentShell>
  );
}
