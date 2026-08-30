import type { ReactNode } from "react";
import { AppShell, type NavSection } from "./AppShell";
import { Icon } from "./ui/Icons";
import { useAuth } from "../context/AuthContext";
import { hasPermission, isStaffRole } from "../types";

export type TeacherSection =
  | "dashboard" | "assignments" | "submissions" | "students" | "cohorts"
  | "gradebook" | "notes" | "groupProjects" | "projects" | "notifications"
  | "settings" | "forms" | "quizzes" | "staff" | "logs" | "changelog";

const SECTIONS: NavSection[] = [
  {
    title: "Workspace",
    items: [
      { key: "dashboard", label: "Dashboard", to: "/teacher", icon: <Icon.Dashboard className="h-4 w-4" />, matches: (p) => p === "/teacher" },
      { key: "assignments", label: "Assignments", to: "/teacher/assignments", icon: <Icon.FilePlus className="h-4 w-4" />, matches: (p) => p.startsWith("/teacher/assignments") && !p.includes("/groups") },
      { key: "groupProjects", label: "Group Projects", to: "/teacher/group-projects", icon: <Icon.Users className="h-4 w-4" />, matches: (p) => p.startsWith("/teacher/group-projects") || p.includes("/groups") },
      { key: "projects", label: "Projects", to: "/teacher/projects", icon: <Icon.Folder className="h-4 w-4" />, matches: (p) => p.startsWith("/teacher/projects") },
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
  const { user } = useAuth();
  // No point offering an action the server will refuse.
  const canCreate = hasPermission(user, "assignments.manage");
  // A student here on individually granted responsibilities, not a role —
  // give them a way back to where they actually live.
  const sections = user && !isStaffRole(user.role)
    ? [
        ...SECTIONS,
        {
          title: "Your Account",
          items: [
            { key: "student-home", label: "Back to My Dashboard", to: "/student", icon: <Icon.Dashboard className="h-4 w-4" />, matches: () => false },
          ],
        },
      ]
    : SECTIONS;

  return (
    <AppShell
      sections={sections}
      portalLabel="Teacher Portal"
      activeKey={section}
      primaryAction={canCreate ? { label: "New assignment", to: "/teacher/assignments/new" } : undefined}
    >
      {children}
    </AppShell>
  );
}

export { SECTIONS };
