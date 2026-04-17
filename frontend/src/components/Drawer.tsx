import { ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";

export default function Drawer({
  open,
  onClose,
  children,
  title,
  pk,
  width = 560,
  onPrev,
  onNext,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Small-caps eyebrow shown top-left. */
  title?: string;
  /** Mono PK preview shown top-center (e.g. "240 568 035"). */
  pk?: string;
  width?: number;
  /** If provided, bind ← / → keys to call these while the drawer is open. */
  onPrev?: () => void;
  onNext?: () => void;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft" && onPrev) {
        e.preventDefault();
        onPrev();
      } else if (e.key === "ArrowRight" && onNext) {
        e.preventDefault();
        onNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, onPrev, onNext]);

  if (!open) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-50"
      style={{ background: "rgba(26,23,19,0.18)" }}
      onClick={onClose}
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        className="absolute right-0 top-0 bottom-0 bg-card flex flex-col animate-enter-up"
        style={{ width, maxWidth: "92vw" }}
      >
        <div className="h-14 px-7 border-b border-rule flex items-center justify-between gap-4">
          <div className="eyebrow shrink-0">{title}</div>
          {pk && (
            <div className="mono text-mono-sm text-ink-3 truncate tabular-nums">
              {pk}
            </div>
          )}
          <button
            onClick={onClose}
            className="text-ink-3 hover:text-mark serif text-[18px] leading-none shrink-0"
            aria-label="Close"
            title="Close — esc"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-auto p-7">{children}</div>
        {footer && (
          <div className="px-7 py-4 border-t border-rule">{footer}</div>
        )}
      </aside>
    </div>,
    document.body,
  );
}
