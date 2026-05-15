import type { ReactNode } from "react";
import { AppShell, type NavSection } from "./AppShell";
import { Icon } from "./ui/Icons";

type StudentSection = "dashboard" | "submissions" | "notes" | "forms";

const SECTIONS: NavSection[] = [
  {
    title: "General",
    items: [
      { key: "dashboard", label: "Dashboard", to: "/student", icon: <Icon.Dashboard className="h-4 w-4" />, matches: (p) => p === "/student" || p.startsWith("/student/submit") },
      { key: "submissions", label: "My Submissions", to: "/student/results", icon: <Icon.Inbox className="h-4 w-4" />, matches: (p) => p.startsWith("/student/results") },
      { key: "forms", label: "Forms", to: "/student/forms", icon: <Icon.Edit className="h-4 w-4" />, matches: (p) => p.startsWith("/student/forms") },
      { key: "notes", label: "Class Notes", to: "/student/notes", icon: <Icon.FileText className="h-4 w-4" />, matches: (p) => p.startsWith("/student/notes") },
    ],
  },
];

export default function StudentShell({ section, children }: { section: StudentSection; children: ReactNode }) {
  return (
    <AppShell sections={SECTIONS} portalLabel="Student Portal" activeKey={section}>
      {children}
    </AppShell>
  );
}
