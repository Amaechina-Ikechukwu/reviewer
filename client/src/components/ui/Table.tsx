import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export function Table({ className, ...rest }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("responsive-table w-full text-sm", className)} {...rest} />
    </div>
  );
}

export function THead({ className, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("bg-[var(--surface-muted)]", className)} {...rest} />;
}

export function TBody({ className, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("divide-y divide-[var(--border)]", className)} {...rest} />;
}

export function TR({ className, ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("transition-colors hover:bg-[var(--surface-muted)]/60", className)} {...rest} />;
}

export function TH({ className, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-muted)]",
        className,
      )}
      {...rest}
    />
  );
}

type TDProps = TdHTMLAttributes<HTMLTableCellElement> & { label?: string };

export function TD({ className, label, ...rest }: TDProps) {
  return (
    <td
      data-label={label}
      className={cn("px-4 py-3 align-middle text-[var(--fg)]", className)}
      {...rest}
    />
  );
}

export function EmptyRow({ cols, children }: { cols: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={cols} className="px-4 py-10 text-center text-sm text-[var(--fg-muted)]">
        {children}
      </td>
    </tr>
  );
}
