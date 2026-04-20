import { cn } from "../../lib/cn";

const PALETTES = [
  ["oklch(92% 0.04 262)", "oklch(38% 0.12 262)"],
  ["oklch(92% 0.04 302)", "oklch(40% 0.14 302)"],
  ["oklch(92% 0.04 155)", "oklch(38% 0.12 155)"],
  ["oklch(92% 0.05 30)", "oklch(42% 0.15 30)"],
  ["oklch(92% 0.05 60)", "oklch(42% 0.14 60)"],
  ["oklch(92% 0.04 220)", "oklch(38% 0.12 220)"],
];

function hashToIndex(input: string, mod: number) {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) | 0;
  return Math.abs(h) % mod;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}) {
  const [bg, fg] = PALETTES[hashToIndex(name || "?", PALETTES.length)];
  const dims: Record<string, string> = {
    xs: "h-6 w-6 text-[10px]",
    sm: "h-8 w-8 text-xs",
    md: "h-9 w-9 text-xs",
    lg: "h-11 w-11 text-sm",
  };
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold tracking-wide",
        dims[size],
        className,
      )}
      style={{ background: bg, color: fg }}
    >
      {initials(name || "?")}
    </span>
  );
}
