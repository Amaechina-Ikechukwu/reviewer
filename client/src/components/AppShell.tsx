import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { cn } from "../lib/cn";
import { getTheme, toggleTheme } from "../lib/theme";
import { Avatar } from "./ui/Avatar";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";
import { Icon } from "./ui/Icons";
import { Modal } from "./ui/Modal";
import { Toaster } from "./Toast";
import { listInAppNotifications, markNotificationRead, markAllNotificationsRead, unreadNotificationCount } from "../api";
import type { InAppNotification } from "../types";

export type NavItem = {
  key: string;
  label: string;
  to: string;
  icon: ReactNode;
  matches?: (pathname: string) => boolean;
};

export type NavSection = {
  title: string;
  items: NavItem[];
};

type Props = {
  sections: NavSection[];
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

function SectionHeader({ title, collapsed }: { title: string; collapsed: boolean }) {
  if (collapsed) return null;
  return (
    <div className="px-1 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--fg-subtle)]">
      {title}
    </div>
  );
}

function NotificationPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    try {
      const [n] = await Promise.all([listInAppNotifications()]);
      setNotifications(n);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) fetch();
  }, [open, fetch]);

  async function handleClick(n: InAppNotification) {
    if (!n.read) {
      await markNotificationRead(n.id);
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    }
    onClose();
    if (n.link) navigate(n.link);
  }

  async function handleMarkAllRead() {
    await markAllNotificationsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  return (
    <>
      {open && <div className="fixed inset-0 z-40" onClick={onClose} />}
      <div
        className={cn(
          "fixed right-0 top-0 z-50 flex h-full w-80 flex-col border-l border-[var(--border)] bg-[var(--surface)] shadow-xl transition-transform duration-300",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <h2 className="text-sm font-semibold text-[var(--fg)]">Notifications</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleMarkAllRead}
              className="text-xs text-[var(--accent)] hover:underline"
            >
              Mark all read
            </button>
            <button onClick={onClose} className="text-[var(--fg-muted)] hover:text-[var(--fg)]">
              <Icon.X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="px-4 py-8 text-center text-sm text-[var(--fg-muted)]">Loading...</div>
          ) : notifications.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-[var(--fg-muted)]">No notifications yet.</div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={cn(
                    "flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-[var(--surface-muted)]",
                    n.read ? "opacity-60" : "bg-[var(--accent-soft)]/30",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[var(--fg)]">{n.title}</p>
                    <p className="mt-0.5 text-xs text-[var(--fg-muted)]">{n.body}</p>
                    {n.createdAt && (
                      <p className="mt-1 text-[11px] text-[var(--fg-subtle)]">
                        {new Date(n.createdAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                  {!n.read && (
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export function AppShell({ sections, portalLabel, activeKey, primaryAction, children }: Props) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [notifPanelOpen, setNotifPanelOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const collapsed = !sidebarHovered;

  const allItems = sections.flatMap((s) => s.items);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    async function fetchCount() {
      try {
        const { count } = await unreadNotificationCount();
        setUnreadCount(count);
      } catch {}
    }
    fetchCount();
    const interval = setInterval(fetchCount, 15000);
    return () => clearInterval(interval);
  }, []);

  function handleLogout() {
    logout();
    navigate("/login");
  }

  function confirmLogout() {
    setLogoutOpen(false);
    handleLogout();
  }

  function onSidebarEnter() {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    setSidebarHovered(true);
  }

  function onSidebarLeave() {
    hoverTimeout.current = setTimeout(() => setSidebarHovered(false), 120);
  }

  const activeItem = allItems.find((n) => n.key === activeKey) || allItems.find((n) => n.matches?.(location.pathname));

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

      {/* Sections */}
      <div className={cn("flex-1 overflow-y-auto transition-all duration-200", !isMobile && collapsed ? "px-2" : "px-3")}>
        {sections.map((section) => (
          <div key={section.title} className="pb-1">
            <SectionHeader title={section.title} collapsed={!isMobile && collapsed} />
            <nav className="flex flex-col gap-0.5">
              {section.items.map((item) => (
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
        ))}
      </div>

      {/* User footer */}
      <div className="border-t border-[var(--border)]">
        <div className="p-2">
          <Link
            to="/teacher/settings"
            title="Settings"
            className={cn(
              "flex items-center gap-3 rounded-lg p-1.5 transition-colors",
              collapsed && !isMobile ? "justify-center" : "",
              location.pathname.startsWith("/teacher/settings")
                ? "bg-[var(--accent-soft)]"
                : "hover:bg-[var(--surface-muted)]",
            )}
          >
            <Avatar name={user?.fullName || "?"} size="sm" />
            <div className={cn("min-w-0 flex-1 transition-all duration-200", !isMobile && collapsed ? "w-0 opacity-0 hidden" : "w-auto opacity-100")}>
              <div className="truncate whitespace-nowrap text-xs font-semibold text-[var(--fg)]">{user?.fullName}</div>
              <div className="truncate whitespace-nowrap text-[11px] text-[var(--fg-muted)]">{user?.email}</div>
            </div>
            <div className={cn("flex shrink-0 items-center gap-1", !isMobile && collapsed ? "hidden" : "")}>
              <Icon.ChevronRight className="h-3.5 w-3.5 text-[var(--fg-muted)]" />
            </div>
          </Link>
        </div>
        <div className={cn("flex items-center gap-1 px-2 pb-2", collapsed && !isMobile ? "justify-center" : "")}>
          <button
            type="button"
            onClick={() => setLogoutOpen(true)}
            title="Log out"
            className="flex h-9 w-9 items-center justify-center border border-[var(--border)] text-[var(--fg-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--danger)] transition-colors"
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
              <Link to={allItems[0]?.to ?? "/"} className="hover:text-[var(--fg)] transition-colors">
                {portalLabel}
              </Link>
              {activeItem && (
                <>
                  <Icon.ChevronRight className="h-3 w-3" />
                  <span className="font-medium text-[var(--fg)]">
                    {activeItem.label}
                  </span>
                </>
              )}
              {!activeItem && location.pathname.startsWith("/teacher/settings") && (
                <>
                  <Icon.ChevronRight className="h-3 w-3" />
                  <span className="font-medium text-[var(--fg)]">Settings</span>
                </>
              )}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { setNotifPanelOpen(true); setUnreadCount(0); }}
              aria-label="Notifications"
              className="relative flex h-9 w-9 items-center justify-center border border-[var(--border)] bg-[var(--surface)] text-[var(--fg-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--fg)] transition-colors"
            >
              <Icon.Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <>
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--danger)] px-1 text-[10px] font-bold text-white animate-pulse">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                </>
              )}
            </button>
            <ThemeToggle />
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>

      <NotificationPanel open={notifPanelOpen} onClose={() => setNotifPanelOpen(false)} />

      <Toaster />

      <Modal
        open={logoutOpen}
        onClose={() => setLogoutOpen(false)}
        title="Log out"
        description="Are you sure you want to log out?"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setLogoutOpen(false)}>Cancel</Button>
            <Button variant="danger" onClick={confirmLogout}>Log out</Button>
          </div>
        }
      >
        <span />
      </Modal>
    </div>
  );
}