import type { ReactNode } from "react";
import { AppShell, type NavSection } from "./AppShell";
import { Icon } from "./ui/Icons";

export type TeacherSection =
  | "dashboard" | "assignments" | "submissions" | "students" | "cohorts"
  | "gradebook" | "notes" | "groupProjects" | "notifications"
  | "settings" | "forms" | "quizzes" | "staff" | "logs" | "changelog";

const SECTIONS: NavSection[] = [
  {
    title: "Workspace",
    items: [
      { key: "dashboard", label: "Dashboard", to: "/teacher", icon: <Icon.Dashboard className="h-4 w-4" />, matches: (p) => p === "/teacher" },
      { key: "assignments", label: "Assignments", to: "/teacher/assignments/new", icon: <Icon.FilePlus className="h-4 w-4" />, matches: (p) => p.startsWith("/teacher/assignments") && !p.includes("/groups") },
      { key: "groupProjects", label: "Group Projects", to: "/teacher/group-projects", icon: <Icon.Users className="h-4 w-4" />, matches: (p) => p.startsWith("/teacher/group-projects") || p.includes("/groups") },
      { key: "submissions", label: "Submissions", to: "/teacher/submissions", icon: <Icon.Inbox className="h-4 w-4" />, matches: (p) => p.startsWith("/teacher/submissions") || p.startsWith("/teacher/review") || p.startsWith("/teacher/import") },
      { key: "gradebook", label: "Gradebook", to: "/teacher/gradebook", icon: <Icon.Book className="h-4 w-4" />, matches: (p) => p.startsWith("/teacher/gradebook") },
      { key: "notes", label: "Class Notes", to: "/teacher/notes", icon: <Icon.FileText className="h-4 w-4" />, matches: (p) => p.startsWith("/teacher/notes") },
      { key: "quizzes", label: "Quizzes", to: "/teacher/quizzes", icon: <Icon.Clock className="h-4 w-4" />, matches: (p) => p.startsWith("/teacher/quizzes") },
    ],
  },
  {
    title: "People & Communication",
    items: [
      { key: "students", label: "Students", to: "/teacher/students", icon: <Icon.Users className="h-4 w-4" />, matches: (p) => p.startsWith("/teacher/students") },
      { key: "cohorts", label: "Cohorts", to: "/teacher/cohorts", icon: <Icon.Layers className="h-4 w-4" />, matches: (p) => p.startsWith("/teacher/cohorts") },
      { key: "notifications", label: "Email Notifications", to: "/teacher/notifications", icon: <Icon.Megaphone className="h-4 w-4" />, matches: (p) => p.startsWith("/teacher/notifications") },
    ],
  },
];

export default function TeacherShell({
  section,
  children,
}: {
  section: TeacherSection;
  children: ReactNode;
}) {
  return (
    <AppShell
      sections={SECTIONS}
      portalLabel="Teacher Portal"
      activeKey={section}
      primaryAction={{ label: "New assignment", to: "/teacher/assignments/new" }}
    >
      {children}
    </AppShell>
  );
}

export { SECTIONS };
