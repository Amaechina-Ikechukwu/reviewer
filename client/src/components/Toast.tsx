import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "../lib/cn";
import { Icon } from "./ui/Icons";

type ToastType = "success" | "error" | "info";

type ToastItem = {
  id: number;
  message: string;
  type: ToastType;
  leaving: boolean;
};

type ToastAPI = {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
};

let counter = 0;
let globalAdd: ((item: Omit<ToastItem, "id" | "leaving">) => void) | null = null;

export function toast(): ToastAPI {
  return {
    success: (message) => globalAdd?.({ message, type: "success" }),
    error: (message) => globalAdd?.({ message, type: "error" }),
    info: (message) => globalAdd?.({ message, type: "info" }),
  };
}

const styles: Record<ToastType, string> = {
  success: "border-[var(--success)]/30 bg-[var(--surface)] text-[var(--fg)]",
  error: "border-[var(--danger)]/30 bg-[var(--surface)] text-[var(--fg)]",
  info: "border-[var(--border)] bg-[var(--surface)] text-[var(--fg)]",
};

const iconFor: Record<ToastType, React.ReactNode> = {
  success: <Icon.Check className="h-4 w-4 text-[var(--success)]" />,
  error: <Icon.AlertTriangle className="h-4 w-4 text-[var(--danger)]" />,
  info: <Icon.Bell className="h-4 w-4 text-[var(--accent)]" />,
};

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const remove = useCallback((id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setItems((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 220);
  }, []);

  const add = useCallback(
    (item: Omit<ToastItem, "id" | "leaving">) => {
      const id = ++counter;
      setItems((prev) => [...prev, { ...item, id, leaving: false }]);
      timers.current.set(id, setTimeout(() => remove(id), 3800));
    },
    [remove],
  );

  useEffect(() => {
    globalAdd = add;
    return () => {
      globalAdd = null;
    };
  }, [add]);

  if (items.length === 0) return null;

  return createPortal(
    <div className="pointer-events-none fixed right-4 bottom-4 z-[1000] flex flex-col gap-2 sm:right-6 sm:bottom-6">
      {items.map((item) => (
        <div
          key={item.id}
          onClick={() => remove(item.id)}
          className={cn(
            "pointer-events-auto flex min-w-[260px] max-w-sm cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 shadow-[var(--shadow-lg)]",
            styles[item.type],
            item.leaving ? "animate-slide-out-right" : "animate-slide-in-right",
          )}
        >
          <span className="mt-0.5 shrink-0">{iconFor[item.type]}</span>
          <span className="text-sm leading-snug">{item.message}</span>
        </div>
      ))}
    </div>,
    document.body,
  );
}
