import type { ReactNode } from "react";
import { Icon } from "./ui/Icons";
import { Toaster } from "./Toast";

type Props = {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
};

export function AuthLayout({ eyebrow, title, description, children, footer }: Props) {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[var(--bg)] px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute left-1/2 top-0 h-64 w-[140%] -translate-x-1/2 rounded-[50%] bg-[var(--accent-soft)] opacity-60 blur-3xl" />
      </div>

      <div className="w-full max-w-md">
        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent)] text-[var(--accent-fg)] shadow-[var(--shadow-md)]">
            <Icon.Sparkles className="h-5 w-5" />
          </div>
          <div>
            {eyebrow && (
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-subtle)]">
                {eyebrow}
              </div>
            )}
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-[var(--fg)] sm:text-2xl">{title}</h1>
            {description && <p className="mt-2 text-sm text-[var(--fg-muted)]">{description}</p>}
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-md)] sm:p-7">
          {children}
        </div>

        {footer && <div className="mt-5 text-center text-xs text-[var(--fg-muted)]">{footer}</div>}
      </div>

      <Toaster />
    </div>
  );
}
