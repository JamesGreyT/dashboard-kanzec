import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'

const PLEX_MONO = "'IBM Plex Mono', ui-monospace, monospace"
const DM_SANS = "'DM Sans', system-ui"

export type Crumb = {
  /** Visible label. */
  label: string
  /** If set, renders as a link. Last crumb usually leaves this undefined. */
  to?: string
}

/**
 * Editorial breadcrumb. Reads as a typographic path, not a chunky pill bar:
 * group label uppercase + tracked, page label sentence-case in DM Sans, last
 * crumb in Playfair-ish foreground weight. Separator is a small chevron in
 * `Plex Mono` to echo the typographic register of the rest of the chrome.
 */
export default function Breadcrumb({ items }: { items: Crumb[] }) {
  if (items.length === 0) return null
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground"
      style={{ fontFamily: PLEX_MONO }}
    >
      {items.map((c, i) => {
        const isLast = i === items.length - 1
        return (
          <span key={`${c.label}-${i}`} className="inline-flex items-center gap-1.5">
            {c.to && !isLast ? (
              <Link
                to={c.to}
                className="hover:text-[#9E7B2F] transition-colors truncate max-w-[16ch]"
              >
                {c.label}
              </Link>
            ) : (
              <span
                className={isLast ? 'text-foreground/80 normal-case tracking-normal truncate max-w-[28ch]' : 'truncate max-w-[16ch]'}
                style={isLast ? { fontFamily: DM_SANS } : undefined}
                aria-current={isLast ? 'page' : undefined}
              >
                {c.label}
              </span>
            )}
            {!isLast && (
              <ChevronRight size={10} aria-hidden className="text-muted-foreground/40 shrink-0" />
            )}
          </span>
        )
      })}
    </nav>
  )
}
