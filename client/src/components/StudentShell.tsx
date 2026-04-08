import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Toaster } from "./Toast";

type StudentShellProps = {
  section: "dashboard" | "submissions";
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

function SubmissionIcon() {
  return (
    <IconBase>
      <path d="M7 7h10M7 12h7M7 17h5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <path d="m15 10 3 2-3 2M9 14l-3-2 3-2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
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

const sideLinks = [
  { key: "dashboard", label: "Dashboard", to: "/student", icon: <DashboardIcon /> },
  { key: "submissions", label: "Submissions", to: "/student/results", icon: <SubmissionIcon /> },
] as const;

export default function StudentShell({ section, children }: StudentShellProps) {
  const { user } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark brand-mark-square"><SparklesIcon /></div>
          <div>
            <div className="brand-title">Reviewer</div>
            <div className="brand-subtitle">Student Portal</div>
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

        <div className="sidebar-spacer" />

        <div className="sidebar-footer">
          <span>{user?.fullName}</span>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            <Link className="topbar-logo" to="/student">Reviewer</Link>
          </div>
          <div className="topbar-actions">
            <div className="search-pill">
              <span className="search-icon"><SearchIcon /></span>
              <span>Search assignments...</span>
            </div>
            <div className="avatar-pill">
              {user?.fullName?.slice(0, 1).toUpperCase() || "S"}
            </div>
          </div>
        </header>

        <main className="main-content">{children}</main>
      </div>
      <Toaster />
    </div>
  );
}
