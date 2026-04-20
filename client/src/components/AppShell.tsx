import { useEffect, useState, type ReactNode } from "react";
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
    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent)] text-[var(--accent-fg)] shadow-sm">
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
      className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--fg-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--fg)] transition-colors"
    >
      {mode === "dark" ? <Icon.Sun className="h-4 w-4" /> : <Icon.Moon className="h-4 w-4" />}
    </button>
  );
}

function NavLink({ item, active, onNavigate }: { item: NavItem; active: boolean; onNavigate?: () => void }) {
  return (
    <Link
      to={item.to}
      onClick={onNavigate}
      className={cn(
        "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-[var(--accent-soft)] text-[var(--accent)]"
          : "text-[var(--fg-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--fg)]",
      )}
    >
      <span className={cn("flex h-5 w-5 items-center justify-center", active && "text-[var(--accent)]")}>
        {item.icon}
      </span>
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

export function AppShell({ nav, portalLabel, activeKey, primaryAction, children }: Props) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  function handleLogout() {
    logout();
    navigate("/login");
  }

  const activeItem = nav.find((n) => n.key === activeKey) || nav.find((n) => n.matches?.(location.pathname));

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 py-5">
        <BrandMark />
        <div className="min-w-0">
          <div className="text-sm font-semibold tracking-tight text-[var(--fg)]">Reviewer</div>
          <div className="text-[11px] uppercase tracking-wider text-[var(--fg-subtle)]">{portalLabel}</div>
        </div>
      </div>

      {primaryAction && (
        <div className="px-4 pb-3">
          <Link
            to={primaryAction.to}
            className="flex h-9 w-full items-center justify-center gap-2 rounded-md bg-[var(--accent)] px-4 text-sm font-medium text-[var(--accent-fg)] shadow-sm hover:opacity-90 transition-opacity"
          >
            <Icon.Plus className="h-4 w-4" />
            {primaryAction.label}
          </Link>
        </div>
      )}

      <div className="px-3 pt-1 pb-2">
        <div className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--fg-subtle)]">Workspace</div>
        <nav className="flex flex-col gap-0.5">
          {nav.map((item) => (
            <NavLink
              key={item.key}
              item={item}
              active={activeItem?.key === item.key}
            />
          ))}
        </nav>
      </div>

      <div className="mt-auto border-t border-[var(--border)] p-3">
        <div className="flex items-center gap-3 rounded-md p-2">
          <Avatar name={user?.fullName || "?"} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-semibold text-[var(--fg)]">{user?.fullName}</div>
            <div className="truncate text-[11px] text-[var(--fg-muted)]">{user?.email}</div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            title="Log out"
            className="rounded-md p-1.5 text-[var(--fg-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--danger)] transition-colors"
          >
            <Icon.Logout className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-[var(--bg)]">
      <aside className="hidden w-64 shrink-0 border-r border-[var(--border)] bg-[var(--surface)] lg:block">
        <div className="sticky top-0 h-screen">{sidebar}</div>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden" onClick={() => setMobileOpen(false)}>
          <div className="absolute inset-0 bg-black/40 animate-fade-in" />
          <aside className="relative w-72 max-w-[85vw] border-r border-[var(--border)] bg-[var(--surface)] animate-slide-in-right" onClick={(e) => e.stopPropagation()}>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)]/80 backdrop-blur px-4 sm:px-6">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setMobileOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] text-[var(--fg-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--fg)] lg:hidden"
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
