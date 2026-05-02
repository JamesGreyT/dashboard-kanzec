import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Activity, Database, Save, X, AlertTriangle, ChevronRight,
} from 'lucide-react'

import PageHeader from '@/components/PageHeader'
import {
  useOpsReports,
  useOpsProgress,
  useOpsQueue,
  useEnqueueBackfill,
  type OpsReport,
} from '@/api/hooks'
import { getAccessToken } from '@/api/tokenStore'
import { formatNumber, formatShortDate } from '@/lib/format'
import { cn } from '@/lib/utils'

const PLAYFAIR = "'Playfair Display', Georgia, serif"
const DM_SANS = "'DM Sans', system-ui"
const PLEX_MONO = "'IBM Plex Mono', ui-monospace, monospace"

type Tab = 'progress' | 'queue' | 'logs'

export default function Ops() {
  const { t, i18n } = useTranslation()
  const reportsQ = useOpsReports()
  const reports = reportsQ.data ?? []

  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('progress')
  const [backfillOpen, setBackfillOpen] = useState(false)

  // Derive the effective selection: user choice if any, else first report.
  // Avoids the setState-in-effect "auto-select" anti-pattern.
  const effectiveKey = selectedKey ?? (reports.length > 0 ? reports[0].key : null)
  const selected = reports.find((r) => r.key === effectiveKey)

  return (
    <div>
      <PageHeader />

      <header className="mb-6">
        <span className="section-title">{t('admin.section')}</span>
        <h1
          className="text-3xl lg:text-4xl font-semibold leading-none tracking-tight mt-3"
          style={{ fontFamily: PLAYFAIR }}
        >
          {t('admin.ops.title')}
        </h1>
        <p className="text-xs text-muted-foreground italic mt-2" style={{ fontFamily: DM_SANS }}>
          {t('admin.ops.subtitle')}
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 animate-fade-up animate-fade-up-delay-2">
        {/* Reports list — left rail */}
        <aside className="lg:col-span-3">
          <span className="section-title mb-3">{t('admin.ops.reports')}</span>
          {reportsQ.isLoading && reports.length === 0 ? (
            <div className="space-y-2 mt-3">
              {Array.from({ length: 5 }).map((_, i) => <div key={i} className="shimmer-skeleton h-12 w-full" />)}
            </div>
          ) : (
            <ul className="mt-3 space-y-1">
              {reports.map((r) => (
                <li key={r.key}>
                  <button
                    type="button"
                    onClick={() => setSelectedKey(r.key)}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-200',
                      effectiveKey === r.key ? 'nav-active' : 'text-muted-foreground hover:text-foreground hover:bg-accent/60',
                    )}
                    style={{ fontFamily: DM_SANS }}
                  >
                    <StatusDot active={r.systemd_active} />
                    <span className="flex-1 text-left truncate">{r.key}</span>
                    {r.backfill_queue_len > 0 && (
                      <span className="action-badge urgent text-[9px] py-0">{r.backfill_queue_len}</span>
                    )}
                    <ChevronRight size={11} className="text-muted-foreground/40" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* Selected report — right pane */}
        <section className="lg:col-span-9">
          {selected ? (
            <>
              <SelectedReportHeader report={selected} lang={i18n.language} onBackfill={() => setBackfillOpen(true)} />

              {/* Tabs */}
              <div className="flex items-baseline gap-1 border-b border-border/60 mt-4">
                <TabPill active={tab === 'progress'} onClick={() => setTab('progress')}>
                  {t('admin.ops.tabs.progress')}
                </TabPill>
                <TabPill active={tab === 'queue'} onClick={() => setTab('queue')}>
                  {t('admin.ops.tabs.queue')}
                  {selected.backfill_queue_len > 0 && (
                    <span className="ml-1.5 text-[10px] text-[#FB923C]">({selected.backfill_queue_len})</span>
                  )}
                </TabPill>
                <TabPill active={tab === 'logs'} onClick={() => setTab('logs')}>
                  {t('admin.ops.tabs.logs')}
                </TabPill>
              </div>

              <div className="mt-4">
                {tab === 'progress' && <ProgressTab reportKey={selected.key} lang={i18n.language} />}
                {tab === 'queue' && <QueueTab reportKey={selected.key} lang={i18n.language} />}
                {tab === 'logs' && <LogsTab reportKey={selected.key} />}
              </div>

              {backfillOpen && (
                <BackfillModal reportKey={selected.key} onClose={() => setBackfillOpen(false)} />
              )}
            </>
          ) : (
            <p className="text-sm italic text-muted-foreground" style={{ fontFamily: PLAYFAIR }}>
              {t('admin.ops.selectReport')}
            </p>
          )}
        </section>
      </div>
    </div>
  )
}

function StatusDot({ active }: { active: string }) {
  const tone = active === 'active' ? 'bg-[#34D399]' : active === 'failed' ? 'bg-[#F87171]' : 'bg-[#FB923C]'
  return <span aria-hidden className={cn('w-2 h-2 rounded-full shrink-0', tone)} />
}

function TabPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative inline-flex items-center gap-2 px-3 py-2 text-sm transition-colors',
        active ? 'text-[#9E7B2F] font-semibold' : 'text-muted-foreground hover:text-foreground',
      )}
      style={{ fontFamily: DM_SANS }}
    >
      {children}
      {active && <span aria-hidden className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#D4A843]" />}
    </button>
  )
}

