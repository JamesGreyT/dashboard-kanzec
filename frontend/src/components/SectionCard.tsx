import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, type LucideIcon } from "lucide-react";

/**
 * Clickable summary tile. The whole card is a `<Link>` so the click
 * target is the full surface; the chevron is decorative. Each tile
 * owns its own loading / error state independently.
 */
export default function SectionCard({
  to,
  icon: Icon,
  title,
  subtitle,
  children,
  loading,
  error,
}: {
  to: string;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  children: ReactNode;
  loading?: boolean;
  error?: boolean;
}) {
  return (
    <Link
      to={to}
      aria-label={`${title} — open`}
      className={
        "group flex flex-col gap-3 min-w-0 bg-card border border-line rounded-2xl shadow-card p-6 " +
        "transition-shadow hover:shadow-cardlg outline-none focus-visible:ring-2 focus-visible:ring-mint focus-visible:ring-offset-2"
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Icon className="h-4 w-4 text-ink3 shrink-0" aria-hidden />
          <div className="min-w-0">
            <div className="font-display text-[20px] md:text-[22px] font-semibold tracking-[-0.02em] leading-tight text-ink truncate">
              {title}
            </div>
            <div className="text-[12px] text-ink3 mt-0.5 truncate">
              {subtitle}
            </div>
          </div>
        </div>
        <ArrowUpRight
          className="h-4 w-4 text-ink4 group-hover:text-ink transition-colors shrink-0"
          aria-hidden
        />
      </div>
      <div className="min-h-[80px]">
        {loading ? (
          <SkeletonRows />
        ) : error ? (
          <div className="text-[12px] text-coraldk italic">Failed to load.</div>
        ) : (
          children
        )}
      </div>
    </Link>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-2">
      <div className="h-7 w-2/3 bg-line rounded animate-pulsemint" />
      <div className="h-4 w-1/2 bg-line rounded animate-pulsemint" style={{ animationDelay: "150ms" }} />
      <div className="h-4 w-3/5 bg-line rounded animate-pulsemint" style={{ animationDelay: "300ms" }} />
    </div>
  );
}
