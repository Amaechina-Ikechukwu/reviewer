import { useMemo, useState, type ChangeEvent } from "react";
import TeacherShell from "../components/TeacherShell";
import { toast } from "../components/Toast";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Icon } from "../components/ui/Icons";
import { Input, Label, Textarea } from "../components/ui/Input";
import { PageHeader } from "../components/ui/PageHeader";
import { api } from "../api";

type ImportRow = {
  id: string;
  fullName: string;
  email: string;
  githubUrl: string;
};

function normalizeGithubUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const withoutLabel = trimmed.replace(/^(link|github|repo|repository)\s*:\s*/i, "").trim();
  if (/^https?:\/\/github\.com\/[^\s]+$/i.test(withoutLabel)) return withoutLabel;
  const shortMatch = withoutLabel.match(/^([a-z0-9_.-]+\/[a-z0-9_.-]+(?:\.git)?)$/i);
  if (shortMatch) return `https://github.com/${shortMatch[1]}`;
  const embeddedMatch = withoutLabel.match(/github\.com\/([a-z0-9_.-]+\/[a-z0-9_.-]+(?:\.git)?)/i);
  if (embeddedMatch) return `https://github.com/${embeddedMatch[1]}`;
  return withoutLabel;
}

function createRow(index: number, fullName: string, githubUrl: string, email = ""): ImportRow {
  return {
    id: `${index}-${fullName}-${githubUrl}`,
    fullName: fullName.trim(),
    email: email.trim(),
    githubUrl: normalizeGithubUrl(githubUrl),
  };
}

function parsePastedDoc(input: string): ImportRow[] {
  const lines = input.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const rows: ImportRow[] = [];
  let pendingName = "";
  let pendingEmail = "";

  function flushRow(rawLink: string) {
    const githubUrl = normalizeGithubUrl(rawLink);
    if (!githubUrl) return;
    const fallbackName = pendingName || rawLink.replace(githubUrl, "").trim() || `Imported Student ${rows.length + 1}`;
    rows.push(createRow(rows.length, fallbackName, githubUrl, pendingEmail));
    pendingName = "";
    pendingEmail = "";
  }

  for (const line of lines) {
    const emailMatch = line.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    if (emailMatch) pendingEmail = emailMatch[0];

    const labeledName = line.match(/^name\s*:\s*(.+)$/i) || line.match(/^full\s*name\s*:\s*(.+)$/i);
    if (labeledName) {
      pendingName = labeledName[1].trim();
      continue;
    }

    const labeledLink = line.match(/^(link|github|repo|repository)\s*:\s*(.+)$/i);
    if (labeledLink) {
      flushRow(labeledLink[2]);
      continue;
    }

    const githubMatch = line.match(/https?:\/\/github\.com\/[^\s]+/i);
    if (githubMatch) {
      const prefix = line.slice(0, githubMatch.index).replace(/^(name\s*:)?/i, "").trim();
      if (prefix && !pendingName) pendingName = prefix.replace(/[-|,]+$/g, "").trim();
      flushRow(githubMatch[0]);
      continue;
    }

    const shortGithubMatch = line.match(/\b([a-z0-9_.-]+\/[a-z0-9_.-]+(?:\.git)?)\b/i);
    if (shortGithubMatch && line.includes("/")) {
      const candidate = normalizeGithubUrl(shortGithubMatch[1]);
      if (candidate.startsWith("https://github.com/")) {
        const prefix = line.replace(shortGithubMatch[1], "").trim();
        if (prefix && !pendingName) pendingName = prefix.replace(/^(name\s*:)?/i, "").trim();
        flushRow(shortGithubMatch[1]);
        continue;
      }
    }

    if (!pendingName) pendingName = line;
  }

  return rows.filter((row) => row.fullName && row.githubUrl);
}

