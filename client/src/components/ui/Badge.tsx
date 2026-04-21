import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

type Tone = "neutral" | "accent" | "success" | "warn" | "danger" | "info";

type Props = HTMLAttributes<HTMLSpanElement> & {
  tone?: Tone;
  dot?: boolean;
};

const tones: Record<Tone, string> = {
  neutral: "bg-[var(--surface-muted)] text-[var(--fg-muted)] border border-[var(--border)]",
  accent: "bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent-soft)]",
  success: "bg-[var(--success-soft)] text-[var(--success)] border border-[var(--success-soft)]",
  warn: "bg-[var(--warn-soft)] text-[var(--warn)] border border-[var(--warn-soft)]",
  danger: "bg-[var(--danger-soft)] text-[var(--danger)] border border-[var(--danger-soft)]",
  info: "bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent-soft)]",
};

const dots: Record<Tone, string> = {
  neutral: "bg-[var(--fg-muted)]",
  accent: "bg-[var(--accent)]",
  success: "bg-[var(--success)]",
  warn: "bg-[var(--warn)]",
  danger: "bg-[var(--danger)]",
  info: "bg-[var(--accent)]",
};

export function Badge({ className, tone = "neutral", dot, children, ...rest }: Props) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap",
        tones[tone],
        className,
      )}
      {...rest}
    >
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", dots[tone])} />}
      {children}
    </span>
  );
}
