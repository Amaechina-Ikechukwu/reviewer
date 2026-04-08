import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type ToastItem = {
  id: number;
  message: string;
  type: "success" | "error" | "info";
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

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const remove = useCallback((id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    // Mark as leaving so CSS exit animation plays
    setItems((prev) => prev.map((t) => t.id === id ? { ...t, leaving: true } : t));
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 250);
  }, []);

  const add = useCallback((item: Omit<ToastItem, "id" | "leaving">) => {
    const id = ++counter;
    setItems((prev) => [...prev, { ...item, id, leaving: false }]);
    timers.current.set(id, setTimeout(() => remove(id), 3500));
  }, [remove]);

  useEffect(() => {
    globalAdd = add;
    return () => { globalAdd = null; };
  }, [add]);

  if (items.length === 0) return null;

  return createPortal(
    <div className="toaster">
      {items.map((item) => (
        <div
          key={item.id}
          className={`toast toast-${item.type}${item.leaving ? " toast-leaving" : ""}`}
          onClick={() => remove(item.id)}
        >
          <span className="toast-dot" />
          <span>{item.message}</span>
        </div>
      ))}
    </div>,
    document.body,
  );
}
