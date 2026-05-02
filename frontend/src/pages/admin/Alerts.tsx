import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Edit2, Trash2, Save, X, Bell, BellRing, AlertTriangle, Play } from 'lucide-react'

import PageHeader from '@/components/PageHeader'
import {
  useAlertRules,
  useAlertEvents,
  useCreateAlertRule,
  useUpdateAlertRule,
  useDeleteAlertRule,
  useMarkAlertRead,
  useMarkAllAlertsRead,
  useEvaluateAlerts,
  type AlertRule,
} from '@/api/hooks'
import { useAuth } from '@/context/AuthContext'
import { formatNumber, formatShortDate } from '@/lib/format'
import { cn } from '@/lib/utils'

const PLAYFAIR = "'Playfair Display', Georgia, serif"
const DM_SANS = "'DM Sans', system-ui"
const PLEX_MONO = "'IBM Plex Mono', ui-monospace, monospace"

const RULE_KINDS = [
  { value: 'dso_gt', unit: 'days' },
  { value: 'debt_total_gt', unit: 'USD' },
  { value: 'single_debtor_gt', unit: 'USD' },
  { value: 'over_90_count_gt', unit: '' },
  { value: 'revenue_drop_pct', unit: '%' },
  { value: 'deal_count_drop_pct', unit: '%' },
] as const

