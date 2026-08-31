import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { createProject, listCohorts, listStudents } from "../api";
import TeacherShell from "../components/TeacherShell";
import { ProjectBriefField } from "../components/ProjectBriefField";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Icon } from "../components/ui/Icons";
import type { Cohort, StudentRecord } from "../types";

type Mode = "single" | "bulk";

type StudentGroup = { cohortName: string; students: StudentRecord[] };

/** Groups students by cohort (alphabetical, cohort-less students last) so a
 * teacher assigning a project can find and select a whole class at a glance
 * instead of scanning one long, unordered roster. */
function groupStudentsByCohort(students: StudentRecord[], cohorts: Cohort[]): StudentGroup[] {
  const cohortNameById = new Map(cohorts.map((c) => [c.id, c.name]));
  const byCohort = new Map<string, StudentRecord[]>();
  for (const s of students) {
    const key = s.cohortId || "__none__";
    if (!byCohort.has(key)) byCohort.set(key, []);
    byCohort.get(key)!.push(s);
  }
  const groups: StudentGroup[] = [...byCohort.entries()].map(([key, list]) => ({
    cohortName: key === "__none__" ? "No cohort" : (cohortNameById.get(key) ?? "Unknown cohort"),
    students: [...list].sort((a, b) => a.fullName.localeCompare(b.fullName)),
  }));
  groups.sort((a, b) => {
    if (a.cohortName === "No cohort") return 1;
    if (b.cohortName === "No cohort") return -1;
    return a.cohortName.localeCompare(b.cohortName);
  });
  return groups;
}

function StudentOptionGroups({
  groups,
  selectedIds,
  onToggle,
}: {
  groups: StudentGroup[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <>
      {groups.map((group) => (
        <div key={group.cohortName}>
          <div className="bg-[var(--surface-muted)]/60 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--fg-muted)]">
            {group.cohortName}
          </div>
          {group.students.map((s) => (
            <label key={s.id} className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--surface-muted)]">
              <input
                type="checkbox"
                checked={selectedIds.includes(s.id)}
                onChange={() => onToggle(s.id)}
                className="h-4 w-4 rounded border-[var(--border)] text-[var(--accent)]"
              />
              <span className="text-[var(--fg)]">{s.fullName}</span>
              <span className="ml-auto text-xs text-[var(--fg-muted)]">{s.email}</span>
            </label>
          ))}
        </div>
      ))}
    </>
  );
}

