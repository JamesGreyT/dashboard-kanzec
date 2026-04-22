import { ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
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
      className="fixed inset-0 z-50 bg-ink/30 backdrop-blur-drawer"
      onClick={onClose}
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        className="absolute right-0 top-0 bottom-0 bg-card flex flex-col animate-enter-up shadow-popover"
        style={{ width, maxWidth: "92vw" }}
      >
        <div className="h-14 px-4 md:px-7 border-b border-rule flex items-center justify-between gap-4">
          <div className="serif-italic text-[16px] text-ink shrink-0">{title}</div>
          {pk && (
            <div className="mono text-mono-sm text-ink-3 truncate tabular-nums">
              {pk}
            </div>
          )}
          <button
            onClick={onClose}
            className="text-ink-3 hover:text-mark serif text-[22px] leading-none shrink-0 transition-colors"
            aria-label={t("common.close")}
            title={t("common.close_hint")}
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4 md:p-7">{children}</div>
        {footer && (
          <div className="px-4 md:px-7 py-4 border-t border-rule">{footer}</div>
        )}
      </aside>
    </div>,
    document.body,
  );
}
