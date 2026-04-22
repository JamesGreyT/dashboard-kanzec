import { ReactNode } from "react";

export default function Card({
  children,
  accent,
  className = "",
  eyebrow,
  title,
  interactive,
}: {
  children: ReactNode;
  accent?: boolean;
  className?: string;
  eyebrow?: string;
  title?: string;
  interactive?: boolean;
}) {
  const hasHeader = !!(eyebrow || title);
  return (
    <div
      className={[
        "bg-card rounded-card shadow-card p-5 md:p-7 relative",
        interactive ? "card-interactive" : "",
        className,
      ].join(" ")}
    >
      {accent && (
        // Top-left corner wedge — two 14px × 2px orange bars anchored into
        // the card radius. Replaces the old full-height 3px left accent bar;
        // subtler, still legible as "this card has emphasis".
        <>
          <span
            aria-hidden
            className="absolute top-0 left-0 w-[14px] h-[2px] bg-mark rounded-tl-card"
          />
          <span
            aria-hidden
            className="absolute top-0 left-0 w-[2px] h-[14px] bg-mark rounded-tl-card"
          />
        </>
      )}
      {hasHeader && (
        <>
          <div>
            {eyebrow && <div className="eyebrow-mono mb-2">{eyebrow}</div>}
            {title && (
              <div className="serif-italic text-heading-sm text-ink">{title}</div>
            )}
          </div>
          <div className="leader" />
        </>
      )}
      {children}
    </div>
  );
}
