import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react'

interface Alert {
  id: string
  severity: 'critical' | 'warning' | 'info'
  type: string
  shop_name: string
  title: string
  description: string
  recommendation: string
  metric_value: number
  benchmark_value: number
}

const SEVERITY = {
  critical: { color: '#F87171', bg: 'rgba(248, 113, 113, 0.06)', border: '#F87171' },
  warning: { color: '#FBBF24', bg: 'rgba(251, 191, 36, 0.05)', border: '#FBBF24' },
  info: { color: '#60A5FA', bg: 'rgba(96, 165, 250, 0.05)', border: '#60A5FA' },
}

export default function AlertBanner({ alerts }: { alerts: Alert[] }) {
  const { t } = useTranslation()
  const [showAll, setShowAll] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  if (!alerts || alerts.length === 0) return null

  const criticalCount = alerts.filter(a => a.severity === 'critical').length
  const visible = showAll ? alerts : alerts.slice(0, 3)

  const toggle = (id: string) => {
    const next = new Set(expanded)
    next.has(id) ? next.delete(id) : next.add(id)
    setExpanded(next)
  }

  return (
    <div className="glass-card rounded-xl p-4 sm:p-5 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
               style={{ background: 'rgba(248, 113, 113, 0.1)' }}>
            <AlertTriangle className="w-4 h-4 text-red-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">{t('performance.alerts.title', 'Alerts & Issues')}</h3>
            <p className="text-[10px] text-muted-foreground">
              {criticalCount > 0 && <span className="text-red-400 font-medium">{criticalCount} critical</span>}
              {criticalCount > 0 && ' · '}
              {alerts.length} total
            </p>
          </div>
        </div>
        {alerts.length > 3 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-[11px] font-medium px-3 py-1 rounded-lg transition-colors"
            style={{ color: '#D4A843', background: 'rgba(212, 168, 67, 0.08)' }}
          >
            {showAll ? t('performance.alerts.showLess', 'Show less') : `${t('performance.alerts.showAll', 'Show all')} (${alerts.length})`}
          </button>
        )}
      </div>

      {/* Alert cards */}
      <div className="grid gap-2">
        {visible.map((a) => {
          const sev = SEVERITY[a.severity] || SEVERITY.info
          const isOpen = expanded.has(a.id)

          return (
            <div
              key={a.id}
              className="perf-alert"
              style={{
                borderLeftColor: sev.border,
                background: sev.bg,
              }}
              onClick={() => toggle(a.id)}
              role="button"
              tabIndex={0}
              aria-expanded={isOpen}
              onKeyDown={e => { if (e.key === 'Enter') toggle(a.id) }}
            >
              <div className="flex items-start gap-3">
                <div className="pulse-dot mt-1.5" style={{ background: sev.color }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider"
                          style={{ color: sev.color, background: `${sev.color}15` }}>
                      {a.severity}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/15 text-muted-foreground font-medium">
                      {a.type}
                    </span>
                  </div>
                  <p className="text-[13px] font-medium mt-1.5 leading-snug">{a.title}</p>

                  {isOpen && (
                    <div className="mt-2.5 space-y-2 border-t border-border/30 pt-2.5">
                      <p className="text-xs text-muted-foreground leading-relaxed">{a.description}</p>
                      <div className="flex items-start gap-1.5">
                        <span className="text-xs font-medium shrink-0" style={{ color: '#D4A843' }}>Recommendation:</span>
                        <p className="text-xs" style={{ color: '#D4A843' }}>{a.recommendation}</p>
                      </div>
                    </div>
                  )}
                </div>
                {isOpen
                  ? <ChevronDown className="w-3.5 h-3.5 mt-1 shrink-0 text-muted-foreground" />
                  : <ChevronRight className="w-3.5 h-3.5 mt-1 shrink-0 text-muted-foreground" />
                }
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
