import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

export type Role = "admin" | "operator" | "viewer";

const PILL: Record<Role, string> = {
  admin: "bg-good-bg text-good",
  operator: "bg-warn-bg text-warn",
  viewer: "bg-quiet-bg text-quiet",
};

/**
 * Single pill showing the current role + a small ▾ caret. Click opens a
 * three-option dropdown (portal, viewport-fixed like the column filter).
 * Replaces the old always-visible tri-state segmented control — on narrow
 * tables the three buttons read as separate controls rather than one choice.
 */
export default function RolePicker({
  value,
  onChange,
  disabled,
}: {
  value: Role;
  onChange: (r: Role) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      if (!anchorRef.current || !popRef.current) return;
      const a = anchorRef.current.getBoundingClientRect();
      const p = popRef.current.getBoundingClientRect();
      const margin = 12;
      let left = a.left;
      if (left + p.width > window.innerWidth - margin)
        left = a.right - p.width;
      if (left < margin) left = margin;
      let top = a.bottom + 4;
      if (top + p.height > window.innerHeight - margin)
        top = Math.max(margin, a.top - p.height - 4);
      setPos({ top, left });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const tgt = e.target as Node;
      if (
        popRef.current?.contains(tgt) ||
        anchorRef.current?.contains(tgt)
      )
        return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const options: Role[] = ["viewer", "operator", "admin"];

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={[
          "inline-flex items-center gap-1.5 h-[24px] pl-2.5 pr-2 rounded-full text-caption font-medium transition-opacity",
          PILL[value],
          disabled ? "opacity-50 cursor-not-allowed" : "hover:opacity-90",
        ].join(" ")}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{t(`roles.${value}`)}</span>
        <span className="text-[9px] leading-none opacity-70">▾</span>
      </button>
      {open &&
        createPortal(
          <div
            ref={popRef}
            style={{
              position: "fixed",
              top: pos?.top ?? -9999,
              left: pos?.left ?? -9999,
              visibility: pos ? "visible" : "hidden",
            }}
            className="z-50 w-[180px] bg-card rounded-[10px] shadow-card border border-rule py-1 animate-enter-up"
          >
            {options.map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => {
                  onChange(o);
                  setOpen(false);
                }}
                className={[
                  "w-full text-left px-3 py-1.5 text-label flex items-center gap-3",
                  o === value
                    ? "bg-mark-bg text-mark"
                    : "text-ink-2 hover:bg-paper-2 hover:text-ink",
                ].join(" ")}
              >
                <span
                  className={`inline-flex h-[20px] px-2 rounded-full ${PILL[o]} text-caption font-medium items-center`}
                >
                  {t(`roles.${o}`)}
                </span>
                {o === value && (
                  <span className="ml-auto caption text-mark">•</span>
                )}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
