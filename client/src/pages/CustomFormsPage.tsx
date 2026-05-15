import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import TeacherShell from "../components/TeacherShell";
import { toast } from "../components/Toast";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Icon } from "../components/ui/Icons";
import { PageHeader } from "../components/ui/PageHeader";
import { Table, TBody, TD, TH, THead, TR, EmptyRow } from "../components/ui/Table";
import { api } from "../api";
import { formatRelative } from "../lib/format";
import type { CustomForm, CustomFormStatus } from "../types";

function statusTone(status: CustomFormStatus) {
  if (status === "open") return "success" as const;
  if (status === "draft") return "neutral" as const;
  return "warn" as const;
}

export default function CustomFormsPage() {
  const navigate = useNavigate();
  const [forms, setForms] = useState<CustomForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function copyLink(form: CustomForm) {
    const link = form.publishedLink || `${window.location.origin}/student/forms/${form.id}`;
    navigator.clipboard.writeText(link).then(
      () => {
        setCopiedId(form.id);
        toast().success("Link copied");
        setTimeout(() => setCopiedId((curr) => (curr === form.id ? null : curr)), 2000);
      },
      () => toast().error("Couldn't copy link."),
    );
  }

  useEffect(() => {
    api<CustomForm[]>("/forms")
      .then(setForms)
      .catch((err) => toast().error(err instanceof Error ? err.message : "Failed to load forms."))
      .finally(() => setLoading(false));
  }, []);

  async function deleteForm(form: CustomForm) {
    if (!confirm(`Delete "${form.title}"? All responses will be lost.`)) return;
    try {
      await api(`/forms/${form.id}`, { method: "DELETE" });
      setForms((prev) => prev.filter((f) => f.id !== form.id));
      toast().success("Form deleted.");
    } catch (err) {
      toast().error(err instanceof Error ? err.message : "Failed to delete form.");
    }
  }

  return (
    <TeacherShell section="forms">
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PageHeader
            title="Custom Forms"
            description="Collect structured information from students — project ideas, signups, anything you can describe with fields."
          />
          <Link to="/teacher/forms/new">
            <Button>
              <Icon.Plus className="h-3.5 w-3.5" />
              New form
            </Button>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Your forms</CardTitle>
          </CardHeader>
          <Table>
            <THead>
              <TR>
                <TH>Title</TH>
                <TH>Status</TH>
                <TH>Fields</TH>
                <TH>Created</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {forms.map((form) => (
                <TR
                  key={form.id}
                  className="cursor-pointer hover:bg-[var(--surface-muted)]/60"
                  onClick={() => navigate(`/teacher/forms/${form.id}/responses`)}
                >
                  <TD label="Title">
                    <span className="font-medium">{form.title}</span>
                    {form.description && (
                      <div className="text-xs text-[var(--fg-muted)] line-clamp-1">{form.description}</div>
                    )}
                  </TD>
                  <TD label="Status">
                    <Badge tone={statusTone(form.status)} dot>{form.status}</Badge>
                  </TD>
                  <TD label="Fields" className="text-xs text-[var(--fg-muted)]">
                    {form.fields?.length ?? 0}
                  </TD>
                  <TD label="Created" className="text-xs text-[var(--fg-muted)]">{formatRelative(form.createdAt)}</TD>
                  <TD label="Actions" className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        disabled={form.status !== "open"}
                        title={form.status === "open" ? "Copy published link" : "Open the form to publish a link"}
                        onClick={() => copyLink(form)}
                        className="rounded-md p-1.5 text-[var(--fg-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--fg)] disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        <Icon.Copy className="h-3.5 w-3.5" />
                        {copiedId === form.id && (
                          <span className="sr-only">Copied</span>
                        )}
                      </button>
                      <Link
                        to={`/teacher/forms/${form.id}/responses`}
                        title="View responses"
                        className="rounded-md p-1.5 text-[var(--fg-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--fg)]"
                      >
                        <Icon.Inbox className="h-3.5 w-3.5" />
                      </Link>
                      <Link
                        to={`/teacher/forms/${form.id}/edit`}
                        title="Edit form"
                        className="rounded-md p-1.5 text-[var(--fg-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--fg)]"
                      >
                        <Icon.Edit className="h-3.5 w-3.5" />
                      </Link>
                      <button
                        type="button"
                        title="Delete form"
                        onClick={() => deleteForm(form)}
                        className="rounded-md p-1.5 text-[var(--fg-subtle)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
                      >
                        <Icon.Trash className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </TD>
                </TR>
              ))}
              {!loading && forms.length === 0 && (
                <EmptyRow cols={5}>No forms yet. Click "New form" to build one.</EmptyRow>
              )}
              {loading && <EmptyRow cols={5}>Loading…</EmptyRow>}
            </TBody>
          </Table>
        </Card>
      </div>
    </TeacherShell>
  );
}
