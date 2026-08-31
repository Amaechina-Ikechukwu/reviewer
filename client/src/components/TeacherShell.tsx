import { useMemo, type ReactNode } from "react";
import { AppShell, type NavItem, type NavSection } from "./AppShell";
import { Icon } from "./ui/Icons";
import { useAuth } from "../context/AuthContext";
import { hasPermission, isStaffRole, type Permission } from "../types";

export type TeacherSection =
  | "dashboard" | "assignments" | "submissions" | "students" | "cohorts"
  | "gradebook" | "notes" | "groupProjects" | "projects" | "notifications"
  | "settings" | "forms" | "quizzes" | "staff" | "logs" | "changelog";

type NavItemWithPerm = NavItem & {
  requiredPerms?: Permission[];
  staffOnly?: boolean;
};

type NavSectionWithPerm = {
  title: string;
  items: NavItemWithPerm[];
};

const ALL_SECTIONS: NavSectionWithPerm[] = [
  {
    title: "Workspace",
    items: [
      { key: "dashboard", label: "Dashboard", to: "/teacher", icon: <Icon.Dashboard className="h-4 w-4" />, matches: (p) => p === "/teacher" },
      {
        key: "assignments",
        label: "Assignments",
        to: "/teacher/assignments",
        icon: <Icon.FilePlus className="h-4 w-4" />,
        matches: (p) => p.startsWith("/teacher/assignments") && !p.includes("/groups"),
        requiredPerms: ["assignments.manage", "grades.edit", "reviews.run"],
      },
      {
        key: "groupProjects",
        label: "Group Projects",
        to: "/teacher/group-projects",
        icon: <Icon.Users className="h-4 w-4" />,
        matches: (p) => p.startsWith("/teacher/group-projects") || p.includes("/groups"),
        requiredPerms: ["assignments.manage"],
      },
      {
        key: "projects",
        label: "Projects",
        to: "/teacher/projects",
        icon: <Icon.Folder className="h-4 w-4" />,
        matches: (p) => p.startsWith("/teacher/projects"),
        requiredPerms: ["projects.manage"],
        staffOnly: true,
      },
      {
        key: "submissions",
        label: "Submissions",
        to: "/teacher/submissions",
        icon: <Icon.Inbox className="h-4 w-4" />,
        matches: (p) => p.startsWith("/teacher/submissions") || p.startsWith("/teacher/review") || p.startsWith("/teacher/import"),
        requiredPerms: ["grades.edit", "reviews.run", "submissions.manage"],
      },
      {
        key: "gradebook",
        label: "Gradebook",
        to: "/teacher/gradebook",
        icon: <Icon.Book className="h-4 w-4" />,
        matches: (p) => p.startsWith("/teacher/gradebook"),
        requiredPerms: ["grades.edit", "scores.view"],
      },
      {
        key: "notes",
        label: "Class Notes",
        to: "/teacher/notes",
        icon: <Icon.FileText className="h-4 w-4" />,
        matches: (p) => p.startsWith("/teacher/notes"),
        requiredPerms: ["notes.manage"],
      },
      {
        key: "quizzes",
        label: "Quizzes",
        to: "/teacher/quizzes",
        icon: <Icon.Clock className="h-4 w-4" />,
        matches: (p) => p.startsWith("/teacher/quizzes"),
        requiredPerms: ["quizzes.manage"],
      },
    ],
  },
  {
    title: "People & Communication",
    items: [
      {
        key: "students",
        label: "Students",
        to: "/teacher/students",
        icon: <Icon.Users className="h-4 w-4" />,
        matches: (p) => p.startsWith("/teacher/students"),
        requiredPerms: ["students.manage"],
      },
      {
        key: "cohorts",
        label: "Cohorts",
        to: "/teacher/cohorts",
        icon: <Icon.Layers className="h-4 w-4" />,
        matches: (p) => p.startsWith("/teacher/cohorts"),
        requiredPerms: ["cohorts.manage"],
      },
      {
        key: "notifications",
        label: "Email Notifications",
        to: "/teacher/notifications",
        icon: <Icon.Megaphone className="h-4 w-4" />,
        matches: (p) => p.startsWith("/teacher/notifications"),
        requiredPerms: ["notifications.send"],
      },
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
  const canCreate = hasPermission(user, "assignments.manage");
  const isStaff = user && isStaffRole(user.role);

  const filteredSections = useMemo<NavSection[]>(() => {
    if (!user) return [];

    const visibleSections: NavSection[] = [];

    for (const sec of ALL_SECTIONS) {
      const visibleItems = sec.items.filter((item) => {
        if (item.staffOnly && !isStaff) return false;
        if (!item.requiredPerms) return true;
        if (isStaff) {
          return item.requiredPerms.some((p) => hasPermission(user, p));
        }
        return item.requiredPerms.some((p) => hasPermission(user, p));
      });

      if (visibleItems.length > 0) {
        visibleSections.push({
          title: sec.title,
          items: visibleItems,
        });
      }
    }

    if (!isStaff) {
      visibleSections.push({
        title: "Your Account",
        items: [
          {
            key: "student-home",
            label: "Back to My Dashboard",
            to: "/student",
            icon: <Icon.Dashboard className="h-4 w-4" />,
            matches: () => false,
          },
        ],
      });
    }

    return visibleSections;
  }, [user, isStaff]);

  return (
    <AppShell
      sections={filteredSections}
      portalLabel={isStaff ? "Teacher Portal" : "Staff Assistant Tools"}
      activeKey={section}
      primaryAction={canCreate ? { label: "New assignment", to: "/teacher/assignments/new" } : undefined}
    >
      {children}
    </AppShell>
  );
}

export const SECTIONS: NavSection[] = ALL_SECTIONS;
