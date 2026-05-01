import { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent
        style={{ maxWidth: Math.min(width, typeof window !== "undefined" ? window.innerWidth * 0.92 : width) }}
        className="sm:max-w-[var(--modal-width)] rounded-2xl shadow-cardlg border-line"
      >
        {title && (
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-semibold tracking-[-0.02em] text-ink">{title}</DialogTitle>
          </DialogHeader>
        )}
        {children}
      </DialogContent>
    </Dialog>
  );
}