export default function Alerts() {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const rulesQ = useAlertRules()
  const [unreadOnly, setUnreadOnly] = useState(false)
  const eventsQ = useAlertEvents(unreadOnly, 50)
  const evaluate = useEvaluateAlerts()
  const markAll = useMarkAllAlertsRead()

  const [editing, setEditing] = useState<AlertRule | 'new' | null>(null)
  const [evalToast, setEvalToast] = useState<string | null>(null)

  async function onEvaluate() {
    try {
      const r = await evaluate.mutateAsync()
      setEvalToast(t('admin.alerts.evaluated', { count: r.events_created }))
      setTimeout(() => setEvalToast(null), 3000)
    } catch {
      setEvalToast(t('admin.alerts.evalFailed'))
      setTimeout(() => setEvalToast(null), 3000)
    }
  }

  return (
    <div>
      <PageHeader />

      <header className="mb-6">
        <span className="section-title">{t('admin.section')}</span>
        <div className="flex items-end justify-between gap-4 mt-3 flex-wrap">
          <h1
            className="text-3xl lg:text-4xl font-semibold leading-none tracking-tight"
            style={{ fontFamily: PLAYFAIR }}
          >
            {t('admin.alerts.title')}
          </h1>
          <button
            type="button"
            onClick={onEvaluate}
            disabled={evaluate.isPending}
            className="month-btn inline-flex items-center gap-1.5 normal-case"
          >
            <Play size={11} />
            {evaluate.isPending ? t('common.loading') : t('admin.alerts.runNow')}
          </button>
        </div>
      </header>

      {evalToast && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-[#34D399]/10 border border-[#34D399]/30 text-[#34D399] text-xs animate-fade-up" style={{ fontFamily: DM_SANS }}>
          {evalToast}
        </div>
      )}

      {/* Two columns: rules + events */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fade-up animate-fade-up-delay-2">
        {/* Rules */}
        <section className="lg:col-span-5">
          <div className="flex items-baseline justify-between gap-3 mb-3">
            <span className="section-title flex-1">{t('admin.alerts.rules')}</span>
            <button
              type="button"
              onClick={() => setEditing('new')}
              className="text-xs text-[#9E7B2F] hover:text-[#7A5E20] inline-flex items-center gap-1 transition-colors"
              style={{ fontFamily: DM_SANS }}
            >
              <Plus size={12} />
              {t('admin.alerts.newRule')}
            </button>
          </div>
          {rulesQ.isLoading && !rulesQ.data ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <div key={i} className="shimmer-skeleton h-16 w-full" />)}
            </div>
          ) : (rulesQ.data ?? []).length === 0 ? (
            <p className="text-sm italic text-muted-foreground" style={{ fontFamily: PLAYFAIR }}>
              {t('admin.alerts.noRules')}
            </p>
          ) : (
            <ul className="space-y-2">
              {(rulesQ.data ?? []).map((rule) => (
                <RuleItem key={rule.id} rule={rule} canEdit={isAdmin || user?.id === rule.user_id} onEdit={() => setEditing(rule)} />
              ))}
            </ul>
          )}
        </section>

        {/* Events */}
        <section className="lg:col-span-7">
          <div className="flex items-baseline justify-between gap-3 mb-3">
            <span className="section-title flex-1">{t('admin.alerts.events')}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setUnreadOnly((v) => !v)}
                className={cn('month-btn normal-case', unreadOnly && 'active')}
              >
                {t('admin.alerts.unreadOnly')}
                {eventsQ.data?.unread ? <span className="ml-1.5 text-[#9E7B2F]">({eventsQ.data.unread})</span> : null}
              </button>
              {(eventsQ.data?.unread ?? 0) > 0 && (
                <button
                  type="button"
                  onClick={() => markAll.mutate()}
                  className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground hover:text-[#9E7B2F] transition-colors"
                >
                  {t('admin.alerts.markAllRead')}
                </button>
              )}
            </div>
          </div>
          {eventsQ.isLoading && !eventsQ.data ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="shimmer-skeleton h-12 w-full" />)}
            </div>
          ) : (eventsQ.data?.rows ?? []).length === 0 ? (
            <div className="py-12 text-center">
              <Bell size={28} className="text-[#34D399] mx-auto mb-3" />
              <p className="text-base italic text-muted-foreground" style={{ fontFamily: PLAYFAIR }}>
                {unreadOnly ? t('admin.alerts.noUnread') : t('admin.alerts.allClear')}
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {(eventsQ.data?.rows ?? []).map((ev) => (
                <EventItem key={ev.id} event={ev} lang={i18n.language} />
              ))}
            </ul>
          )}
        </section>
      </div>

      {editing && (
        <RuleModal
          rule={editing === 'new' ? null : editing}
          isAdmin={isAdmin}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function RuleItem({ rule, canEdit, onEdit }: { rule: AlertRule; canEdit: boolean; onEdit: () => void }) {
  const { t } = useTranslation()
  const update = useUpdateAlertRule()
  const del = useDeleteAlertRule()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const kind = RULE_KINDS.find((k) => k.value === rule.kind)
  const unit = kind?.unit ?? ''

  return (
    <li className="glass-card rounded-lg p-3" style={{ fontFamily: DM_SANS }}>
      <div className="flex items-baseline justify-between gap-3 mb-1.5">
        <div className="flex items-baseline gap-2 flex-wrap min-w-0">
          <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground" style={{ fontFamily: PLEX_MONO }}>
            {rule.kind}
          </span>
          {rule.shared && <span className="action-badge plan">{t('admin.alerts.shared')}</span>}
        </div>
        <label className="inline-flex items-center gap-1 cursor-pointer text-[10px]">
          <input
            type="checkbox"
            checked={rule.enabled}
            disabled={!canEdit || update.isPending}
            onChange={(e) => update.mutate({ id: rule.id, payload: { enabled: e.target.checked } })}
          />
          <span className={rule.enabled ? 'text-[#9E7B2F]' : 'text-muted-foreground'}>
            {rule.enabled ? t('admin.alerts.enabled') : t('admin.alerts.disabled')}
          </span>
        </label>
      </div>
      <p className="text-sm leading-tight" style={{ fontFamily: PLAYFAIR }}>
        {rule.label || t(`admin.alerts.kinds.${rule.kind}`, rule.kind)}
      </p>
      <p className="text-xs text-muted-foreground mt-0.5" style={{ fontFamily: DM_SANS }}>
        <span className="font-medium tabular-nums" style={{ fontFamily: PLAYFAIR }}>
          ≥ {formatNumber(rule.threshold, { decimals: 0 })} {unit}
        </span>
      </p>
      {canEdit && (
        <div className="flex items-center gap-3 mt-2 pt-2 border-t border-border/40 text-[10px] uppercase tracking-[0.12em]">
          <button type="button" onClick={onEdit} className="inline-flex items-center gap-1 text-muted-foreground hover:text-[#9E7B2F] transition-colors">
            <Edit2 size={10} />
            {t('common.edit')}
          </button>
          {!confirmDelete ? (
            <button type="button" onClick={() => setConfirmDelete(true)} className="inline-flex items-center gap-1 text-muted-foreground hover:text-red-500 transition-colors">
              <Trash2 size={10} />
              {t('common.delete')}
            </button>
          ) : (
            <span className="inline-flex items-center gap-2 text-red-500">
              <span className="italic normal-case">{t('admin.alerts.confirmDelete')}</span>
              <button type="button" onClick={() => del.mutate(rule.id)} disabled={del.isPending} className="font-semibold hover:text-red-700">
                {t('common.confirm')}
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)} className="text-muted-foreground">
                {t('common.cancel')}
              </button>
            </span>
          )}
        </div>
      )}
    </li>
  )
}

