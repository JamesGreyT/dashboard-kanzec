import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, type LucideIcon } from "lucide-react";

/**
 * Clickable summary tile for the Boshqaruv panel.
 *
 * The whole card is a `<Link>` so the click target is the full surface;
 * the chevron in the corner is decorative and signals "open". Each tile
 * owns its own loading / error state independently — a slow endpoint on
 * one tile must not blank out its siblings.
 *
 * Visual language: bigger sibling of MetricCard. Picks up the Linen
 * theme via `bg-card`, `border`, `text-foreground` / `muted-foreground`.
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
        "group flex flex-col gap-3 min-w-0 bg-card border rounded-2xl shadow-soft p-5 " +
        "transition-shadow hover:shadow-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
          <div className="min-w-0">
            <div className="font-display text-[20px] md:text-[22px] font-medium leading-tight text-foreground truncate">
              {title}
            </div>
            <div className="text-[12px] text-muted-foreground italic mt-0.5 truncate">
              {subtitle}
            </div>
          </div>
        </div>
        <ArrowUpRight
          className="h-4 w-4 text-muted-foreground/60 group-hover:text-foreground transition-colors shrink-0"
          aria-hidden
        />
      </div>
      <div className="min-h-[80px]">
        {loading ? (
          <SkeletonRows />
        ) : error ? (
          <div className="text-[12px] text-red-700 dark:text-red-400 italic">
            {/* The page-level i18n is responsible for the actual text;
             *  fallback keeps the component standalone-renderable. */}
            Failed to load.
          </div>
        ) : (
          children
        )}
      </div>
    </Link>
  );
}

function SkeletonRows() {
  // Lightweight shimmer — three rows of pulsing bars. Avoids a separate
  // skeleton component dependency for one location.
  return (
    <div className="space-y-2 animate-pulse">
      <div className="h-7 w-2/3 bg-muted/50 rounded" />
      <div className="h-4 w-1/2 bg-muted/40 rounded" />
      <div className="h-4 w-3/5 bg-muted/30 rounded" />
    </div>
  );
}