function SelectedReportHeader({ report, lang, onBackfill }: { report: OpsReport; lang: string; onBackfill: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="glass-card rounded-xl p-5">
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-semibold leading-none" style={{ fontFamily: PLAYFAIR }}>
            {report.key}
          </h2>
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mt-1" style={{ fontFamily: PLEX_MONO }}>
            <StatusDot active={report.systemd_active} /> <span className="ml-1.5">systemd · {report.systemd_active}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onBackfill}
          className="px-3 py-1.5 rounded-lg bg-[#D4A843] hover:bg-[#C49833] text-black text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
          style={{ fontFamily: DM_SANS }}
        >
          <Database size={11} />
          {t('admin.ops.backfill')}
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-5 text-xs" style={{ fontFamily: DM_SANS }}>
        <Stat label={t('admin.ops.lastRecent')} primary={report.last_recent_at ? formatShortDate(report.last_recent_at, lang) : '—'} caption={report.last_recent_label ?? ''} />
        <Stat label={t('admin.ops.recentRows')} primary={report.last_recent_rows != null ? formatNumber(report.last_recent_rows) : '—'} caption={report.last_recent_ms ? `${report.last_recent_ms} ms` : ''} />
        <Stat label={t('admin.ops.lastDeep')} primary={report.last_deep_at ? formatShortDate(report.last_deep_at, lang) : '—'} caption={report.last_deep_label ?? ''} />
        <Stat label={t('admin.ops.deepRows')} primary={report.last_deep_rows != null ? formatNumber(report.last_deep_rows) : '—'} caption="" />
      </div>
      {report.last_error && (
        <div className="mt-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-xs flex items-start gap-2" style={{ fontFamily: PLEX_MONO }}>
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-medium normal-case">{t('admin.ops.lastError')} {report.last_error_at ? `· ${formatShortDate(report.last_error_at, lang)}` : ''}</p>
            <p className="mt-1 italic normal-case break-words">{report.last_error}</p>
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ label, primary, caption }: { label: string; primary: string; caption: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-1" style={{ fontFamily: DM_SANS }}>
        {label}
      </p>
      <p className="text-base font-medium tabular-nums" style={{ fontFamily: PLAYFAIR }}>
        {primary}
      </p>
      {caption && (
        <p className="text-[10px] text-muted-foreground/70 mt-0.5" style={{ fontFamily: PLEX_MONO }}>
          {caption}
        </p>
      )}
    </div>
  )
}

// ── Progress tab ─────────────────────────────────────────────────────────

function ProgressTab({ reportKey, lang }: { reportKey: string; lang: string }) {
  const { t } = useTranslation()
  const q = useOpsProgress(reportKey, 50)
  const rows = q.data ?? []
  return (
    <div className="overflow-x-auto -mx-2">
      <table className="premium-table w-full text-sm" style={{ fontFamily: DM_SANS }}>
        <thead>
          <tr>
            <Th label={t('admin.ops.cols.range')} />
            <Th label={t('admin.ops.cols.status')} />
            <Th label={t('admin.ops.cols.rows')} align="right" />
            <Th label={t('admin.ops.cols.duration')} align="right" />
            <Th label={t('admin.ops.cols.startedAt')} />
          </tr>
        </thead>
        <tbody>
          {q.isLoading && !q.data ? (
            Array.from({ length: 6 }).map((_, i) => (
              <tr key={i}>{Array.from({ length: 5 }).map((__, j) => <td key={j} className="px-3 py-2.5 border-b border-border/40"><div className="shimmer-skeleton h-3 w-full" /></td>)}</tr>
            ))
          ) : rows.length === 0 ? (
            <tr><td colSpan={5} className="py-12 text-center text-sm italic text-muted-foreground" style={{ fontFamily: PLAYFAIR }}>{t('admin.ops.noProgress')}</td></tr>
          ) : (
            rows.map((row, i) => (
              <tr key={i}>
                <td className="px-3 py-2.5 border-b border-border/40 text-xs" style={{ fontFamily: PLEX_MONO }}>{row.range_label}</td>
                <td className="px-3 py-2.5 border-b border-border/40">
                  <span className={`action-badge ${statusVariant(row.status)}`}>{row.status}</span>
                </td>
                <td className="px-3 py-2.5 border-b border-border/40 text-right tabular-nums" style={{ fontFamily: PLAYFAIR }}>{formatNumber(row.rows)}</td>
                <td className="px-3 py-2.5 border-b border-border/40 text-right text-xs text-muted-foreground tabular-nums" style={{ fontFamily: PLEX_MONO }}>{(row.duration_ms / 1000).toFixed(1)}s</td>
                <td className="px-3 py-2.5 border-b border-border/40 text-xs text-muted-foreground" style={{ fontFamily: PLEX_MONO }}>{formatShortDate(row.started_at, lang)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

function statusVariant(s: string): 'monitor' | 'plan' | 'markdown' | 'urgent' | 'critical' {
  if (s === 'complete') return 'monitor'
  if (s === 'partial') return 'markdown'
  if (s === 'empty') return 'plan'
  if (s === 'error') return 'critical'
  return 'urgent'
}

// ── Queue tab ────────────────────────────────────────────────────────────

function QueueTab({ reportKey, lang }: { reportKey: string; lang: string }) {
  const { t } = useTranslation()
  const q = useOpsQueue(reportKey)
  const rows = q.data ?? []
  if (q.isLoading && !q.data) {
    return <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="shimmer-skeleton h-10 w-full" />)}</div>
  }
  if (rows.length === 0) {
    return (
      <div className="py-12 text-center">
        <Activity size={28} className="text-[#34D399] mx-auto mb-3" />
        <p className="text-base italic text-muted-foreground" style={{ fontFamily: PLAYFAIR }}>
          {t('admin.ops.queueEmpty')}
        </p>
      </div>
    )
  }
  return (
    <ul className="space-y-2" style={{ fontFamily: DM_SANS }}>
      {rows.map((row, i) => (
        <li key={i} className="glass-card rounded-lg p-3 flex items-baseline justify-between gap-3">
          <div>
            <p className="text-sm" style={{ fontFamily: PLEX_MONO }}>
              {row.range_from} → {row.range_to}
            </p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-[0.14em] mt-1">
              {row.chunk} · {formatShortDate(row.enqueued_at, lang)}
            </p>
          </div>
          {row.status && <span className="action-badge plan">{row.status}</span>}
        </li>
      ))}
    </ul>
  )
}

// ── Logs tab — use SSE-style polling via systemd journal endpoint ────────

function LogsTab({ reportKey }: { reportKey: string }) {
  const { t } = useTranslation()
  const [lines, setLines] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    // Reset stream state when the key changes — these setStates happen once
    // per `reportKey`, not per render, so they don't cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setLines([])
    setErr(null)

    // Use fetch with SSE parsing — the backend streams `text/event-stream`.
    const controller = new AbortController()
    const token = getAccessToken() ?? ''
    fetch(`/api/ops/reports/${reportKey}/logs?lines=500`, {
      signal: controller.signal,
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok || !res.body) {
          setErr(t('admin.ops.logsFailed'))
          setLoading(false)
          return
        }
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buf = ''
        while (!cancelled) {
          const { value, done } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          const events = buf.split('\n\n')
          buf = events.pop() ?? ''
          const newLines = events
            .map((ev) => ev.split('\n').filter((l) => l.startsWith('data: ')).map((l) => l.slice(6)).join('\n'))
            .filter(Boolean)
          if (newLines.length > 0) {
            setLines((prev) => [...prev, ...newLines].slice(-1000))
          }
          setLoading(false)
        }
      })
      .catch((e) => {
        if (!cancelled && (e as Error).name !== 'AbortError') setErr((e as Error).message)
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [reportKey, t])

  if (err) {
    return (
      <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-xs">
        <AlertTriangle size={12} className="inline mr-1.5" />
        {err}
      </div>
    )
  }

  return (
    <div className="glass-card rounded-xl p-3 max-h-96 overflow-y-auto">
      {loading && lines.length === 0 ? (
        <div className="space-y-1">
          {Array.from({ length: 12 }).map((_, i) => <div key={i} className="shimmer-skeleton h-3 w-full" />)}
        </div>
      ) : lines.length === 0 ? (
        <p className="text-sm italic text-muted-foreground text-center py-6" style={{ fontFamily: PLAYFAIR }}>
          {t('admin.ops.logsEmpty')}
        </p>
      ) : (
        <pre className="text-[11px] leading-tight whitespace-pre-wrap" style={{ fontFamily: PLEX_MONO }}>
          {lines.join('\n')}
        </pre>
      )}
    </div>
  )
}

// ── Backfill modal ───────────────────────────────────────────────────────

function BackfillModal({ reportKey, onClose }: { reportKey: string; onClose: () => void }) {
  const { t } = useTranslation()
  const mut = useEnqueueBackfill()
  const today = new Date().toISOString().slice(0, 10)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState(today)
  const [chunk, setChunk] = useState<'year' | 'month' | 'week'>('month')
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!from || !to) { setError(t('admin.ops.rangeRequired')); return }
    if (from > to) { setError(t('admin.ops.rangeInvalid')); return }
    if (!confirm) { setConfirm(true); return }
    try {
      await mut.mutateAsync({ key: reportKey, from, to, chunk })
      onClose()
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
      setError(detail ?? t('admin.ops.backfillFailed'))
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/30" onClick={onClose} aria-hidden />
      <div className="fixed left-1/2 top-1/2 z-40 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-card border border-border rounded-xl p-6 lg:p-7 shadow-xl animate-fade-up" role="dialog" aria-modal="true">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-2xl font-semibold leading-none" style={{ fontFamily: PLAYFAIR }}>
            {t('admin.ops.backfill')} · <span className="text-muted-foreground" style={{ fontFamily: PLEX_MONO }}>{reportKey}</span>
          </h2>
          <button type="button" onClick={onClose} className="p-1 -m-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors" aria-label={t('common.close')}>
            <X size={16} />
          </button>
        </div>

        <p className="text-xs italic text-muted-foreground mb-4" style={{ fontFamily: DM_SANS }}>
          {t('admin.ops.backfillWarning')}
        </p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('data.filters.from')}>
              <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setConfirm(false) }} required className="inv-filter w-full" />
            </Field>
            <Field label={t('data.filters.to')}>
              <input type="date" value={to} max={today} onChange={(e) => { setTo(e.target.value); setConfirm(false) }} required className="inv-filter w-full" />
            </Field>
          </div>
          <Field label={t('admin.ops.chunk')}>
            <select value={chunk} onChange={(e) => { setChunk(e.target.value as typeof chunk); setConfirm(false) }} className="inv-filter w-full">
              <option value="year">{t('admin.ops.chunks.year')}</option>
              <option value="month">{t('admin.ops.chunks.month')}</option>
              <option value="week">{t('admin.ops.chunks.week')}</option>
            </select>
          </Field>

          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-xs flex items-start gap-2">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {confirm && !error && (
            <div className="px-3 py-2 rounded-lg bg-[#FBBF24]/10 border border-[#FBBF24]/30 text-[#9E7B2F] text-xs">
              {t('admin.ops.backfillConfirm', { from, to, chunk: t(`admin.ops.chunks.${chunk}`) })}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="text-xs px-3 py-1.5 text-muted-foreground hover:text-foreground transition-colors">
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={mut.isPending}
              className={cn(
                'text-xs px-3.5 py-1.5 rounded font-semibold inline-flex items-center gap-1.5 transition-colors',
                confirm ? 'bg-[#FB923C] hover:bg-[#E0822E] text-white' : 'bg-[#D4A843] hover:bg-[#C49833] text-black',
                'disabled:opacity-30 disabled:cursor-not-allowed',
              )}
            >
              <Save size={11} />
              {mut.isPending ? t('common.loading') : confirm ? t('admin.ops.confirmEnqueue') : t('admin.ops.enqueue')}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}

function Th({ label, align = 'left' }: { label: string; align?: 'left' | 'right' }) {
  return (
    <th className={cn('px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground border-b border-border', align === 'right' ? 'text-right' : 'text-left')}>
      {label}
    </th>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-1.5" style={{ fontFamily: DM_SANS }}>
        {label}
      </span>
      {children}
    </label>
  )
}
