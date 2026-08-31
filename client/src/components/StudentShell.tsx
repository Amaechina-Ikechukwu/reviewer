import type { ReactNode } from "react";
import { AppShell, type NavSection } from "./AppShell";
import { Icon } from "./ui/Icons";
import { useAuth } from "../context/AuthContext";
import { firstTeacherRoute } from "./TeacherShell";

type StudentSection = "dashboard" | "submissions" | "notes" | "forms" | "quizzes" | "projects";

const SECTIONS: NavSection[] = [
  {
    title: "General",
    items: [
      { key: "dashboard", label: "Dashboard", to: "/student", icon: <Icon.Dashboard className="h-4 w-4" />, matches: (p) => p === "/student" || p.startsWith("/student/submit") },
      { key: "submissions", label: "My Submissions", to: "/student/results", icon: <Icon.Inbox className="h-4 w-4" />, matches: (p) => p.startsWith("/student/results") },
      { key: "forms", label: "Forms", to: "/student/forms", icon: <Icon.Edit className="h-4 w-4" />, matches: (p) => p.startsWith("/student/forms") },
      { key: "quizzes", label: "Quizzes", to: "/student/quizzes", icon: <Icon.Clock className="h-4 w-4" />, matches: (p) => p.startsWith("/student/quizzes") },
      { key: "notes", label: "Class Notes", to: "/student/notes", icon: <Icon.FileText className="h-4 w-4" />, matches: (p) => p.startsWith("/student/notes") },
      { key: "projects", label: "Projects", to: "/student/projects", icon: <Icon.Folder className="h-4 w-4" />, matches: (p) => p.startsWith("/student/projects") },
    ],
  },
];

export default function StudentShell({ section, children }: { section: StudentSection; children: ReactNode }) {
  const { user } = useAuth();
  // A student individually granted responsibilities gets a way back to the
  // teacher portal for those — everyone else never sees the door.
  const sections = user?.permissions?.length
    ? [
        ...SECTIONS,
        {
          title: "Responsibilities",
          items: [
            { key: "staff-tools", label: "Staff Tools", to: firstTeacherRoute(user), icon: <Icon.Shield className="h-4 w-4" />, matches: () => false },
          ],
        },
      ]
    : SECTIONS;

  return (
    <AppShell sections={sections} portalLabel="Student Portal" activeKey={section}>
      {children}
    </AppShell>
  );
}