export default function CreateProjectPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<Mode>(searchParams.get("mode") === "bulk" ? "bulk" : "single");

  /* ── Single mode ── */
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [briefPdfPath, setBriefPdfPath] = useState<string | null>(null);

  /* ── Bulk mode ── */
  const [bulkData, setBulkData] = useState("");
  const [bulkSelectedIds, setBulkSelectedIds] = useState<string[]>([]);
  const [bulkBriefPdfPath, setBulkBriefPdfPath] = useState<string | null>(null);

  /* ── Shared ── */
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const studentGroups = useMemo(() => groupStudentsByCohort(students, cohorts), [students, cohorts]);

  /* ── Student dropdown (single) ── */
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  /* ── Student dropdown (bulk) ── */
  const [bulkDropdownOpen, setBulkDropdownOpen] = useState(false);
  const bulkDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listStudents().then(setStudents).catch(() => {});
    listCohorts().then(setCohorts).catch(() => {});
  }, []);

  useEffect(() => {
    if (!dropdownOpen) return;
    function onDoc(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setDropdownOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [dropdownOpen]);

  useEffect(() => {
    if (!bulkDropdownOpen) return;
    function onDoc(e: MouseEvent) {
      if (bulkDropdownRef.current && !bulkDropdownRef.current.contains(e.target as Node)) setBulkDropdownOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [bulkDropdownOpen]);

  function toggleStudent(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleBulkStudent(id: string) {
    setBulkSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function selectAllStudents() {
    setSelectedIds(students.map((s) => s.id));
  }

  function clearAllStudents() {
    setSelectedIds([]);
  }

  function selectAllBulkStudents() {
    setBulkSelectedIds(students.map((s) => s.id));
  }

  function clearAllBulkStudents() {
    setBulkSelectedIds([]);
  }

  async function handleSingleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError("Title is required."); return; }
    setSaving(true); setError("");
    try {
      const project = await createProject({
        title: title.trim(),
        description: description.trim() || null,
        studentIds: selectedIds,
        deadline: deadline || null,
        briefPdfPath,
      });
      navigate(`/teacher/projects/${project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project.");
    } finally {
      setSaving(false);
    }
  }

  async function handleBulkSubmit(e: React.FormEvent) {
    e.preventDefault();
    const lines = bulkData.trim().split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) { setError("Paste at least one project."); return; }

    setSaving(true); setError("");
    let created = 0;
    let failed = 0;

    for (const line of lines) {
      const parts = line.split("\t");
      const bulkTitle = parts[0]?.trim();
      if (!bulkTitle) { failed++; continue; }
      const bulkDescription = parts[1]?.trim() || null;
      const bulkDeadline = parts[2]?.trim() || null;

      try {
        await createProject({
          title: bulkTitle,
          description: bulkDescription,
          studentIds: bulkSelectedIds,
          deadline: bulkDeadline,
          briefPdfPath: bulkBriefPdfPath,
        });
        created++;
      } catch {
        failed++;
      }
    }

    if (failed === 0) {
      navigate("/teacher/projects");
    } else {
      setError(`Created ${created} project(s). ${failed} failed.`);
      setSaving(false);
    }
  }

  const selectedStudents = students.filter((s) => selectedIds.includes(s.id));

  return (
    <TeacherShell section="projects">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <button onClick={() => navigate("/teacher/projects")} className="mb-2 text-sm text-[var(--fg-muted)] hover:text-[var(--fg)]">
            &larr; Back to projects
          </button>
          <h1 className="text-2xl font-bold text-[var(--fg)]">New Project</h1>
          <p className="mt-1 text-sm text-[var(--fg-muted)]">Create one project or bulk-import many at once.</p>
        </div>

        <div className="flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-1">
          <button
            onClick={() => setMode("single")}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
              mode === "single" ? "bg-[var(--surface)] text-[var(--fg)] shadow-sm" : "text-[var(--fg-muted)] hover:text-[var(--fg)]"
            }`}
          >
            Single
          </button>
          <button
            onClick={() => setMode("bulk")}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
              mode === "bulk" ? "bg-[var(--surface)] text-[var(--fg)] shadow-sm" : "text-[var(--fg-muted)] hover:text-[var(--fg)]"
            }`}
          >
            Bulk Import
          </button>
        </div>

        {mode === "single" && (
          <form onSubmit={handleSingleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--fg)]">Title *</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Portfolio Website" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--fg)]">Description</label>
              <textarea
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)]"
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of the project..."
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--fg)]">Deadline</label>
              <Input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </div>

            <ProjectBriefField briefPdfPath={briefPdfPath} onChange={setBriefPdfPath} />

            {/* Student multi-select */}
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--fg)]">Assign Students</label>
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-left text-sm text-[var(--fg)]"
                >
                  {selectedStudents.length === 0
                    ? <span className="text-[var(--fg-muted)]">Select students...</span>
                    : <span>{selectedStudents.length} student(s) selected</span>
                  }
                </button>

                {dropdownOpen && (
                  <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-lg">
                    <div className="sticky top-0 flex gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-2 py-1.5">
                      <button type="button" onClick={selectAllStudents} className="text-xs text-[var(--accent)] hover:underline">
                        Select all
                      </button>
                      <button type="button" onClick={clearAllStudents} className="text-xs text-[var(--fg-muted)] hover:underline">
                        Clear
                      </button>
                      <span className="ml-auto text-xs text-[var(--fg-muted)]">{selectedIds.length}/{students.length}</span>
                    </div>
                    <StudentOptionGroups groups={studentGroups} selectedIds={selectedIds} onToggle={toggleStudent} />
                    {students.length === 0 && (
                      <div className="px-3 py-4 text-center text-xs text-[var(--fg-muted)]">No students found.</div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}
            <div className="flex gap-2 pt-2">
              <Button variant="secondary" type="button" onClick={() => navigate("/teacher/projects")}>Cancel</Button>
              <Button type="submit" disabled={saving || !title.trim()}>{saving ? "Creating..." : "Create Project"}</Button>
            </div>
          </form>
        )}

        {mode === "bulk" && (
          <form onSubmit={handleBulkSubmit} className="space-y-4">
            <Card>
              <p className="mb-2 text-sm text-[var(--fg)]">
                Paste one project per line, <strong>tab-separated</strong>. The students selected below are assigned to every project:
              </p>
              <div className="overflow-x-auto rounded-md bg-[var(--surface-muted)] p-3 text-xs text-[var(--fg-muted)]">
                <code>
                  Title {"\t"} Description {"\t"} Deadline<br />
                  Portfolio {"\t"} Personal site {"\t"} 2026-06-15T23:59<br />
                  API Project {"\t"} Build a REST API {"\t"} 2026-07-01T23:59
                </code>
              </div>
            </Card>

            <ProjectBriefField briefPdfPath={bulkBriefPdfPath} onChange={setBulkBriefPdfPath} />

            {/* Student multi-select (bulk) */}
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--fg)]">Assign Students (applies to all projects)</label>
              <div className="relative" ref={bulkDropdownRef}>
                <button
                  type="button"
                  onClick={() => setBulkDropdownOpen(!bulkDropdownOpen)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-left text-sm text-[var(--fg)]"
                >
                  {bulkSelectedIds.length === 0
                    ? <span className="text-[var(--fg-muted)]">Select students...</span>
                    : <span>{bulkSelectedIds.length} student(s) selected</span>
                  }
                </button>

                {bulkDropdownOpen && (
                  <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-lg">
                    <div className="sticky top-0 flex gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-2 py-1.5">
                      <button type="button" onClick={selectAllBulkStudents} className="text-xs text-[var(--accent)] hover:underline">
                        Select all
                      </button>
                      <button type="button" onClick={clearAllBulkStudents} className="text-xs text-[var(--fg-muted)] hover:underline">
                        Clear
                      </button>
                      <span className="ml-auto text-xs text-[var(--fg-muted)]">{bulkSelectedIds.length}/{students.length}</span>
                    </div>
                    <StudentOptionGroups groups={studentGroups} selectedIds={bulkSelectedIds} onToggle={toggleBulkStudent} />
                    {students.length === 0 && (
                      <div className="px-3 py-4 text-center text-xs text-[var(--fg-muted)]">No students found.</div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--fg)]">Projects data *</label>
              <textarea
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm font-mono text-[var(--fg)]"
                rows={8}
                value={bulkData}
                onChange={(e) => setBulkData(e.target.value)}
                placeholder={"Project Title\tDescription\t2026-06-15T23:59\nProject 2\tAnother desc\t2026-07-01T23:59"}
              />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <div className="flex gap-2 pt-2">
              <Button variant="secondary" type="button" onClick={() => navigate("/teacher/projects")}>Cancel</Button>
              <Button type="submit" disabled={saving || !bulkData.trim()}>
                {saving ? "Creating..." : `Import ${bulkData.trim().split("\n").filter(Boolean).length} Project(s)`}
              </Button>
            </div>
          </form>
        )}
      </div>
    </TeacherShell>
  );
}
