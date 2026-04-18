import { ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";

export default function Modal({
  open,
  onClose,
  children,
  title,
  width = 520,
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
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh]"
      style={{ background: "rgba(26,23,19,0.18)" }}
      onClick={onClose}
    >
      <div
        className="bg-card rounded-[16px] shadow-card p-6 md:p-10 animate-enter-up"
        style={{ width, maxWidth: "92vw" }}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <>
            <h2 className="serif-italic text-heading-sm text-ink">{title}</h2>
            <div className="leader" />
          </>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}
