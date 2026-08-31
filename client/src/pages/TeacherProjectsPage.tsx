import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { listCohorts, listProjects, listStudents } from "../api";
import TeacherShell from "../components/TeacherShell";
import { Avatar } from "../components/ui/Avatar";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Icon } from "../components/ui/Icons";
import { Input, Select } from "../components/ui/Input";
import { Table, TBody, TD, TH, THead, TR, EmptyRow } from "../components/ui/Table";
import { cn } from "../lib/cn";
import type { Cohort, StudentRecord } from "../types";

type Row = StudentRecord & { assignedCount: number; ownCount: number };
type SortKey = "name" | "assigned" | "own";

function SortHeader({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
  className,
}: {
  label: ReactNode;
  sortKey: SortKey;
  activeKey: SortKey;
  dir: "asc" | "desc";
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = activeKey === sortKey;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={cn(
        "inline-flex items-center gap-1 transition-colors hover:text-[var(--fg)]",
        active ? "text-[var(--fg)]" : "text-[var(--fg-muted)]",
        className,
      )}
    >
      {label}
      <Icon.ChevronDown
        className={cn(
          "h-3 w-3 shrink-0 transition-transform",
          active ? "opacity-100" : "opacity-30",
          active && dir === "asc" ? "rotate-180" : "",
        )}
      />
    </button>
  );
}

