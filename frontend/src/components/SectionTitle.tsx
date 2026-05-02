import type { ReactNode } from 'react'

interface Props {
  label: string
  action?: ReactNode
  className?: string
}

/**
 * Uses the existing .section-title CSS rule (uppercase 11px tracked label
 * with a fade-line that runs to the right edge). Optional `action` slot
 * lives on the right side, replacing the trailing portion of the rule.
 */
export default function SectionTitle({ label, action, className }: Props) {
  if (!action) {
    return (
      <div className={className}>
        <span className="section-title">{label}</span>
      </div>
    )
  }
  return (
    <div className={`flex items-center gap-3 ${className ?? ''}`}>
      <span className="section-title flex-1">{label}</span>
      <div className="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0">
        {action}
      </div>
    </div>
  )
}
