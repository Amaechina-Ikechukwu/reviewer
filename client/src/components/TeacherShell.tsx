import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Toaster } from "./Toast";

type TeacherShellProps = {
  section: "dashboard" | "assignments" | "submissions" | "students" | "logs" | "gradebook";
  title?: string;
  children: ReactNode;
};

function IconBase({ children }: { children: ReactNode }) {
  return (
    <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18">
      {children}
    </svg>
  );
}

function DashboardIcon() {
  return (
    <IconBase>
      <path d="M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z" fill="currentColor" />
    </IconBase>
  );
}

function AssignmentIcon() {
  return (
    <IconBase>
      <rect height="16" rx="2" stroke="currentColor" strokeWidth="1.8" width="14" x="5" y="4" />
      <path d="M9 2h6v4H9zM8 10h8M8 14h8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </IconBase>
  );
}

function SubmissionIcon() {
  return (
    <IconBase>
      <path d="M7 7h10M7 12h7M7 17h5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <path d="m15 10 3 2-3 2M9 14l-3-2 3-2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </IconBase>
  );
}

function StudentsIcon() {
  return (
    <IconBase>
      <circle cx="9" cy="9" fill="currentColor" r="3" />
      <circle cx="17" cy="10" fill="currentColor" opacity="0.7" r="2.5" />
      <path d="M4.5 19a4.5 4.5 0 0 1 9 0M13 19a4 4 0 0 1 7 0" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </IconBase>
  );
}

function SparklesIcon() {
  return (
    <IconBase>
      <path d="m12 3 1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3ZM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15ZM6 15l.8 2.2L9 18l-2.2.8L6 21l-.8-2.2L3 18l2.2-.8L6 15Z" fill="currentColor" />
    </IconBase>
  );
}

function SearchIcon() {
  return (
    <IconBase>
      <circle cx="11" cy="11" r="5.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="m16 16 4 4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </IconBase>
  );
}

function LogsIcon() {
  return (
    <IconBase>
      <path d="M4 6h16M4 10h10M4 14h7M4 18h5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </IconBase>
  );
}

function GradebookIcon() {
  return (
    <IconBase>
      <rect height="14" rx="1.5" stroke="currentColor" strokeWidth="1.8" width="16" x="4" y="5" />
      <path d="M4 9h16M9 9v10" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </IconBase>
  );
}

const sideLinks = [
  { key: "dashboard", label: "Dashboard", to: "/teacher", icon: <DashboardIcon /> },
  { key: "assignments", label: "Assignments", to: "/teacher/assignments/new", icon: <AssignmentIcon /> },
  { key: "submissions", label: "Submissions", to: "/teacher/submissions", icon: <SubmissionIcon /> },
  { key: "students", label: "Students", to: "/teacher/students", icon: <StudentsIcon /> },
  { key: "gradebook", label: "Gradebook", to: "/teacher/gradebook", icon: <GradebookIcon /> },
  { key: "logs", label: "Activity Log", to: "/teacher/logs", icon: <LogsIcon /> },
] as const;

export default function TeacherShell({
  section,
  title = "Reviewer",
  children,
}: TeacherShellProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="sidebar-hamburger" aria-label="Open menu" type="button">
          <svg fill="none" height="18" viewBox="0 0 24 24" width="18">
            <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
          </svg>
        </button>

        <div className="sidebar-menu">
          <div className="brand-lockup">
            <div className="brand-mark brand-mark-square"><SparklesIcon /></div>
            <div>
              <div className="brand-title">{title}</div>
              <div className="brand-subtitle">Teacher Portal</div>
            </div>
          </div>

          <nav className="sidebar-nav">
            {sideLinks.map((link) => (
              <Link
                key={link.key}
                className={`sidebar-link ${section === link.key ? "active" : ""}`}
                to={link.to}
              >
                <span className="sidebar-icon">{link.icon}</span>
                <span>{link.label}</span>
              </Link>
            ))}
          </nav>

          <div className="sidebar-menu-footer">
            <Link className="sidebar-cta" to="/teacher/assignments/new">New Assignment</Link>
            <div className="sidebar-footer">
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.fullName}</span>
              <button
                type="button"
                onClick={handleLogout}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#b91c1c", fontWeight: 600, fontSize: "0.85rem", padding: 0 }}
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </aside>

      <main className="main-content">{children}</main>
      <Toaster />
    </div>
  );
}
