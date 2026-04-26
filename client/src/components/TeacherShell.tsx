import type { ReactNode } from "react";
import { AppShell, type NavItem } from "./AppShell";
import { Icon } from "./ui/Icons";

type TeacherSection = "dashboard" | "assignments" | "submissions" | "students" | "logs" | "gradebook" | "notes";

const nav: NavItem[] = [
  { key: "dashboard", label: "Dashboard", to: "/teacher", icon: <Icon.Dashboard className="h-4 w-4" />, matches: (p) => p === "/teacher" },
  { key: "assignments", label: "Assignments", to: "/teacher/assignments/new", icon: <Icon.FilePlus className="h-4 w-4" />, matches: (p) => p.startsWith("/teacher/assignments") },
  { key: "submissions", label: "Submissions", to: "/teacher/submissions", icon: <Icon.Inbox className="h-4 w-4" />, matches: (p) => p.startsWith("/teacher/submissions") || p.startsWith("/teacher/review") || p.startsWith("/teacher/import") },
  { key: "students", label: "Students", to: "/teacher/students", icon: <Icon.Users className="h-4 w-4" />, matches: (p) => p.startsWith("/teacher/students") },
  { key: "gradebook", label: "Gradebook", to: "/teacher/gradebook", icon: <Icon.Book className="h-4 w-4" />, matches: (p) => p.startsWith("/teacher/gradebook") },
  { key: "notes", label: "Class Notes", to: "/teacher/notes", icon: <Icon.FileText className="h-4 w-4" />, matches: (p) => p.startsWith("/teacher/notes") },
  { key: "logs", label: "Activity", to: "/teacher/logs", icon: <Icon.Activity className="h-4 w-4" />, matches: (p) => p.startsWith("/teacher/logs") },
];

export default function TeacherShell({
  section,
  children,
}: {
  section: TeacherSection;
  title?: string;
  children: ReactNode;
}) {
  return (
    <AppShell
      nav={nav}
      portalLabel="Teacher Portal"
      activeKey={section}
      primaryAction={{ label: "New assignment", to: "/teacher/assignments/new" }}
    >
      {children}
    </AppShell>
  );
}
