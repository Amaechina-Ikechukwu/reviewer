import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

type StudentShellProps = {
  section: "dashboard" | "submissions";
  searchPlaceholder?: string;
  children: ReactNode;
};

const topLinks = [
  { key: "dashboard", label: "Dashboard", to: "/student" },
  { key: "submissions", label: "Submissions", to: "/student/results" },
] as const;

function IconBase({ children }: { children: ReactNode }) {
  return (
    <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18">
      {children}
    </svg>
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

export default function StudentShell({
  section,
  searchPlaceholder = "Search assignments...",
  children,
}: StudentShellProps) {
  const { user } = useAuth();

  return (
    <div className="student-shell">
      <header className="student-topbar">
        <div className="topbar-left">
          <Link className="topbar-logo" to="/student">Reviewer</Link>
          <nav className="topbar-nav">
            {topLinks.map((link) => (
              <Link key={link.key} className={`topbar-link ${section === link.key ? "active" : ""}`} to={link.to}>
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="topbar-actions">
          <div className="search-pill">
            <span className="search-icon"><SearchIcon /></span>
            <span>{searchPlaceholder}</span>
          </div>
          <div className="avatar-pill">{user?.fullName?.slice(0, 1).toUpperCase() || "S"}</div>
        </div>
      </header>
      <main className="student-content">{children}</main>
    </div>
  );
}