function EventItem({ event, lang }: { event: import('@/api/hooks').AlertEvent; lang: string }) {
  const { t } = useTranslation()
  const mark = useMarkAlertRead()
  const isUnread = !event.read_at
  return (
    <li className={cn('glass-card rounded-lg p-3 relative', isUnread && 'ring-1 ring-[#FB923C]/30')} style={{ fontFamily: DM_SANS }}>
      {isUnread && <span aria-hidden className="absolute top-3 right-3 w-2 h-2 rounded-full bg-[#FB923C] animate-pulse" />}
      <div className="flex items-baseline gap-2 mb-1">
        {isUnread ? <BellRing size={12} className="text-[#FB923C]" /> : <Bell size={12} className="text-muted-foreground/50" />}
        <span className="text-sm font-medium" style={{ fontFamily: PLAYFAIR }}>
          {event.rule_label || t(`admin.alerts.kinds.${event.rule_kind}`, event.rule_kind)}
        </span>
      </div>
      <p className="text-xs text-muted-foreground" style={{ fontFamily: DM_SANS }}>
        <span className="font-medium tabular-nums" style={{ fontFamily: PLAYFAIR }}>{formatNumber(event.value)}</span>
        {' '}≥{' '}
        <span className="tabular-nums">{formatNumber(event.threshold)}</span>
        <span className="ml-2 text-muted-foreground/60" style={{ fontFamily: PLEX_MONO }}>
          {formatShortDate(event.fired_at, lang)}
        </span>
      </p>
      {isUnread && (
        <button
          type="button"
          onClick={() => mark.mutate(event.id)}
          disabled={mark.isPending}
          className="mt-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground hover:text-[#9E7B2F] transition-colors"
        >
          {t('admin.alerts.markRead')}
        </button>
      )}
    </li>
  )
}

function RuleModal({ rule, isAdmin, onClose }: { rule: AlertRule | null; isAdmin: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const create = useCreateAlertRule()
  const update = useUpdateAlertRule()

  const [kind, setKind] = useState(rule?.kind ?? 'debt_total_gt')
  const [threshold, setThreshold] = useState(String(rule?.threshold ?? ''))
  const [label, setLabel] = useState(rule?.label ?? '')
  const [enabled, setEnabled] = useState(rule?.enabled ?? true)
  const [shared, setShared] = useState(rule?.shared ?? false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const n = Number(threshold)
    if (!Number.isFinite(n) || n <= 0) {
      setError(t('admin.alerts.thresholdInvalid'))
      return
    }
    try {
      if (rule) {
        await update.mutateAsync({ id: rule.id, payload: { threshold: n, label: label.trim() || null, enabled } })
      } else {
        await create.mutateAsync({ kind, threshold: n, label: label.trim() || null, enabled, shared: isAdmin && shared })
      }
      onClose()
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
      setError(detail ?? t('admin.alerts.saveFailed'))
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/30" onClick={onClose} aria-hidden />
      <div className="fixed left-1/2 top-1/2 z-40 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-card border border-border rounded-xl p-6 lg:p-7 shadow-xl animate-fade-up" role="dialog" aria-modal="true">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-2xl font-semibold leading-none" style={{ fontFamily: PLAYFAIR }}>
            {rule ? t('admin.alerts.editRule') : t('admin.alerts.newRule')}
          </h2>
          <button type="button" onClick={onClose} className="p-1 -m-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors" aria-label={t('common.close')}>
            <X size={16} />
          </button>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label={t('admin.alerts.kind')}>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
              disabled={!!rule}
              className="inv-filter w-full"
            >
              {RULE_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {t(`admin.alerts.kinds.${k.value}`, k.value)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('admin.alerts.threshold')}>
            <input
              type="number"
              step="any"
              min={0}
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              required
              className="inv-filter w-full"
            />
          </Field>
          <Field label={t('admin.alerts.labelField')}>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t('admin.alerts.labelPlaceholder')}
              className="inv-filter w-full"
            />
          </Field>
          <label className="flex items-center gap-2 text-sm" style={{ fontFamily: DM_SANS }}>
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            {t('admin.alerts.enabled')}
          </label>
          {isAdmin && !rule && (
            <label className="flex items-center gap-2 text-sm" style={{ fontFamily: DM_SANS }}>
              <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
              {t('admin.alerts.shareWithAll')}
            </label>
          )}
          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-xs flex items-start gap-2">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="text-xs px-3 py-1.5 text-muted-foreground hover:text-foreground transition-colors">
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={create.isPending || update.isPending}
              className="text-xs px-3.5 py-1.5 rounded bg-[#D4A843] hover:bg-[#C49833] disabled:bg-[#D4A843]/30 text-black font-semibold inline-flex items-center gap-1.5 transition-colors"
            >
              <Save size={11} />
              {create.isPending || update.isPending ? t('common.loading') : t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </>
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
