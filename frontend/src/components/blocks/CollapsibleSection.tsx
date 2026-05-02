import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, Download } from 'lucide-react'

interface Props {
  title: string
  subtitle?: string
  defaultOpen?: boolean
  onExport?: () => void
  icon?: React.ElementType
  children: ReactNode
}

export default function CollapsibleSection({ title, subtitle, defaultOpen = true, onExport, icon: Icon, children }: Props) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className={`glass-card perf-section ${open ? 'is-open' : ''}`}>
      <div
        onClick={() => setOpen(!open)}
        className="perf-section-header"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(!open) } }}
      >
        {Icon && (
          <div className="section-icon">
            <Icon />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="text-sm sm:text-base font-semibold leading-tight">{title}</h3>
          {subtitle && <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 leading-tight">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          {onExport && open && (
            <span
              onClick={e => { e.stopPropagation(); onExport() }}
              className="p-1.5 rounded-lg hover:bg-accent/10 transition-colors text-muted-foreground hover:text-foreground"
              role="button"
              aria-label="Export"
            >
              <Download className="w-4 h-4" />
            </span>
          )}
          {open
            ? <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform" />
            : <ChevronRight className="w-4 h-4 text-muted-foreground transition-transform" />
          }
        </div>
      </div>
      {open && (
        <div className="px-4 sm:px-5 pb-4 sm:pb-5">
          {children}
        </div>
      )}
    </div>
  )
}
