import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft, Phone, MessageCircle, MapPin, Building, User, Plus, AlertTriangle,
  Edit2, Trash2, Save, X,
} from 'lucide-react'

import {
  useDebtClient,
  useLogContact,
  useUpdateContact,
  useDeleteContact,
  type ContactPayload,
  type ContactLogEntry,
  type ClientOrder,
  type ClientPayment,
} from '@/api/hooks'
import { useAuth } from '@/context/AuthContext'
import PageHeader from '@/components/PageHeader'
import Breadcrumb from '@/components/Breadcrumb'
import { formatNumber, formatCurrency, formatShortDate, formatLongDate, agingBadgeVariant } from '@/lib/format'
import { cn } from '@/lib/utils'

const PLAYFAIR = "'Playfair Display', Georgia, serif"
const DM_SANS = "'DM Sans', system-ui"
const PLEX_MONO = "'IBM Plex Mono', ui-monospace, monospace"

const OUTCOMES = ['promise', 'no_answer', 'wrong_number', 'partial_payment', 'dispute', 'paid'] as const

export default function ClientDetail() {
  const { personId } = useParams<{ personId: string }>()
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  const ordersOffset = Number(searchParams.get('orders_offset') ?? 0)
  const paymentsOffset = Number(searchParams.get('payments_offset') ?? 0)

  const id = Number(personId)
  const valid = Number.isFinite(id) && id > 0

  const clientQ = useDebtClient(valid ? id : null, {
    orders_offset: ordersOffset,
    orders_limit: 20,
    payments_offset: paymentsOffset,
    payments_limit: 20,
  })

  const [logModalOpen, setLogModalOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<ContactLogEntry | null>(null)

  const setOffset = (key: 'orders_offset' | 'payments_offset', n: number) =>
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (n > 0) next.set(key, String(n))
      else next.delete(key)
      return next
    })

  if (!valid) return <Navigate to="/collection/worklist" replace />

  // 403 — operator opened a client outside their scope_rooms
  const status = (clientQ.error as { response?: { status?: number } } | undefined)?.response?.status
  if (status === 403) {
    return (
      <div>
        <PageHeader />
        <div className="py-20 text-center animate-fade-up">
          <div className="w-12 h-12 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle size={24} />
          </div>
          <h2 className="text-xl font-bold mb-2" style={{ fontFamily: PLAYFAIR }}>
            {t('common.accessDenied')}
          </h2>
          <p className="text-sm text-muted-foreground mb-6" style={{ fontFamily: DM_SANS }}>
            {t('debt.client.outOfScope')}
          </p>
          <Link
            to="/collection/worklist"
            className="text-xs text-[#9E7B2F] hover:text-[#7A5E20] transition-colors inline-flex items-center gap-1.5"
            style={{ fontFamily: DM_SANS }}
          >
            <ArrowLeft size={12} />
            {t('debt.client.backToWorklist')}
          </Link>
        </div>
      </div>
    )
  }

  const data = clientQ.data
  const isLoading = clientQ.isLoading && !data
  const contact = data?.contact
  const aging = data?.aging
  const orders = data?.orders ?? []
  const payments = data?.payments ?? []
  const contactLog = data?.contact_log ?? []

  const totalDebt = aging
    ? aging.aging_0_30 + aging.aging_30_60 + aging.aging_60_90 + aging.aging_90_plus
    : 0
  const oldestBucket = aging ? oldestBucketFromAging(aging) : null

  const canEdit = user?.role === 'admin' || user?.role === 'operator'

  return (
    <div>
      <PageHeader />

      {/* Breadcrumb — orientation back to the worklist, w/ the client name as
          the current crumb. The Almanac chevron register matches the rest of
          the editorial chrome, replacing the standalone "← back" link. */}
      <div className="animate-fade-up">
        <Breadcrumb
          items={[
            { label: t('nav.groups.collection'), to: '/collection/worklist' },
            { label: t('nav.items.worklist'), to: '/collection/worklist' },
            { label: contact?.name ?? '…' },
          ]}
        />
      </div>

      {/* Header band */}
      {isLoading ? (
        <div className="mt-3 mb-6 animate-fade-up animate-fade-up-delay-1">
          <div className="shimmer-skeleton h-3 w-24 mb-3" />
          <div className="shimmer-skeleton h-12 w-2/3 mb-2" />
          <div className="shimmer-skeleton h-3 w-1/2" />
        </div>
      ) : contact ? (
        <header className="mt-3 mb-7 animate-fade-up animate-fade-up-delay-1">
          <span className="section-title">{t('debt.client.dossier')}</span>
          <div className="flex items-baseline justify-between gap-6 mt-3 flex-wrap">
            <h1
              className="text-3xl lg:text-5xl font-semibold leading-none tracking-tight"
              style={{ fontFamily: PLAYFAIR }}
            >
              {contact.name}
            </h1>
            {oldestBucket && (
              <span className={`action-badge ${agingBadgeVariant(null, oldestBucket)}`}>
                {oldestBucket}
              </span>
            )}
          </div>
          <div
            className="flex items-baseline gap-4 mt-3 text-xs text-muted-foreground flex-wrap"
            style={{ fontFamily: DM_SANS }}
          >
            {contact.tin && (
              <span>
                <span className="uppercase tracking-[0.18em] text-[10px] mr-1.5" style={{ fontFamily: PLEX_MONO }}>
                  {t('debt.client.tin')}
                </span>
                <span style={{ fontFamily: PLEX_MONO }}>{contact.tin}</span>
              </span>
            )}
            {contact.code && (
              <span>
                <span className="uppercase tracking-[0.18em] text-[10px] mr-1.5" style={{ fontFamily: PLEX_MONO }}>
                  {t('debt.client.code')}
                </span>
                <span style={{ fontFamily: PLEX_MONO }}>{contact.code}</span>
              </span>
            )}
            {contact.created_on && (
              <span>
                · {t('debt.client.since')} {formatShortDate(contact.created_on, i18n.language)}
              </span>
            )}
          </div>
        </header>
      ) : null}

      {/* Aging panel — total debt + 4-bucket strip */}
      {aging && (
        <section className="glass-card kpi-glow rounded-xl p-6 mb-6 animate-fade-up animate-fade-up-delay-2">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 lg:gap-6">
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.14em] mb-1" style={{ fontFamily: DM_SANS }}>
                {t('debt.client.totalDebt')}
              </p>
              <p className="text-3xl lg:text-4xl font-semibold tabular-nums leading-none" style={{ fontFamily: PLAYFAIR }}>
                {formatNumber(totalDebt)}
              </p>
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mt-1" style={{ fontFamily: PLEX_MONO }}>
                USD
              </p>
            </div>
            <BucketCell label={t('debt.aging.current')} value={aging.aging_0_30} total={totalDebt} />
            <BucketCell label="30-60" value={aging.aging_30_60} total={totalDebt} variant="markdown" />
            <BucketCell label="60-90" value={aging.aging_60_90} total={totalDebt} variant="urgent" />
            <BucketCell label="90+" value={aging.aging_90_plus} total={totalDebt} variant="critical" />
          </div>
        </section>
      )}

      {/* Three columns: Contact / Orders / Payments + Contact log */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-6">
        {/* LEFT — contact metadata */}
        <aside className="lg:col-span-3 animate-fade-up animate-fade-up-delay-3">
          <span className="section-title">{t('debt.client.contact')}</span>
          {isLoading ? (
            <div className="mt-3 space-y-3">
              <div className="shimmer-skeleton h-3 w-3/4" />
              <div className="shimmer-skeleton h-3 w-1/2" />
              <div className="shimmer-skeleton h-3 w-2/3" />
            </div>
          ) : contact ? (
            <dl className="mt-3 space-y-3" style={{ fontFamily: DM_SANS }}>
              {contact.main_phone && <ContactRow icon={Phone} label={t('debt.client.phone')} value={contact.main_phone} />}
              {contact.telegram && <ContactRow icon={MessageCircle} label="Telegram" value={contact.telegram} />}
              {(contact.address || contact.region_name) && (
                <ContactRow
                  icon={MapPin}
                  label={t('debt.client.address')}
                  value={[contact.region_name, contact.address].filter(Boolean).join(', ')}
                />
              )}
              {contact.owner_name && <ContactRow icon={User} label={t('debt.client.manager')} value={contact.owner_name} />}
              {contact.parent_name && <ContactRow icon={Building} label={t('debt.client.parent')} value={contact.parent_name} />}
              {contact.category && <ContactRow icon={Building} label={t('debt.client.category')} value={contact.category} />}
              {contact.note && (
                <div className="pt-2 border-t border-border/40">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-1.5" style={{ fontFamily: PLEX_MONO }}>
                    {t('debt.client.note')}
                  </p>
                  <p className="text-xs italic text-foreground/80" style={{ fontFamily: DM_SANS }}>
                    {contact.note}
                  </p>
                </div>
              )}
            </dl>
          ) : null}
        </aside>

        {/* MIDDLE — orders timeline */}
        <section className="lg:col-span-5 animate-fade-up animate-fade-up-delay-3">
          <div className="flex items-baseline gap-2 mb-3">
            <span className="section-title flex-1">{t('debt.client.ordersTimeline')}</span>
            {data && (
              <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground" style={{ fontFamily: PLEX_MONO }}>
                {data.orders_total} · {formatNumber(data.orders_sum)} USD
              </span>
            )}
          </div>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="shimmer-skeleton h-12 w-full" />
              ))}
            </div>
          ) : orders.length === 0 ? (
            <p className="text-sm italic text-muted-foreground" style={{ fontFamily: PLAYFAIR }}>
              {t('debt.client.noOrders')}
            </p>
          ) : (
            <ul className="space-y-2.5" style={{ fontFamily: DM_SANS }}>
              {orders.map((order, i) => (
                <OrderItem key={`${order.deal_id}-${i}`} order={order} lang={i18n.language} />
              ))}
            </ul>
          )}
          {data && data.orders_total > 20 && (
            <Pager
              offset={ordersOffset}
              limit={20}
              total={data.orders_total}
              onChange={(n) => setOffset('orders_offset', n)}
            />
          )}
        </section>

        {/* RIGHT — payments + contact log */}
        <section className="lg:col-span-4 animate-fade-up animate-fade-up-delay-4">
          <div className="flex items-baseline gap-2 mb-3">
            <span className="section-title flex-1">{t('debt.client.paymentsTimeline')}</span>
            {data && (
              <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground" style={{ fontFamily: PLEX_MONO }}>
                {data.payments_total} · {formatNumber(data.payments_sum)}
              </span>
            )}
          </div>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="shimmer-skeleton h-10 w-full" />
              ))}
            </div>
          ) : payments.length === 0 ? (
            <p className="text-sm italic text-muted-foreground mb-6" style={{ fontFamily: PLAYFAIR }}>
              {t('debt.client.noPayments')}
            </p>
          ) : (
            <ul className="space-y-2 mb-6" style={{ fontFamily: DM_SANS }}>
              {payments.map((p, i) => (
                <PaymentItem key={`${p.payment_id}-${i}`} payment={p} lang={i18n.language} />
              ))}
            </ul>
          )}
          {data && data.payments_total > 20 && (
            <Pager
              offset={paymentsOffset}
              limit={20}
              total={data.payments_total}
              onChange={(n) => setOffset('payments_offset', n)}
            />
          )}

          {/* Contact log — the editorial heart of the page */}
          <div className="mt-8 pt-5 border-t border-border/60">
            <div className="flex items-baseline gap-2 mb-3">
              <span className="section-title flex-1">{t('debt.client.contactLog')}</span>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingEntry(null)
                    setLogModalOpen(true)
                  }}
                  className="text-xs text-[#9E7B2F] hover:text-[#7A5E20] inline-flex items-center gap-1 transition-colors"
                  style={{ fontFamily: DM_SANS }}
                >
                  <Plus size={12} />
                  {t('debt.client.logContact')}
                </button>
              )}
            </div>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="shimmer-skeleton h-12 w-full" />
                ))}
              </div>
            ) : contactLog.length === 0 ? (
              <p className="text-sm italic text-muted-foreground" style={{ fontFamily: PLAYFAIR }}>
                {t('debt.client.noContacts')}
              </p>
            ) : (
              <ul className="space-y-3">
                {contactLog.map((entry) => (
                  <ContactLogItem
                    key={entry.id}
                    entry={entry}
                    lang={i18n.language}
                    canEditEntry={canEdit && (user?.role === 'admin' || user?.id === entry.author_id)}
                    onEdit={() => {
                      setEditingEntry(entry)
                      setLogModalOpen(true)
                    }}
                  />
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      {logModalOpen && (
        <LogContactModal
          personId={id}
          existing={editingEntry}
          onClose={() => {
            setLogModalOpen(false)
            setEditingEntry(null)
          }}
        />
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────

function oldestBucketFromAging(aging: { aging_0_30: number; aging_30_60: number; aging_60_90: number; aging_90_plus: number }):
  | 'current'
  | '30-60'
  | '60-90'
  | '90+'
  | null {
  if (aging.aging_90_plus > 0) return '90+'
  if (aging.aging_60_90 > 0) return '60-90'
  if (aging.aging_30_60 > 0) return '30-60'
  if (aging.aging_0_30 > 0) return 'current'
  return null
}

function BucketCell({
  label,
  value,
  total,
  variant,
}: {
  label: string
  value: number
  total: number
  variant?: 'markdown' | 'urgent' | 'critical'
}) {
  const pct = total > 0 ? (value / total) * 100 : 0
  const tone =
    variant === 'critical'
      ? 'text-[#F87171]'
      : variant === 'urgent'
      ? 'text-[#FB923C]'
      : variant === 'markdown'
      ? 'text-[#FBBF24]'
      : 'text-foreground'
  return (
    <div>
      <p
        className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-1"
        style={{ fontFamily: DM_SANS }}
      >
        {label}
      </p>
      <p className={cn('text-xl font-semibold tabular-nums leading-tight', tone)} style={{ fontFamily: PLAYFAIR }}>
        {value > 0 ? formatNumber(value) : <span className="cell-empty text-base">—</span>}
      </p>
      {value > 0 && (
        <p className="mt-0.5 text-[10px] text-muted-foreground tabular-nums" style={{ fontFamily: DM_SANS }}>
          {pct.toFixed(0)}%
        </p>
      )}
    </div>
  )
}

function ContactRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType
  label: string
  value: string
}) {
  return (
    <div className="flex items-baseline gap-2">
      <Icon size={11} className="text-muted-foreground/60 shrink-0 translate-y-0.5" aria-hidden />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/80" style={{ fontFamily: PLEX_MONO }}>
          {label}
        </p>
        <p className="text-sm break-words" style={{ fontFamily: DM_SANS }}>{value}</p>
      </div>
    </div>
  )
}

function OrderItem({ order, lang }: { order: ClientOrder; lang: string }) {
  return (
    <li className="grid grid-cols-[60px_1fr_auto] gap-3 items-baseline border-b border-border/30 pb-2.5">
      <span className="text-[11px] text-muted-foreground tabular-nums">
        {formatShortDate(order.delivery_date, lang)}
      </span>
      <div className="min-w-0">
        <p className="text-sm truncate">{order.product_name}</p>
        <p className="text-[10px] text-muted-foreground" style={{ fontFamily: PLEX_MONO }}>
          № {order.deal_id} · {order.room_name ?? '—'}
        </p>
      </div>
      <span className="text-sm tabular-nums font-medium" style={{ fontFamily: PLAYFAIR }}>
        {formatNumber(order.product_amount)}
      </span>
    </li>
  )
}

function PaymentItem({ payment, lang }: { payment: ClientPayment; lang: string }) {
  return (
    <li className="grid grid-cols-[60px_1fr_auto] gap-3 items-baseline border-b border-border/30 pb-2">
      <span className="text-[11px] text-muted-foreground tabular-nums">
        {formatShortDate(payment.payment_date, lang)}
      </span>
      <div className="min-w-0 text-xs text-muted-foreground">
        {payment.payment_method ?? '—'}
        {payment.payer && payment.payer !== '' && <span className="ml-1.5 italic">· {payment.payer}</span>}
      </div>
      <span className="text-sm tabular-nums font-medium text-[#34D399]" style={{ fontFamily: PLAYFAIR }}>
        +{formatNumber(payment.amount)}
      </span>
    </li>
  )
}

function ContactLogItem({
  entry,
  lang,
  canEditEntry,
  onEdit,
}: {
  entry: ContactLogEntry
  lang: string
  canEditEntry: boolean
  onEdit: () => void
}) {
  const { t } = useTranslation()
  const deleteMut = useDeleteContact()
  const [confirmDelete, setConfirmDelete] = useState(false)
  return (
    <li className="glass-card rounded-lg p-3" style={{ fontFamily: DM_SANS }}>
      <div className="flex items-baseline justify-between gap-3 mb-1.5">
        <span className={`action-badge ${outcomeBadgeVariant(entry.outcome)}`}>
          {t(`debt.outcomes.${entry.outcome}`, entry.outcome)}
        </span>
        <span className="text-[10px] text-muted-foreground" style={{ fontFamily: PLEX_MONO }}>
          {entry.author_username ?? '—'} · {formatShortDate(entry.created_at, lang)}
        </span>
      </div>
      {(entry.promised_amount || entry.promised_by_date) && (
        <p className="text-xs text-muted-foreground mb-1">
          {entry.promised_amount && (
            <>
              <span className="font-medium tabular-nums" style={{ fontFamily: PLAYFAIR }}>
                {formatCurrency(entry.promised_amount, null)}
              </span>
              {entry.promised_by_date && <> {t('debt.client.by')} {formatShortDate(entry.promised_by_date, lang)}</>}
            </>
          )}
          {!entry.promised_amount && entry.promised_by_date && (
            <>{t('debt.client.followUp')}: {formatShortDate(entry.promised_by_date, lang)}</>
          )}
        </p>
      )}
      {entry.note && (
        <p className="text-xs italic text-foreground/80 leading-relaxed">"{entry.note}"</p>
      )}
      {canEditEntry && (
        <div className="flex items-center gap-3 mt-2 pt-2 border-t border-border/40 text-[10px] uppercase tracking-[0.12em]">
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-[#9E7B2F] transition-colors"
          >
            <Edit2 size={10} />
            {t('common.edit')}
          </button>
          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-red-500 transition-colors"
            >
              <Trash2 size={10} />
              {t('common.delete')}
            </button>
          ) : (
            <span className="inline-flex items-center gap-2 text-red-500">
              <span className="italic normal-case">{t('debt.client.confirmDelete')}</span>
              <button
                type="button"
                onClick={() => deleteMut.mutate(entry.id)}
                className="font-semibold hover:text-red-700"
                disabled={deleteMut.isPending}
              >
                {t('common.confirm')}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="text-muted-foreground"
              >
                {t('common.cancel')}
              </button>
            </span>
          )}
        </div>
      )}
    </li>
  )
}

function outcomeBadgeVariant(outcome: string): 'monitor' | 'plan' | 'markdown' | 'urgent' | 'critical' {
  switch (outcome) {
    case 'paid':
      return 'monitor'
    case 'promise':
      return 'plan'
    case 'partial_payment':
      return 'markdown'
    case 'no_answer':
    case 'wrong_number':
      return 'urgent'
    case 'dispute':
      return 'critical'
    default:
      return 'plan'
  }
}

function Pager({
  offset,
  limit,
  total,
  onChange,
}: {
  offset: number
  limit: number
  total: number
  onChange: (n: number) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center justify-between gap-4 mt-3 text-[10px] uppercase tracking-[0.14em]" style={{ fontFamily: DM_SANS }}>
      <span className="text-muted-foreground italic normal-case tracking-normal text-xs">
        {offset + 1}–{Math.min(offset + limit, total)} {t('data.of')} {total.toLocaleString()}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={offset === 0}
          onClick={() => onChange(Math.max(0, offset - limit))}
          className="px-2 py-1 hover:bg-accent/60 rounded transition-colors disabled:opacity-30"
        >
          ‹
        </button>
        <button
          type="button"
          disabled={offset + limit >= total}
          onClick={() => onChange(offset + limit)}
          className="px-2 py-1 hover:bg-accent/60 rounded transition-colors disabled:opacity-30"
        >
          ›
        </button>
      </div>
    </div>
  )
}

// ── Log contact modal ────────────────────────────────────────────────────

function LogContactModal({
  personId,
  existing,
  onClose,
}: {
  personId: number
  existing: ContactLogEntry | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const logMut = useLogContact()
  const updateMut = useUpdateContact()

  const [outcome, setOutcome] = useState(existing?.outcome ?? 'promise')
  const [promisedAmount, setPromisedAmount] = useState(
    existing?.promised_amount ? String(existing.promised_amount) : '',
  )
  const [promisedByDate, setPromisedByDate] = useState(existing?.promised_by_date ?? '')
  const [followUpDate, setFollowUpDate] = useState(existing?.follow_up_date ?? '')
  const [note, setNote] = useState(existing?.note ?? '')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const isPending = logMut.isPending || updateMut.isPending

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const payload: ContactPayload = {
      outcome,
      promised_amount: promisedAmount ? Number(promisedAmount) : null,
      promised_by_date: promisedByDate || null,
      follow_up_date: followUpDate || null,
      note: note.trim() || null,
    }
    try {
      if (existing) {
        await updateMut.mutateAsync({ entryId: existing.id, payload })
      } else {
        await logMut.mutateAsync({ personId, payload })
      }
      onClose()
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } }).response?.status
      setError(status === 403 ? t('debt.client.outOfScope') : t('debt.client.saveFailed'))
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/30" onClick={onClose} aria-hidden />
      <div
        className="fixed left-1/2 top-1/2 z-40 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-card border border-border rounded-xl p-6 lg:p-7 shadow-xl animate-fade-up"
        style={{ fontFamily: DM_SANS }}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-2xl font-semibold leading-none" style={{ fontFamily: PLAYFAIR }}>
            {existing ? t('debt.client.editContact') : t('debt.client.logContact')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 -m-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
            aria-label={t('common.close')}
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <Field label={t('debt.client.outcome')}>
            <select value={outcome} onChange={(e) => setOutcome(e.target.value)} className="inv-filter w-full">
              {OUTCOMES.map((o) => (
                <option key={o} value={o}>
                  {t(`debt.outcomes.${o}`)}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t('debt.client.promisedAmount')}>
              <input
                type="number"
                step="0.01"
                value={promisedAmount}
                onChange={(e) => setPromisedAmount(e.target.value)}
                placeholder="0"
                className="inv-filter w-full"
              />
            </Field>
            <Field label={t('debt.client.promisedBy')}>
              <input
                type="date"
                value={promisedByDate}
                onChange={(e) => setPromisedByDate(e.target.value)}
                className="inv-filter w-full"
              />
            </Field>
          </div>

          <Field label={t('debt.client.followUpDate')}>
            <input
              type="date"
              value={followUpDate}
              onChange={(e) => setFollowUpDate(e.target.value)}
              className="inv-filter w-full"
            />
          </Field>

          <Field label={t('debt.client.note')}>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder={t('debt.client.notePlaceholder')}
              className="w-full text-sm bg-input border border-border rounded-md px-3 py-2 focus:outline-none focus:border-[#9E7B2F]/40 focus:ring-2 focus:ring-[#9E7B2F]/10"
            />
          </Field>

          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-xs flex items-start gap-2">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="text-xs px-3 py-1.5 text-muted-foreground hover:text-foreground transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="text-xs px-3.5 py-1.5 rounded bg-[#D4A843] hover:bg-[#C49833] disabled:bg-[#D4A843]/30 disabled:cursor-not-allowed text-black font-semibold inline-flex items-center gap-1.5 transition-colors"
            >
              <Save size={11} />
              {isPending ? t('common.loading') : existing ? t('common.save') : t('debt.client.logIt')}
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
      <span
        className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-1.5"
        style={{ fontFamily: DM_SANS }}
      >
        {label}
      </span>
      {children}
    </label>
  )
}

// Reference unused for noUnusedLocals
void formatLongDate
