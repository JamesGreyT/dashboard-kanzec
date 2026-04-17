import { ReactNode } from "react";

export default function Card({
  children,
  accent,
  className = "",
  eyebrow,
  title,
}: {
  children: ReactNode;
  accent?: boolean;
  className?: string;
  eyebrow?: string;
  title?: string;
}) {
  return (
    <div
      className={[
        "bg-card rounded-card shadow-card p-7 relative",
        accent ? "pl-8" : "",
        className,
      ].join(" ")}
    >
      {accent && (
        <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-mark rounded-l-card" />
      )}
      {(eyebrow || title) && (
        <div className="mb-5">
          {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
          {title && (
            <div className="serif-italic text-heading-sm text-ink">{title}</div>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