export default function TeacherProjectsPage() {
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedCohortId, setSelectedCohortId] = useState("all");
  const [onlyWithProjects, setOnlyWithProjects] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const navigate = useNavigate();

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  }

  useEffect(() => {
    Promise.all([listProjects(), listStudents(), listCohorts().catch(() => [])])
      .then(([projects, studentList, cohortList]) => {
        setStudents(studentList);
        setCohorts(cohortList);

        const studentIds = new Set(studentList.map((s) => s.id));
        const assigned: Record<string, number> = {};
        const own: Record<string, number> = {};
        for (const student of studentList) { assigned[student.id] = 0; own[student.id] = 0; }

        for (const project of projects) {
          // A project a student created for themselves has them as the sole
          // member and the creator; anything else — assigned by staff, even
          // to a group — counts as instructor work, not self-practice.
          const isOwnProject = studentIds.has(project.createdBy);
          for (const sid of project.studentIds ?? []) {
            if (assigned[sid] === undefined) continue;
            if (isOwnProject) own[sid]++;
            else assigned[sid]++;
          }
        }

        setRows(
          studentList.map((s) => ({ ...s, assignedCount: assigned[s.id] ?? 0, ownCount: own[s.id] ?? 0 })),
        );
      })
      .finally(() => setLoading(false));
  }, []);

  const cohortNameById = useMemo(() => new Map(cohorts.map((c) => [c.id, c.name])), [cohorts]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (selectedCohortId !== "all" && r.cohortId !== selectedCohortId) return false;
      if (onlyWithProjects && r.assignedCount === 0 && r.ownCount === 0) return false;
      if (needle && !r.fullName.toLowerCase().includes(needle) && !r.email.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [rows, query, selectedCohortId, onlyWithProjects]);

  function sortRows(list: Row[]): Row[] {
    const copy = [...list];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.fullName.localeCompare(b.fullName);
      else if (sortKey === "assigned") cmp = a.assignedCount - b.assignedCount;
      else cmp = a.ownCount - b.ownCount;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }

  const groups = useMemo(() => {
    const byCohort = new Map<string, Row[]>();
    for (const r of filtered) {
      const key = r.cohortId || "__none__";
      if (!byCohort.has(key)) byCohort.set(key, []);
      byCohort.get(key)!.push(r);
    }
    const list = [...byCohort.entries()].map(([key, list]) => ({
      cohortName: key === "__none__" ? "No cohort" : (cohortNameById.get(key) ?? "Unknown cohort"),
      rows: sortRows(list),
    }));
    list.sort((a, b) => {
      if (a.cohortName === "No cohort") return 1;
      if (b.cohortName === "No cohort") return -1;
      return a.cohortName.localeCompare(b.cohortName);
    });
    return list;
  }, [filtered, cohortNameById, sortKey, sortDir]);

  const studentsWithProjects = useMemo(
    () => rows.filter((r) => r.assignedCount > 0 || r.ownCount > 0).length,
    [rows],
  );

  if (loading) {
    return (
      <TeacherShell section="projects">
        <div className="text-sm text-[var(--fg-muted)]">Loading...</div>
      </TeacherShell>
    );
  }

  return (
    <TeacherShell section="projects">
      <div className="max-w-4xl space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight text-[var(--fg)]">Projects</h1>
            <p className="text-sm text-[var(--fg-muted)]">
              {studentsWithProjects} of {students.length} students have projects
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="secondary" onClick={() => navigate("/teacher/projects/new")}>
              <Icon.Plus className="h-4 w-4" />
              New Project
            </Button>
            <Button onClick={() => navigate("/teacher/projects/new?mode=bulk")}>
              Bulk Import
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-56">
            <Icon.Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--fg-subtle)]" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a student..."
              className="h-9 pl-8 text-sm"
            />
          </div>
          <Select value={selectedCohortId} onChange={(e) => setSelectedCohortId(e.target.value)} className="w-48">
            <option value="all">All cohorts</option>
            {cohorts.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--fg-muted)]">
            <input
              type="checkbox"
              checked={onlyWithProjects}
              onChange={(e) => setOnlyWithProjects(e.target.checked)}
              className="h-4 w-4 rounded border-[var(--border)] text-[var(--accent)]"
            />
            Only students with projects
          </label>
          {(query || selectedCohortId !== "all" || onlyWithProjects) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setQuery(""); setSelectedCohortId("all"); setOnlyWithProjects(false); }}
            >
              Clear filters
            </Button>
          )}
        </div>

        <Card className="overflow-hidden">
          <Table>
            <THead>
              <TR>
                <TH><SortHeader label="Student" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={toggleSort} /></TH>
                <TH>Email</TH>
                <TH className="text-right">
                  <SortHeader label="Assigned by instructor" sortKey="assigned" activeKey={sortKey} dir={sortDir} onSort={toggleSort} className="justify-end" />
                </TH>
                <TH className="text-right">
                  <SortHeader label="Own projects" sortKey="own" activeKey={sortKey} dir={sortDir} onSort={toggleSort} className="justify-end" />
                </TH>
              </TR>
            </THead>
            <TBody>
              {groups.map((group) => (
                <Fragment key={group.cohortName}>
                  <TR className="bg-[var(--surface-muted)]/60">
                    <TD colSpan={4} className="py-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-muted)]">
                      {group.cohortName} <span className="font-normal normal-case text-[var(--fg-subtle)]">({group.rows.length})</span>
                    </TD>
                  </TR>
                  {group.rows.map((s) => (
                    <TR key={s.id} className="transition-colors hover:bg-[var(--surface-muted)]/30">
                      <TD label="Student">
                        <Link
                          to={`/teacher/projects/student/${s.id}`}
                          className="flex items-center gap-3 text-sm font-medium text-[var(--fg)] transition-colors hover:text-[var(--accent)]"
                        >
                          <Avatar name={s.fullName} size="xs" />
                          {s.fullName}
                        </Link>
                      </TD>
                      <TD label="Email" className="text-sm text-[var(--fg-muted)]">{s.email}</TD>
                      <TD label="Assigned by instructor" className="text-right">
                        <Link to={`/teacher/projects/student/${s.id}`}>
                          <Badge tone={s.assignedCount > 0 ? "success" : "neutral"} className="cursor-pointer">{s.assignedCount}</Badge>
                        </Link>
                      </TD>
                      <TD label="Own projects" className="text-right">
                        <Link to={`/teacher/projects/student/${s.id}`}>
                          <Badge tone="neutral" className="cursor-pointer">{s.ownCount}</Badge>
                        </Link>
                      </TD>
                    </TR>
                  ))}
                </Fragment>
              ))}
              {filtered.length === 0 && <EmptyRow cols={4}>No students match these filters.</EmptyRow>}
            </TBody>
          </Table>
        </Card>
      </div>
    </TeacherShell>
  );
}
