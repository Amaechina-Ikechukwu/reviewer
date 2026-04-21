import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { cn } from "../lib/cn";
import { getTheme, toggleTheme } from "../lib/theme";
import { Avatar } from "./ui/Avatar";
import { Icon } from "./ui/Icons";
import { Toaster } from "./Toast";

export type NavItem = {
  key: string;
  label: string;
  to: string;
  icon: ReactNode;
  matches?: (pathname: string) => boolean;
};

type Props = {
  nav: NavItem[];
  portalLabel: string;
  activeKey?: string;
  primaryAction?: { label: string; to: string };
  children: ReactNode;
};

function BrandMark() {
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center bg-[var(--accent)] text-[var(--accent-fg)]">
      <Icon.Sparkles className="h-5 w-5" />
    </div>
  );
}

function ThemeToggle() {
  const [mode, setMode] = useState<"light" | "dark">(() => getTheme());
  useEffect(() => {
    function onChange(e: Event) {
      setMode((e as CustomEvent<"light" | "dark">).detail);
    }
    window.addEventListener("theme-change", onChange);
    return () => window.removeEventListener("theme-change", onChange);
  }, []);
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label="Toggle theme"
      className="flex h-9 w-9 items-center justify-center border border-[var(--border)] bg-[var(--surface)] text-[var(--fg-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--fg)] transition-colors"
    >
      {mode === "dark" ? <Icon.Sun className="h-4 w-4" /> : <Icon.Moon className="h-4 w-4" />}
    </button>
  );
}

function NavLink({ item, active, collapsed, onNavigate }: { item: NavItem; active: boolean; collapsed: boolean; onNavigate?: () => void }) {
  return (
    <Link
      to={item.to}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      className={cn(
        "group flex items-center gap-3 px-3 py-2 text-sm font-medium transition-colors overflow-hidden",
        active
          ? "bg-[var(--accent-soft)] text-[var(--accent)]"
          : "text-[var(--fg-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--fg)]",
      )}
    >
      <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center", active && "text-[var(--accent)]")}>
        {item.icon}
      </span>
      <span className={cn("truncate transition-all duration-200", collapsed ? "w-0 opacity-0" : "w-auto opacity-100")}>
        {item.label}
      </span>
    </Link>
  );
}

export function AppShell({ nav, portalLabel, activeKey, primaryAction, children }: Props) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const collapsed = !sidebarHovered;

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  function handleLogout() {
    logout();
    navigate("/login");
  }

  function onSidebarEnter() {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    setSidebarHovered(true);
  }

  function onSidebarLeave() {
    hoverTimeout.current = setTimeout(() => setSidebarHovered(false), 120);
  }

  const activeItem = nav.find((n) => n.key === activeKey) || nav.find((n) => n.matches?.(location.pathname));

  const sidebar = (isMobile = false) => (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Brand */}
      <div className="flex items-center gap-3 px-3 py-5">
        <BrandMark />
        <div className={cn("min-w-0 transition-all duration-200", !isMobile && collapsed ? "w-0 opacity-0" : "w-auto opacity-100")}>
          <div className="whitespace-nowrap text-sm font-semibold tracking-tight text-[var(--fg)]">Reviewer</div>
          <div className="whitespace-nowrap text-[11px] uppercase tracking-wider text-[var(--fg-subtle)]">{portalLabel}</div>
        </div>
      </div>

      {/* Primary action */}
      {primaryAction && (
        <div className={cn("pb-3 transition-all duration-200", !isMobile && collapsed ? "px-2" : "px-3")}>
          <Link
            to={primaryAction.to}
            title={!isMobile && collapsed ? primaryAction.label : undefined}
            className="flex h-9 w-full items-center justify-center gap-2 bg-[var(--accent)] px-3 text-sm font-medium text-[var(--accent-fg)] hover:opacity-90 transition-opacity overflow-hidden"
          >
            <Icon.Plus className="h-4 w-4 shrink-0" />
            <span className={cn("truncate transition-all duration-200", !isMobile && collapsed ? "w-0 opacity-0" : "w-auto opacity-100")}>
              {primaryAction.label}
            </span>
          </Link>
        </div>
      )}

      {/* Nav */}
      <div className={cn("pt-1 pb-2 transition-all duration-200", !isMobile && collapsed ? "px-2" : "px-3")}>
        {(!collapsed || isMobile) && (
          <div className="px-1 pb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--fg-subtle)]">Workspace</div>
        )}
        <nav className="flex flex-col gap-0.5">
          {nav.map((item) => (
            <NavLink
              key={item.key}
              item={item}
              active={activeItem?.key === item.key}
              collapsed={!isMobile && collapsed}
              onNavigate={isMobile ? () => setMobileOpen(false) : undefined}
            />
          ))}
        </nav>
      </div>

      {/* User footer */}
      <div className="mt-auto border-t border-[var(--border)] p-2">
        <div className="flex items-center gap-3 p-1 overflow-hidden">
          <Avatar name={user?.fullName || "?"} size="sm" />
          <div className={cn("min-w-0 flex-1 transition-all duration-200", !isMobile && collapsed ? "w-0 opacity-0" : "w-auto opacity-100")}>
            <div className="truncate whitespace-nowrap text-xs font-semibold text-[var(--fg)]">{user?.fullName}</div>
            <div className="truncate whitespace-nowrap text-[11px] text-[var(--fg-muted)]">{user?.email}</div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            title="Log out"
            className={cn("shrink-0 p-1.5 text-[var(--fg-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--danger)] transition-colors", !isMobile && collapsed && "mx-auto")}
          >
            <Icon.Logout className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-[var(--bg)]">
      {/* Desktop auto-hide sidebar */}
      <aside
        onMouseEnter={onSidebarEnter}
        onMouseLeave={onSidebarLeave}
        className={cn(
          "hidden shrink-0 border-r border-[var(--border)] bg-[var(--surface)] lg:block transition-all duration-200 ease-in-out",
          collapsed ? "w-[56px]" : "w-56",
        )}
        style={{ position: "sticky", top: 0, height: "100vh", alignSelf: "flex-start" }}
      >
        {sidebar(false)}
      </aside>

      {/* Mobile overlay drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden" onClick={() => setMobileOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <aside className="relative w-64 border-r border-[var(--border)] bg-[var(--surface)]" onClick={(e) => e.stopPropagation()}>
            {sidebar(true)}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)]/80 backdrop-blur px-4 sm:px-6">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setMobileOpen(true)}
            className="flex h-9 w-9 items-center justify-center border border-[var(--border)] text-[var(--fg-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--fg)] lg:hidden"
          >
            <Icon.Menu className="h-4 w-4" />
          </button>

          <div className="min-w-0 flex-1">
            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-[var(--fg-muted)]">
              <Link to={nav[0]?.to ?? "/"} className="hover:text-[var(--fg)] transition-colors">
                {portalLabel}
              </Link>
              {activeItem && (
                <>
                  <Icon.ChevronRight className="h-3 w-3" />
                  <Link
                    to={activeItem.to}
                    aria-current="page"
                    className="font-medium text-[var(--fg)] hover:text-[var(--accent)] transition-colors"
                  >
                    {activeItem.label}
                  </Link>
                </>
              )}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>

      <Toaster />
    </div>
  );
}
