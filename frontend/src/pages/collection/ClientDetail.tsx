import { useEffect, useState, type ElementType, type ReactNode } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  Building,
  Edit2,
  MapPin,
  MessageCircle,
  Phone,
  Plus,
  Save,
  Trash2,
  User,
  X,
} from 'lucide-react'

import {
  useDebtClient,
  useDeleteContact,
  useLogContact,
  useUpdateContact,
  type ClientAging,
  type ClientOrder,
  type ClientPayment,
  type ContactLogEntry,
  type ContactPayload,
} from '@/api/hooks'
import Breadcrumb from '@/components/Breadcrumb'
import PageHeader from '@/components/PageHeader'
import { useAuth } from '@/context/AuthContext'
import {
  agingBadgeVariant,
  formatCurrency,
  formatLongDate,
  formatNumber,
  formatPercent,
  formatShortDate,
} from '@/lib/format'
import { cn } from '@/lib/utils'

const PLAYFAIR = "'Playfair Display', Georgia, serif"
const DM_SANS = "'DM Sans', system-ui"
const PLEX_MONO = "'IBM Plex Mono', ui-monospace, monospace"

const OUTCOMES = ['promise', 'no_answer', 'wrong_number', 'partial_payment', 'dispute', 'paid'] as const

type QuickAction = {
  label: string
  href: string
  icon: ElementType
}

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

  const setOffset = (key: 'orders_offset' | 'payments_offset', nextOffset: number) =>
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (nextOffset > 0) next.set(key, String(nextOffset))
      else next.delete(key)
      return next
    })

  if (!valid) return <Navigate to="/collection/clients" replace />

  const status = (clientQ.error as { response?: { status?: number } } | undefined)?.response?.status
  if (status === 403) {
    return (
      <div>
        <PageHeader />
        <InlineState
          title={t('common.accessDenied')}
          description={t('debt.client.outOfScope')}
          backLabel={t('debt.client.backToWorklist')}
        />
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
  const collectionRate = aging && aging.gross_invoiced > 0
    ? (aging.gross_paid / aging.gross_invoiced) * 100
    : null
  const oldestBucket = aging ? oldestBucketFromAging(aging) : null
  const latestContact = contactLog[0] ?? null
  const latestPromised = contactLog.find((entry) => entry.promised_amount || entry.promised_by_date) ?? null
  const latestOrder = orders[0] ?? null
  const latestPayment = payments[0] ?? null

  const quickActions: QuickAction[] = []
  if (contact?.main_phone) {
    quickActions.push({
      label: t('debt.client.call'),
      href: `tel:${contact.main_phone.replace(/\s+/g, '')}`,
      icon: Phone,
    })
  }
  if (contact?.telegram) {
    quickActions.push({
      label: t('debt.client.message'),
      href: contact.telegram.startsWith('http')
        ? contact.telegram
        : `https://t.me/${contact.telegram.replace(/^@/, '')}`,
      icon: MessageCircle,
    })
  }
  if (contact && (contact.address || contact.region_name)) {
    quickActions.push({
      label: t('debt.client.openMap'),
      href: `https://maps.google.com/?q=${encodeURIComponent(
        [contact.region_name, contact.address].filter(Boolean).join(', '),
      )}`,
      icon: MapPin,
    })
  }

  const canEdit = user?.role === 'admin' || user?.role === 'operator'

  return (
    <div>
      <PageHeader />

      <div className="animate-fade-up">
        <Breadcrumb
          items={[
            { label: t('nav.groups.collection'), to: '/collection/clients' },
            { label: t('nav.items.clients'), to: '/collection/clients' },
            { label: contact?.name ?? '…' },
          ]}
        />
      </div>

      {clientQ.isError && status !== 403 ? (
        <InlineState
          title={t('common.error')}
          description={t('debt.client.saveFailed')}
          backLabel={t('debt.client.backToWorklist')}
        />
      ) : (
        <>
          {isLoading ? (
            <HeroSkeleton />
          ) : contact && aging ? (
            <>
              <header className="mt-4 mb-5 animate-fade-up animate-fade-up-delay-1">
                <span className="section-title">{t('debt.client.dossier')}</span>
                <div className="mt-3 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <h1
                      className="text-3xl lg:text-5xl font-semibold leading-none tracking-tight"
                      style={{ fontFamily: PLAYFAIR }}
                    >
                      {contact.name}
                    </h1>
                    <p className="mt-2 max-w-3xl text-sm text-muted-foreground" style={{ fontFamily: DM_SANS }}>
                      {t('debt.client.subtitle')}
                    </p>
                  </div>
                  {oldestBucket && (
                    <span className={`action-badge ${agingBadgeVariant(null, oldestBucket)}`}>
                      {oldestBucket}
                    </span>
                  )}
                </div>
              </header>

              <section className="relative overflow-hidden rounded-[1.75rem] border border-border/70 bg-card px-5 py-5 lg:px-7 lg:py-6 animate-fade-up animate-fade-up-delay-2">
                <span
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#D4A843]/60 to-transparent"
                />
                <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_0.9fr]">
                  <div>
                    <div className="flex flex-wrap gap-2">
                      {contact.tin && <HeaderChip label={t('debt.client.tin')} value={contact.tin} />}
                      {contact.code && <HeaderChip label={t('debt.client.code')} value={contact.code} />}
                      {contact.short_name && <HeaderChip label={t('debt.client.shortName')} value={contact.short_name} />}
                      {contact.category && <HeaderChip label={t('debt.client.category')} value={contact.category} />}
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
                      <SignalMetric
                        label={t('debt.client.totalDebt')}
                        value={formatNumber(totalDebt)}
                        suffix="USD"
                        tone="critical"
                      />
                      <SignalMetric
                        label={t('debt.client.collectionRate')}
                        value={collectionRate == null ? '—' : formatPercent(collectionRate, 1)}
                        tone="monitor"
                      />
                      <SignalMetric
                        label={t('debt.client.latestOrder')}
                        value={latestOrder ? formatShortDate(latestOrder.delivery_date, i18n.language) : '—'}
                      />
                      <SignalMetric
                        label={t('debt.client.latestPayment')}
                        value={latestPayment ? formatShortDate(latestPayment.payment_date, i18n.language) : '—'}
                      />
                    </div>

                    <div className="mt-6 border-t border-border/60 pt-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground" style={{ fontFamily: PLEX_MONO }}>
                          {t('debt.client.quickActions')}
                        </p>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingEntry(null)
                              setLogModalOpen(true)
                            }}
                            className="inline-flex items-center gap-1.5 text-xs text-[#9E7B2F] transition-colors hover:text-[#7A5E20]"
                            style={{ fontFamily: DM_SANS }}
                          >
                            <Plus size={12} />
                            {t('debt.client.logContact')}
                          </button>
                        )}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {quickActions.map((action) => (
                          <a
                            key={action.label}
                            href={action.href}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-3 py-2 text-sm text-foreground transition-colors hover:border-[#D4A843]/40 hover:text-[#9E7B2F]"
                            style={{ fontFamily: DM_SANS }}
                          >
                            <action.icon size={14} />
                            {action.label}
                            <ArrowUpRight size={12} className="text-muted-foreground/70" />
                          </a>
                        ))}
                      </div>
                    </div>
                  </div>

                  <aside className="rounded-[1.5rem] border border-border/70 bg-background/65 px-4 py-4 lg:px-5">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground" style={{ fontFamily: PLEX_MONO }}>
                      {t('debt.client.collectionPulse')}
                    </p>
                    <div className="mt-4 space-y-4">
                      <PulseRow
                        label={t('debt.client.currentExposure')}
                        value={`${formatNumber(totalDebt)} USD`}
                        tone="critical"
                      />
                      <PulseRow
                        label={t('debt.client.lastContactOutcome')}
                        value={latestContact ? t(`debt.outcomes.${latestContact.outcome}`, latestContact.outcome) : '—'}
                      />
                      <PulseRow
                        label={t('debt.client.followUpDue')}
                        value={latestContact?.follow_up_date ? formatLongDate(latestContact.follow_up_date, i18n.language) : '—'}
                      />
                      <PulseRow
                        label={t('debt.client.recentPromise')}
                        value={latestPromised
                          ? [
                              latestPromised.promised_amount ? formatCurrency(latestPromised.promised_amount, null) : null,
                              latestPromised.promised_by_date
                                ? formatShortDate(latestPromised.promised_by_date, i18n.language)
                                : null,
                            ].filter(Boolean).join(' · ')
                          : t('debt.client.noPromise')}
                      />
                    </div>
                  </aside>
                </div>
              </section>

              <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-12">
                <aside className="space-y-5 xl:col-span-4 2xl:col-span-3 xl:sticky xl:top-20 self-start animate-fade-up animate-fade-up-delay-3">
                  <SectionShell title={t('debt.client.contact')}>
                    <div className="space-y-4">
                      <InfoBlock icon={Phone} label={t('debt.client.phone')} value={contact.main_phone} />
                      <InfoBlock icon={MessageCircle} label="Telegram" value={contact.telegram} />
                      <InfoBlock
                        icon={MapPin}
                        label={t('debt.client.address')}
                        value={[contact.region_name, contact.address].filter(Boolean).join(', ') || null}
                      />
                      <InfoBlock icon={User} label={t('debt.client.manager')} value={contact.owner_name} />
                      <InfoBlock icon={Building} label={t('debt.client.deliveryAddresses')} value={contact.delivery_addresses} />
                    </div>
                  </SectionShell>

                  <SectionShell title={t('debt.client.entityProfile')}>
                    <div className="space-y-3">
                      <MetaPair label={t('debt.client.parent')} value={contact.parent_name} />
                      <MetaPair label={t('debt.client.category')} value={contact.category} />
                      <MetaPair label={t('debt.client.state')} value={contact.state_name} />
                      <MetaPair label={t('debt.client.since')} value={contact.created_on ? formatLongDate(contact.created_on, i18n.language) : null} />
                      <MetaPair label={t('debt.client.modifiedOn')} value={contact.modified_on ? formatLongDate(contact.modified_on, i18n.language) : null} />
                    </div>
                    {contact.note && (
                      <div className="mt-4 rounded-xl border border-border/60 bg-background/70 px-4 py-3">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground" style={{ fontFamily: PLEX_MONO }}>
                          {t('debt.client.note')}
                        </p>
                        <p className="mt-2 text-sm italic text-foreground/85" style={{ fontFamily: DM_SANS }}>
                          {contact.note}
                        </p>
                      </div>
                    )}
                  </SectionShell>
                </aside>

                <div className="space-y-5 xl:col-span-8 2xl:col-span-9">
                  <section className="rounded-[1.5rem] border border-border/70 bg-card px-5 py-5 lg:px-6 animate-fade-up animate-fade-up-delay-3">
                    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                      <div>
                        <SectionHeader
                          title={t('debt.client.financialBase')}
                          aside={`${data.orders_total} ${t('debt.client.ordersCount')} · ${data.payments_total} ${t('debt.client.paymentsCount')}`}
                        />
                        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
                          <MetricTile label={t('debt.client.grossInvoiced')} value={formatNumber(aging.gross_invoiced)} />
                          <MetricTile label={t('debt.client.grossPaid')} value={formatNumber(aging.gross_paid)} tone="monitor" />
                          <MetricTile label={t('debt.client.openingDebt')} value={formatNumber(aging.opening_debt)} />
                          <MetricTile label={t('debt.client.openingCredit')} value={formatNumber(aging.opening_credit)} tone="plan" />
                          <MetricTile label={t('debt.client.currentExposure')} value={formatNumber(totalDebt)} tone="critical" />
                        </div>
                      </div>

                      <div>
                        <SectionHeader title={t('debt.client.agingMix')} aside={oldestBucket ?? '—'} />
                        <div className="mt-4 space-y-3">
                          <AgingRow label={t('debt.aging.current')} value={aging.aging_0_30} total={totalDebt} />
                          <AgingRow label="30–60" value={aging.aging_30_60} total={totalDebt} tone="markdown" />
                          <AgingRow label="60–90" value={aging.aging_60_90} total={totalDebt} tone="urgent" />
                          <AgingRow label="90+" value={aging.aging_90_plus} total={totalDebt} tone="critical" />
                        </div>
                      </div>
                    </div>
                  </section>

                  <div className="grid grid-cols-1 gap-5 2xl:grid-cols-2">
                    <TimelinePanel
                      title={t('debt.client.recentTrade')}
                      totalLabel={`${data.orders_total} · ${formatNumber(data.orders_sum)} USD`}
                      loading={isLoading}
                      isEmpty={orders.length === 0}
                      empty={t('debt.client.noOrders')}
                      footer={data.orders_total > 20 ? (
                        <Pager
                          offset={ordersOffset}
                          limit={20}
                          total={data.orders_total}
                          onChange={(next) => setOffset('orders_offset', next)}
                        />
                      ) : null}
                    >
                      <ul className="space-y-2.5" style={{ fontFamily: DM_SANS }}>
                        {orders.map((order, index) => (
                          <OrderItem key={`${order.deal_id}-${index}`} order={order} lang={i18n.language} />
                        ))}
                      </ul>
                    </TimelinePanel>

                    <TimelinePanel
                      title={t('debt.client.paymentRhythm')}
                      totalLabel={`${data.payments_total} · ${formatNumber(data.payments_sum)} USD`}
                      loading={isLoading}
                      isEmpty={payments.length === 0}
                      empty={t('debt.client.noPayments')}
                      footer={data.payments_total > 20 ? (
                        <Pager
                          offset={paymentsOffset}
                          limit={20}
                          total={data.payments_total}
                          onChange={(next) => setOffset('payments_offset', next)}
                        />
                      ) : null}
                    >
                      <ul className="space-y-2.5" style={{ fontFamily: DM_SANS }}>
                        {payments.map((payment, index) => (
                          <PaymentItem key={`${payment.payment_id}-${index}`} payment={payment} lang={i18n.language} />
                        ))}
                      </ul>
                    </TimelinePanel>
                  </div>

                  <section className="rounded-[1.5rem] border border-border/70 bg-card px-5 py-5 lg:px-6 animate-fade-up animate-fade-up-delay-4">
                    <div className="flex flex-col gap-3 border-b border-border/60 pb-4 lg:flex-row lg:items-end lg:justify-between">
                      <div>
                        <span className="section-title">{t('debt.client.contactLog')}</span>
                        <p className="mt-2 text-sm text-muted-foreground" style={{ fontFamily: DM_SANS }}>
                          {t('debt.client.contactLogSubtitle')}
                        </p>
                      </div>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingEntry(null)
                            setLogModalOpen(true)
                          }}
                          className="inline-flex items-center gap-1.5 rounded-full border border-[#D4A843]/30 bg-[#D4A843]/10 px-3 py-2 text-xs font-medium text-[#9E7B2F] transition-colors hover:bg-[#D4A843]/15 hover:text-[#7A5E20]"
                          style={{ fontFamily: DM_SANS }}
                        >
                          <Plus size={12} />
                          {t('debt.client.logContact')}
                        </button>
                      )}
                    </div>

                    {isLoading ? (
                      <div className="mt-5 space-y-3">
                        {Array.from({ length: 4 }).map((_, index) => (
                          <div key={index} className="shimmer-skeleton h-20 w-full rounded-2xl" />
                        ))}
                      </div>
                    ) : contactLog.length === 0 ? (
                      <div className="mt-6">
                        <p className="text-base italic text-muted-foreground" style={{ fontFamily: PLAYFAIR }}>
                          {t('debt.client.noContacts')}
                        </p>
                      </div>
                    ) : (
                      <ul className="mt-5 space-y-3">
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
                  </section>
                </div>
              </div>
            </>
          ) : null}
        </>
      )}

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

function HeaderChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/75 px-3 py-1.5 text-[11px] text-foreground">
      <span className="uppercase tracking-[0.14em] text-muted-foreground" style={{ fontFamily: PLEX_MONO }}>
        {label}
      </span>
      <span style={{ fontFamily: DM_SANS }}>{value}</span>
    </span>
  )
}

function SignalMetric({
  label,
  value,
  suffix,
  tone = 'default',
}: {
  label: string
  value: string
  suffix?: string
  tone?: 'default' | 'critical' | 'monitor'
}) {
  return (
    <div className="rounded-[1.25rem] border border-border/60 bg-background/70 px-4 py-4">
      <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground" style={{ fontFamily: PLEX_MONO }}>
        {label}
      </p>
      <p
        className={cn(
          'mt-3 text-2xl font-semibold tracking-tight',
          tone === 'critical' && 'text-[#F87171]',
          tone === 'monitor' && 'text-[#34D399]',
        )}
        style={{ fontFamily: PLAYFAIR }}
      >
        {value}
      </p>
      {suffix && (
        <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground" style={{ fontFamily: PLEX_MONO }}>
          {suffix}
        </p>
      )}
    </div>
  )
}

function PulseRow({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: string
  tone?: 'default' | 'critical'
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/50 pb-4 last:border-b-0 last:pb-0">
      <span className="text-sm text-muted-foreground" style={{ fontFamily: DM_SANS }}>
        {label}
      </span>
      <span
        className={cn('text-right text-sm font-medium', tone === 'critical' && 'text-[#F87171]')}
        style={{ fontFamily: DM_SANS }}
      >
        {value}
      </span>
    </div>
  )
}

function SectionShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-[1.5rem] border border-border/70 bg-card px-5 py-5 lg:px-6">
      <span className="section-title">{title}</span>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function SectionHeader({ title, aside }: { title: string; aside?: string }) {
  return (
    <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
      <span className="section-title flex-1">{title}</span>
      {aside && (
        <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground" style={{ fontFamily: PLEX_MONO }}>
          {aside}
        </span>
      )}
    </div>
  )
}

function MetricTile({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: string
  tone?: 'default' | 'monitor' | 'plan' | 'critical'
}) {
  return (
    <div className="rounded-[1.2rem] border border-border/60 bg-background/70 px-4 py-4">
      <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground" style={{ fontFamily: PLEX_MONO }}>
        {label}
      </p>
      <p
        className={cn(
          'mt-3 text-xl font-semibold tracking-tight',
          tone === 'monitor' && 'text-[#34D399]',
          tone === 'plan' && 'text-[#60A5FA]',
          tone === 'critical' && 'text-[#F87171]',
        )}
        style={{ fontFamily: PLAYFAIR }}
      >
        {value}
      </p>
    </div>
  )
}

function AgingRow({
  label,
  value,
  total,
  tone,
}: {
  label: string
  value: number
  total: number
  tone?: 'markdown' | 'urgent' | 'critical'
}) {
  const pct = total > 0 ? (value / total) * 100 : 0
  const color =
    tone === 'critical'
      ? '#F87171'
      : tone === 'urgent'
        ? '#FB923C'
        : tone === 'markdown'
          ? '#FBBF24'
          : '#D4A843'

  return (
    <div className="grid grid-cols-[72px_1fr_auto] items-center gap-3">
      <span className="text-xs text-muted-foreground" style={{ fontFamily: PLEX_MONO }}>
        {label}
      </span>
      <div className="h-2 rounded-full bg-background/80 overflow-hidden">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${Math.max(4, Math.min(pct, 100))}%`, backgroundColor: color }}
        />
      </div>
      <span
        className={cn(
          'text-sm font-semibold tabular-nums',
          tone === 'critical' && 'text-[#F87171]',
          tone === 'urgent' && 'text-[#FB923C]',
          tone === 'markdown' && 'text-[#FBBF24]',
        )}
        style={{ fontFamily: PLAYFAIR }}
      >
        {value > 0 ? formatNumber(value) : '—'}
      </span>
    </div>
  )
}

function InfoBlock({
  icon: Icon,
  label,
  value,
}: {
  icon: ElementType
  label: string
  value: string | null
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background/75 text-muted-foreground">
        <Icon size={14} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground" style={{ fontFamily: PLEX_MONO }}>
          {label}
        </p>
        <p className="mt-1 text-sm text-foreground break-words" style={{ fontFamily: DM_SANS }}>
          {value || '—'}
        </p>
      </div>
    </div>
  )
}

function MetaPair({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/40 pb-3 last:border-b-0 last:pb-0">
      <span className="text-sm text-muted-foreground" style={{ fontFamily: DM_SANS }}>
        {label}
      </span>
      <span className="text-sm text-right text-foreground" style={{ fontFamily: DM_SANS }}>
        {value || '—'}
      </span>
    </div>
  )
}

function TimelinePanel({
  title,
  totalLabel,
  loading,
  isEmpty,
  empty,
  children,
  footer,
}: {
  title: string
  totalLabel?: string
  loading: boolean
  isEmpty: boolean
  empty: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <section className="rounded-[1.5rem] border border-border/70 bg-card px-5 py-5 lg:px-6 animate-fade-up animate-fade-up-delay-4">
      <SectionHeader title={title} aside={totalLabel} />
      <div className="mt-4">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="shimmer-skeleton h-16 w-full rounded-2xl" />
            ))}
          </div>
        ) : isEmpty ? (
          <p className="text-base italic text-muted-foreground" style={{ fontFamily: PLAYFAIR }}>
            {empty}
          </p>
        ) : (
          children
        )}
      </div>
      {footer}
    </section>
  )
}

function OrderItem({ order, lang }: { order: ClientOrder; lang: string }) {
  return (
    <li className="rounded-[1.25rem] border border-border/60 bg-background/70 px-4 py-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{order.product_name}</p>
          <p className="mt-1 text-[11px] text-muted-foreground" style={{ fontFamily: PLEX_MONO }}>
            #{order.deal_id} · {order.room_name ?? '—'} · {formatNumber(order.sold_quant)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold" style={{ fontFamily: PLAYFAIR }}>
            {formatNumber(order.product_amount)}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground" style={{ fontFamily: PLEX_MONO }}>
            {formatShortDate(order.delivery_date, lang)}
          </p>
        </div>
      </div>
    </li>
  )
}

function PaymentItem({ payment, lang }: { payment: ClientPayment; lang: string }) {
  return (
    <li className="rounded-[1.25rem] border border-border/60 bg-background/70 px-4 py-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            {payment.payment_method ?? '—'}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground" style={{ fontFamily: PLEX_MONO }}>
            {payment.payer || '—'}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold text-[#34D399]" style={{ fontFamily: PLAYFAIR }}>
            +{formatNumber(payment.amount)}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground" style={{ fontFamily: PLEX_MONO }}>
            {formatShortDate(payment.payment_date, lang)}
          </p>
        </div>
      </div>
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
    <li className="rounded-[1.35rem] border border-border/70 bg-background/75 px-4 py-4" style={{ fontFamily: DM_SANS }}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`action-badge ${outcomeBadgeVariant(entry.outcome)}`}>
              {t(`debt.outcomes.${entry.outcome}`, entry.outcome)}
            </span>
            <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground" style={{ fontFamily: PLEX_MONO }}>
              {entry.author_username ?? '—'} · {formatShortDate(entry.created_at, lang)}
            </span>
          </div>
          {(entry.promised_amount || entry.promised_by_date || entry.follow_up_date) && (
            <p className="mt-3 text-sm text-muted-foreground">
              {entry.promised_amount && (
                <span className="font-semibold text-foreground" style={{ fontFamily: PLAYFAIR }}>
                  {formatCurrency(entry.promised_amount, null)}
                </span>
              )}
              {entry.promised_by_date && (
                <span className="ml-2">{t('debt.client.by')} {formatShortDate(entry.promised_by_date, lang)}</span>
              )}
              {entry.follow_up_date && (
                <span className="ml-2">· {t('debt.client.followUp')} {formatShortDate(entry.follow_up_date, lang)}</span>
              )}
            </p>
          )}
          <p className="mt-3 text-sm leading-relaxed text-foreground/85 italic">
            {entry.note || '—'}
          </p>
        </div>

        {canEditEntry && (
          <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.12em]">
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-[#9E7B2F]"
            >
              <Edit2 size={10} />
              {t('common.edit')}
            </button>
            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-red-500"
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
                <button type="button" onClick={() => setConfirmDelete(false)} className="text-muted-foreground">
                  {t('common.cancel')}
                </button>
              </span>
            )}
          </div>
        )}
      </div>
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

function oldestBucketFromAging(aging: ClientAging): 'current' | '30-60' | '60-90' | '90+' | null {
  if (aging.aging_90_plus > 0) return '90+'
  if (aging.aging_60_90 > 0) return '60-90'
  if (aging.aging_30_60 > 0) return '30-60'
  if (aging.aging_0_30 > 0) return 'current'
  return null
}

function HeroSkeleton() {
  return (
    <div className="mt-5 space-y-5 animate-fade-up animate-fade-up-delay-1">
      <div className="shimmer-skeleton h-4 w-28" />
      <div className="shimmer-skeleton h-14 w-3/5" />
      <div className="rounded-[1.75rem] border border-border/70 bg-card px-5 py-5">
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.4fr_0.9fr]">
          <div className="space-y-4">
            <div className="flex gap-2">
              <div className="shimmer-skeleton h-8 w-28 rounded-full" />
              <div className="shimmer-skeleton h-8 w-20 rounded-full" />
            </div>
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="shimmer-skeleton h-26 w-full rounded-[1.25rem]" />
              ))}
            </div>
          </div>
          <div className="shimmer-skeleton h-52 w-full rounded-[1.5rem]" />
        </div>
      </div>
    </div>
  )
}

function InlineState({
  title,
  description,
  backLabel,
}: {
  title: string
  description: string
  backLabel: string
}) {
  return (
    <div className="py-20 text-center animate-fade-up">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-red-500">
        <AlertTriangle size={24} />
      </div>
      <h2 className="mb-2 text-xl font-bold" style={{ fontFamily: PLAYFAIR }}>
        {title}
      </h2>
      <p className="mb-6 text-sm text-muted-foreground" style={{ fontFamily: DM_SANS }}>
        {description}
      </p>
      <Link
        to="/collection/clients"
        className="inline-flex items-center gap-1.5 text-xs text-[#9E7B2F] transition-colors hover:text-[#7A5E20]"
        style={{ fontFamily: DM_SANS }}
      >
        <ArrowLeft size={12} />
        {backLabel}
      </Link>
    </div>
  )
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
  onChange: (nextOffset: number) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="mt-4 flex items-center justify-between gap-4 text-[10px] uppercase tracking-[0.14em]" style={{ fontFamily: DM_SANS }}>
      <span className="text-xs italic normal-case tracking-normal text-muted-foreground">
        {offset + 1}–{Math.min(offset + limit, total)} {t('data.of')} {total.toLocaleString()}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={offset === 0}
          onClick={() => onChange(Math.max(0, offset - limit))}
          className="rounded px-2 py-1 transition-colors hover:bg-accent/60 disabled:opacity-30"
        >
          ‹
        </button>
        <button
          type="button"
          disabled={offset + limit >= total}
          onClick={() => onChange(offset + limit)}
          className="rounded px-2 py-1 transition-colors hover:bg-accent/60 disabled:opacity-30"
        >
          ›
        </button>
      </div>
    </div>
  )
}

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
  const [promisedAmount, setPromisedAmount] = useState(existing?.promised_amount ? String(existing.promised_amount) : '')
  const [promisedByDate, setPromisedByDate] = useState(existing?.promised_by_date ?? '')
  const [followUpDate, setFollowUpDate] = useState(existing?.follow_up_date ?? '')
  const [note, setNote] = useState(existing?.note ?? '')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const isPending = logMut.isPending || updateMut.isPending

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
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
        className="fixed left-1/2 top-1/2 z-40 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-[1.5rem] border border-border bg-card p-6 shadow-xl animate-fade-up lg:p-7"
        style={{ fontFamily: DM_SANS }}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-2xl font-semibold leading-none" style={{ fontFamily: PLAYFAIR }}>
            {existing ? t('debt.client.editContact') : t('debt.client.logContact')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 -m-1 text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
            aria-label={t('common.close')}
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <Field label={t('debt.client.outcome')}>
            <select value={outcome} onChange={(event) => setOutcome(event.target.value)} className="inv-filter w-full">
              {OUTCOMES.map((item) => (
                <option key={item} value={item}>
                  {t(`debt.outcomes.${item}`)}
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
                onChange={(event) => setPromisedAmount(event.target.value)}
                placeholder="0"
                className="inv-filter w-full"
              />
            </Field>
            <Field label={t('debt.client.promisedBy')}>
              <input
                type="date"
                value={promisedByDate}
                onChange={(event) => setPromisedByDate(event.target.value)}
                className="inv-filter w-full"
              />
            </Field>
          </div>

          <Field label={t('debt.client.followUpDate')}>
            <input
              type="date"
              value={followUpDate}
              onChange={(event) => setFollowUpDate(event.target.value)}
              className="inv-filter w-full"
            />
          </Field>

          <Field label={t('debt.client.note')}>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              placeholder={t('debt.client.notePlaceholder')}
              className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm focus:border-[#9E7B2F]/40 focus:outline-none focus:ring-2 focus:ring-[#9E7B2F]/10"
            />
          </Field>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-500">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded bg-[#D4A843] px-3.5 py-1.5 text-xs font-semibold text-black transition-colors hover:bg-[#C49833] disabled:cursor-not-allowed disabled:bg-[#D4A843]/30"
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground" style={{ fontFamily: DM_SANS }}>
        {label}
      </span>
      {children}
    </label>
  )
}
