import {
  Children,
  forwardRef,
  isValidElement,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/cn";

const fieldBase =
  "w-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--fg)] placeholder:text-[var(--fg-subtle)] transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/25";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, onWheel, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(fieldBase, "h-9", className)}
      {...rest}
      onWheel={(event) => {
        if (rest.type === "number") event.currentTarget.blur();
        onWheel?.(event);
      }}
    />
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, rows = 4, ...rest }, ref) {
    return <textarea ref={ref} rows={rows} className={cn(fieldBase, "resize-y min-h-[80px]", className)} {...rest} />;
  },
);

type SelectOption = { value: string; label: ReactNode; labelText: string; disabled?: boolean };

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange"> & {
  onChange?: (event: { target: { value: string; name?: string } }) => void;
  placeholder?: string;
};

function getLabelText(node: ReactNode): string {
  if (node == null || node === false) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(getLabelText).join("");
  if (isValidElement(node)) return getLabelText((node.props as any).children);
  return "";
}

function parseOptions(children: ReactNode): SelectOption[] {
  const out: SelectOption[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const props = child.props as any;
    if (child.type === "optgroup") {
      out.push(...parseOptions(props.children));
      return;
    }
    if (props && "value" in props) {
      out.push({
        value: String(props.value ?? ""),
        label: props.children,
        labelText: getLabelText(props.children),
        disabled: !!props.disabled,
      });
    }
  });
  return out;
}

export const Select = forwardRef<HTMLButtonElement, SelectProps>(function Select(
  { className, children, value, defaultValue, onChange, name, required, disabled, placeholder, id, ...rest },
  ref,
) {
  const options = useMemo(() => parseOptions(children), [children]);
  const [internalValue, setInternalValue] = useState<string>(
    String(value ?? defaultValue ?? options[0]?.value ?? ""),
  );
  const isControlled = value !== undefined;
  const current = isControlled ? String(value) : internalValue;

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<{ left: number; top: number; width: number; placement: "below" | "above" } | null>(null);
  useImperativeHandle(ref, () => buttonRef.current as HTMLButtonElement);

  const selected = options.find((o) => o.value === current);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (buttonRef.current?.contains(t)) return;
      if (listRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const updatePosition = () => {
      const rect = buttonRef.current!.getBoundingClientRect();
      const menuHeight = Math.min(288, options.length * 36 + 8);
      const spaceBelow = window.innerHeight - rect.bottom;
      const placement: "below" | "above" = spaceBelow < menuHeight + 8 && rect.top > menuHeight + 8 ? "above" : "below";
      setMenuStyle({
        left: rect.left,
        top: placement === "below" ? rect.bottom + 4 : rect.top - menuHeight - 4,
        width: rect.width,
        placement,
      });
    };
    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open, options.length]);

  useEffect(() => {
    if (!open) return;
    const idx = options.findIndex((o) => o.value === current);
    setActiveIndex(idx >= 0 ? idx : 0);
  }, [open]);

  function commit(next: string) {
    if (!isControlled) setInternalValue(next);
    onChange?.({ target: { value: next, name } });
    setOpen(false);
    buttonRef.current?.focus();
  }

  function onTriggerKey(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(true);
    }
  }

  function onListKey(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => {
        let next = i;
        for (let step = 0; step < options.length; step++) {
          next = (next + 1) % options.length;
          if (!options[next].disabled) return next;
        }
        return i;
      });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => {
        let next = i;
        for (let step = 0; step < options.length; step++) {
          next = (next - 1 + options.length) % options.length;
          if (!options[next].disabled) return next;
        }
        return i;
      });
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = options[activeIndex];
      if (opt && !opt.disabled) commit(opt.value);
    } else if (e.key === "Home") {
      e.preventDefault();
      const idx = options.findIndex((o) => !o.disabled);
      if (idx >= 0) setActiveIndex(idx);
    } else if (e.key === "End") {
      e.preventDefault();
      for (let i = options.length - 1; i >= 0; i--) if (!options[i].disabled) { setActiveIndex(i); break; }
    }
  }

  const displayLabel = selected?.label ?? (placeholder ? <span className="text-[var(--fg-subtle)]">{placeholder}</span> : "");

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        id={id}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-required={required}
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={onTriggerKey}
        className={cn(
          fieldBase,
          "h-9 flex items-center justify-between gap-2 text-left",
          open && "border-[var(--accent)] ring-2 ring-[var(--accent)]/25",
          className,
        )}
        {...(rest as any)}
      >
        <span className="min-w-0 truncate">{displayLabel}</span>
        <svg
          className={cn("h-3.5 w-3.5 shrink-0 text-[var(--fg-muted)] transition-transform", open && "rotate-180")}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {/* Hidden native field keeps form semantics + required validation */}
      <input type="hidden" name={name} value={current} required={required} />
      {open && menuStyle && createPortal(
        <div
          ref={listRef}
          role="listbox"
          tabIndex={-1}
          onKeyDown={onListKey}
          autoFocus
          style={{ position: "fixed", left: menuStyle.left, top: menuStyle.top, width: menuStyle.width, zIndex: 60 }}
          className="overflow-auto rounded-md border border-[var(--border)] bg-[var(--surface)] py-1 text-sm text-[var(--fg)] shadow-lg outline-none max-h-72"
        >
          {options.length === 0 && (
            <div className="px-3 py-2 text-xs text-[var(--fg-muted)]">No options</div>
          )}
          {options.map((opt, i) => {
            const isSelected = opt.value === current;
            const isActive = i === activeIndex;
            return (
              <div
                key={`${opt.value}-${i}`}
                role="option"
                aria-selected={isSelected}
                aria-disabled={opt.disabled || undefined}
                onMouseEnter={() => !opt.disabled && setActiveIndex(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => !opt.disabled && commit(opt.value)}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm",
                  opt.disabled && "cursor-not-allowed opacity-50",
                  isActive && !opt.disabled && "bg-[var(--accent-soft)]",
                  isSelected && "font-medium text-[var(--accent)]",
                )}
              >
                <span className="min-w-0 truncate">{opt.label || <span className="text-[var(--fg-subtle)]">—</span>}</span>
                {isSelected && (
                  <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
});

export function Label({ className, children, required, ...rest }: React.LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean }) {
  const childArray = Children.toArray(children);
  const textChildren = childArray.filter((c) => !isValidElement(c));
  const elementChildren = childArray.filter((c) => isValidElement(c));

  return (
    <label className={cn("flex flex-col gap-1.5 text-xs font-medium text-[var(--fg-muted)]", className)} {...rest}>
      <span className="flex items-center gap-1">
        {textChildren}
        {required && <span className="text-[var(--danger)]">*</span>}
      </span>
      {elementChildren}
    </label>
  );
}
