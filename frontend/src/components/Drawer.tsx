import { ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";

export default function Drawer({
  open,
  onClose,
  children,
  title,
  width = 560,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

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
        <div className="h-14 px-7 border-b border-rule flex items-center justify-between">
          {title && <div className="eyebrow">{title}</div>}
          <button
            onClick={onClose}
            className="text-ink-3 hover:text-mark text-body"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-auto p-7">{children}</div>
      </aside>
    </div>,
    document.body,
  );
}
