import { ReactNode, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

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
  title?: string;
  pk?: string;
  width?: number;
  onPrev?: () => void;
  onNext?: () => void;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && onPrev) {
        e.preventDefault();
        onPrev();
      } else if (e.key === "ArrowRight" && onNext) {
        e.preventDefault();
        onNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onPrev, onNext]);

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent
        side="right"
        className="flex flex-col p-0 sm:max-w-none"
        style={{ width: `min(${width}px, 92vw)` }}
      >
        <SheetHeader className="px-4 md:px-7 h-14 border-b flex-row items-center justify-between space-y-0">
          <SheetTitle className="text-base">{title}</SheetTitle>
          {pk && (
            <div className="font-mono text-xs text-muted-foreground tabular-nums truncate">
              {pk}
            </div>
          )}
        </SheetHeader>
        <div className="flex-1 overflow-auto p-4 md:p-7">{children}</div>
        {footer && <div className="px-4 md:px-7 py-4 border-t">{footer}</div>}
      </SheetContent>
    </Sheet>
  );
}