export default function ImportSubmissions() {
  const [assignmentTitle, setAssignmentTitle] = useState("");
  const [pastedDoc, setPastedDoc] = useState("");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [message, setMessage] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<
    Array<{ email?: string; fullName: string; githubUrl: string; createdStudent: boolean; mappedByFuzzy?: boolean; submissionId: string }> | null
  >(null);

  const missingFields = useMemo(() => rows.filter((row) => !row.fullName || !row.githubUrl).length, [rows]);

  function parseRows() {
    setRows(parsePastedDoc(pastedDoc));
    setResult(null);
    setMessage("");
  }

  async function handleDocFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setPastedDoc(text);
    setRows(parsePastedDoc(text));
  }

  function updateRow(id: string, field: keyof Omit<ImportRow, "id">, value: string) {
    setRows((current) =>
      current.map((row) =>
        row.id === id
          ? { ...row, [field]: field === "githubUrl" ? normalizeGithubUrl(value) : value }
          : row,
      ),
    );
  }

  async function importRows() {
    try {
      setIsImporting(true);
      setMessage("");
      const response = await api<{
        imported: Array<{ email?: string; fullName: string; githubUrl: string; createdStudent: boolean; submissionId: string }>;
      }>("/submissions/import", {
        method: "POST",
        body: JSON.stringify({
          assignmentTitle: assignmentTitle.trim(),
          entries: rows.map((row) => ({ fullName: row.fullName, email: row.email, githubUrl: row.githubUrl })),
        }),
      });
      setResult(response.imported);
      toast().success(`Imported ${response.imported.length} submission(s)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Import failed";
      setMessage(msg);
      toast().error(msg);
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <TeacherShell section="submissions">
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Import submissions"
          description="Bulk-import existing student work from a pasted roster or text export."
        />

        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="flex flex-col gap-6">
            <Card>
              <CardContent className="flex flex-col gap-4">
                <Label>
                  Assignment title / topic
                  <Input
                    placeholder="e.g. HTML Portfolio Project"
                    value={assignmentTitle}
                    onChange={(event) => setAssignmentTitle(event.target.value)}
                  />
                </Label>
                <Label>
                  Pasted doc content
                  <Textarea
                    rows={8}
                    value={pastedDoc}
                    onChange={(event) => setPastedDoc(event.target.value)}
                    placeholder="Supports NAME / LINK pairs, full GitHub URLs, or short owner/repo links."
                  />
                </Label>
                <Label>
                  Or load a text export
                  <Input accept=".txt,.md,.csv" onChange={handleDocFile} type="file" />
                </Label>
                <div className="flex items-center justify-between gap-3">
                  <Button variant="secondary" size="sm" onClick={parseRows}>
                    <Icon.Sparkles className="h-3.5 w-3.5" />
                    Parse document
                  </Button>
                  <span className="text-xs text-[var(--fg-muted)]">Detected rows: {rows.length}</span>
                </div>
              </CardContent>
            </Card>

            {rows.length > 0 && (
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Import preview</CardTitle>
                    <div className="mt-1 text-xs text-[var(--fg-muted)]">
                      {missingFields ? `${missingFields} row(s) need edits.` : "Ready to import."}
                    </div>
                  </div>
                  <Badge tone={missingFields ? "warn" : "success"}>{rows.length} rows</Badge>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {rows.map((row) => (
                    <div
                      key={row.id}
                      className="flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)]/40 p-4"
                    >
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Label>
                          Full name
                          <Input value={row.fullName} onChange={(event) => updateRow(row.id, "fullName", event.target.value)} />
                        </Label>
                        <Label>
                          Email <span className="font-normal text-[var(--fg-muted)]">(optional)</span>
                          <Input
                            placeholder="Leave blank if not yet known"
                            value={row.email}
                            onChange={(event) => updateRow(row.id, "email", event.target.value)}
                          />
                        </Label>
                      </div>
                      <Label>
                        GitHub URL
                        <Input value={row.githubUrl} onChange={(event) => updateRow(row.id, "githubUrl", event.target.value)} />
                      </Label>
                    </div>
                  ))}
                  <div className="flex items-center justify-end gap-3">
                    {isImporting && (
                      <span className="text-xs text-[var(--fg-muted)]">
                        Cloning repositories and creating historical submissions...
                      </span>
                    )}
                    <Button
                      disabled={!assignmentTitle.trim() || missingFields > 0}
                      loading={isImporting}
                      onClick={importRows}
                    >
                      Import submissions
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="flex flex-col gap-6">
            {message && (
              <div className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger)]">
                {message}
              </div>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Format tips</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-xs text-[var(--fg-muted)]">
                <div>Paste NAME / LINK pairs, full GitHub URLs, or short <code className="rounded bg-[var(--surface-muted)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--fg)]">owner/repo</code> paths.</div>
                <div>Email is optional — students can fill it in later.</div>
                <div>Rows with missing name or URL are skipped automatically.</div>
              </CardContent>
            </Card>

            {result && (
              <Card>
                <CardHeader>
                  <CardTitle>Import result</CardTitle>
                  <Badge tone="success">{result.length} imported</Badge>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  {result.map((item) => (
                    <div
                      key={item.submissionId}
                      className="flex flex-col gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)]/40 p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <strong className="text-sm">{item.fullName}</strong>
                        <Badge tone={item.createdStudent ? "accent" : item.mappedByFuzzy ? "warn" : "neutral"}>
                          {item.createdStudent ? "New" : item.mappedByFuzzy ? "Fuzzy match" : "Matched"}
                        </Badge>
                      </div>
                      {item.email && <span className="text-[11px] text-[var(--fg-muted)]">{item.email}</span>}
                      <span className="truncate font-mono text-[11px] text-[var(--fg-muted)]">{item.githubUrl}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </TeacherShell>
  );
}
