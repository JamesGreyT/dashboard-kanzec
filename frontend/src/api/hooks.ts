import { useQuery, useMutation, useQueryClient, type UseQueryOptions } from '@tanstack/react-query'
import api from '@/api/client'

// ── Shared types ──────────────────────────────────────────────────────────

export type Column = {
  name: string
  label: string
  type: 'date' | 'timestamp' | 'text' | 'int' | 'numeric'
  ops: string[]
  visible: boolean
  numeric: boolean
  id_column: boolean
  currency: string | null
}

export type TableSchema = {
  key: string
  label: string
  pk: string[]
  default_sort: { field: string; dir: 'asc' | 'desc' }[]
  columns: Column[]
}

export type RowsResponse = {
  rows: Record<string, unknown>[]
  total: number
  limit: number
  offset: number
}

export type DistinctResponse = {
  values: { value: string; count: number }[]
  limited: boolean
}

export type FilterTriple = { col: string; op: string; value: string }

export function buildRowsQuery(params: {
  limit?: number
  offset?: number
  sort?: string
  search?: string
  filters?: FilterTriple[]
}): URLSearchParams {
  const qs = new URLSearchParams()
  if (params.limit !== undefined) qs.set('limit', String(params.limit))
  if (params.offset !== undefined) qs.set('offset', String(params.offset))
  if (params.sort) qs.set('sort', params.sort)
  if (params.search) qs.set('search', params.search)
  for (const f of params.filters ?? []) {
    qs.append('f', `${f.col}:${f.op}:${f.value}`)
  }
  return qs
}

// ── Dashboard ─────────────────────────────────────────────────────────────

export type DashboardOverview = {
  today: {
    orders: { count: number; amount: number }
    payments: { count: number; amount: number }
  }
  yesterday: {
    orders: { count: number; amount: number }
    payments: { amount: number }
  }
  week: { orders_amount: number }
  active_clients_30d: number
  series_30d: { day: string; orders: number; payments: number }[]
  worker_health: { key: string; last_recent_at: string | null }[]
  recent_activity: { kind: 'order' | 'payment'; ts: string; subject: string; amount: number | null }[]
}

export function useDashboardOverview() {
  return useQuery({
    queryKey: ['dashboard', 'overview'],
    queryFn: async () => (await api.get<DashboardOverview>('/dashboard/overview')).data,
  })
}

// ── Debt previews (worklist + prepayments, limit=1 for dashboard cards) ───

export type DebtRow = {
  person_id: number
  name: string
  tin: string | null
  main_phone: string | null
  telegram: string | null
  address: string | null
  region_name: string | null
  category: string | null
  direction: string | null
  owner_name: string | null
  gross_invoiced: number
  gross_paid: number
  outstanding: number
  opening_debt: number
  opening_credit: number
  last_order_date: string | null
  order_count: number
  last_payment_date: string | null
  pay_count: number
  days_since_payment: number | null
  aging_0_30: number
  aging_30_60: number
  aging_60_90: number
  aging_90_plus: number
  primary_room_id: string | null
  primary_room_name: string | null
  last_contact_outcome: string | null
  last_contact_at: string | null
  last_promised_amount: number | null
  last_promised_by_date: string | null
  last_follow_up_date: string | null
  last_contact_by: string | null
  has_overdue_promise: boolean
  priority: number | string | null
}

export type DebtSummary = {
  debtor_count: number
  debtor_over_90_count: number
  total_outstanding: number
  total_over_90: number
  total_overdue_promises: number
}

export type DebtByCollector = {
  room_id: string
  room_name: string
  debtors_count: number
  outstanding: number
  over_90: number
  collected_mtd: number
}

export type DebtListResponse = {
  summary?: DebtSummary
  by_collector?: DebtByCollector[]
  rows: DebtRow[]
  total: number
}

/**
 * /debt/prepayments returns a leaner row — clients in credit, not debt.
 * No aging buckets, no contact log fields. `credit_balance` is the surplus
 * (paid - invoiced); positive means we owe them goods.
 */
export type PrepaymentRow = {
  person_id: number
  name: string
  tin: string | null
  region_name: string | null
  gross_invoiced: number
  gross_paid: number
  credit_balance: number
  last_payment_date: string | null
}

export type PrepaymentListResponse = {
  rows: PrepaymentRow[]
  total: number
}

/**
 * Pick the aging bucket label given a worklist row. The backend doesn't return
 * a single 'aging_bucket' field — it spreads across four columns. We classify
 * by which bucket holds the largest non-zero share, then map to the
 * .action-badge variant via formatNumber/agingBadgeVariant.
 */
export function dominantAgingBucket(row: Pick<DebtRow, 'aging_0_30' | 'aging_30_60' | 'aging_60_90' | 'aging_90_plus'>):
  | 'current'
  | '30-60'
  | '60-90'
  | '90+' {
  const buckets: { label: 'current' | '30-60' | '60-90' | '90+'; v: number }[] = [
    { label: '90+', v: row.aging_90_plus },
    { label: '60-90', v: row.aging_60_90 },
    { label: '30-60', v: row.aging_30_60 },
    { label: 'current', v: row.aging_0_30 },
  ]
  // Priority order: 90+ first, then 60-90, etc. — collectors care about the
  // worst bucket, not the largest. Return the first non-zero in that order.
  for (const b of buckets) {
    if (b.v > 0) return b.label
  }
  return 'current'
}

export function useDebtWorklistPreview() {
  return useQuery({
    queryKey: ['debt', 'worklist', { limit: 1 }],
    queryFn: async () =>
      (await api.get<DebtListResponse>('/debt/worklist', { params: { limit: 1 } })).data,
  })
}

export function useDebtPrepaymentsPreview() {
  return useQuery({
    queryKey: ['debt', 'prepayments', { limit: 1 }],
    queryFn: async () =>
      (await api.get<PrepaymentListResponse>('/debt/prepayments', { params: { limit: 1 } })).data,
  })
}

// ── Full debt-collection hooks (Session 3) ────────────────────────────────

export type WorklistFilters = {
  limit?: number
  offset?: number
  search?: string
  sales_manager_room_id?: string
  region?: string
  category?: string
  direction?: string
  aging_bucket?: string
  outcome?: string
  overdue_promises_only?: boolean
}

function paramsFor(p: WorklistFilters): Record<string, string | number | boolean | undefined> {
  return {
    limit: p.limit,
    offset: p.offset,
    search: p.search || undefined,
    sales_manager_room_id: p.sales_manager_room_id || undefined,
    region: p.region || undefined,
    category: p.category || undefined,
    direction: p.direction || undefined,
    aging_bucket: p.aging_bucket || undefined,
    outcome: p.outcome || undefined,
    overdue_promises_only: p.overdue_promises_only ? true : undefined,
  }
}

export function useDebtWorklist(filters: WorklistFilters) {
  return useQuery({
    queryKey: ['debt', 'worklist', filters],
    queryFn: async () =>
      (await api.get<DebtListResponse>('/debt/worklist', { params: paramsFor(filters) })).data,
    placeholderData: (prev) => prev,
  })
}

export function useDebtPrepayments(filters: { limit?: number; offset?: number; search?: string }) {
  return useQuery({
    queryKey: ['debt', 'prepayments', filters],
    queryFn: async () =>
      (await api.get<PrepaymentListResponse>('/debt/prepayments', { params: filters })).data,
    placeholderData: (prev) => prev,
  })
}

// ── Clients aging (the third worklist tab) ────────────────────────────────

export type ClientsAgingRow = {
  person_id: number
  client_name: string
  tin: string | null
  region_name: string | null
  category: string | null
  direction: string | null
  client_group: string | null
  term_days: number | null
  opening_debt: number
  opening_credit: number
  sotuv: number
  vozrat: number
  tolov: number
  total_credits: number
  total_debt: number
  qarz: number
  not_due: number
  overdue: number
  bucket_1_30: number
  bucket_31_60: number
  bucket_61_90: number
  bucket_90_plus: number
  overdue_0: number
  overdue_30: number
  overdue_60: number
  overdue_90: number
  last_order_date: string | null
  last_payment_date: string | null
  primary_room_id: string | null
  manager: string | null
}

export type ClientsAgingResponse = {
  rows: ClientsAgingRow[]
  total: number
  summary?: Record<string, number>
  default_term_days?: number
}

export function useDebtClientsAging(filters: WorklistFilters) {
  return useQuery({
    queryKey: ['debt', 'clients-aging', filters],
    queryFn: async () =>
      (await api.get<ClientsAgingResponse>('/debt/clients-aging', { params: paramsFor(filters) })).data,
    placeholderData: (prev) => prev,
  })
}

// ── Promise stats (currently lean — by_outcome aggregate; surface later) ──

export type PromiseStats = {
  by_outcome: { outcome: string; count: number; total: number }[]
}

export function useDebtPromiseStats() {
  return useQuery({
    queryKey: ['debt', 'promise-stats'],
    queryFn: async () => (await api.get<PromiseStats>('/debt/promise-stats')).data,
  })
}

// ── Single client detail ──────────────────────────────────────────────────

export type ClientContact = {
  person_id: number
  name: string
  tin: string | null
  short_name: string | null
  code: string | null
  main_phone: string | null
  telegram: string | null
  address: string | null
  post_address: string | null
  delivery_addresses: string | null
  region_country_name: string | null
  region_region_name: string | null
  region_name: string | null
  region_district_name: string | null
  region_town_name: string | null
  group1: string | null
  category: string | null
  type3: string | null
  owner_name: string | null
  owner_short_name: string | null
  parent_name: string | null
  state_name: string | null
  note: string | null
  latlng: string | null
  created_on: string | null
  modified_on: string | null
}

export type ClientAging = {
  gross_invoiced: number
  gross_paid: number
  opening_debt: number
  opening_credit: number
  aging_0_30: number
  aging_30_60: number
  aging_60_90: number
  aging_90_plus: number
}

export type ClientOrder = {
  delivery_date: string
  deal_id: string | number
  room_id: string | null
  room_name: string | null
  sales_manager: string | null
  product_name: string
  sold_quant: number
  product_amount: number
}

export type ClientPayment = {
  payment_date: string
  payment_id: number | string
  payer: string | null
  payment_method: string | null
  currency: string | null
  amount: number
}

export type ContactLogEntry = {
  id: number
  outcome: string
  promised_amount: number | null
  promised_by_date: string | null
  follow_up_date: string | null
  note: string | null
  author_username: string | null
  author_id: number | null
  created_at: string
  updated_at: string | null
}

export type ClientDetail = {
  contact: ClientContact
  aging: ClientAging
  orders: ClientOrder[]
  orders_total: number
  orders_sum: number
  payments: ClientPayment[]
  payments_total: number
  payments_sum: number
  contact_log: ContactLogEntry[]
}

export function useDebtClient(
  personId: number | null,
  pagination?: { orders_offset?: number; orders_limit?: number; payments_offset?: number; payments_limit?: number },
) {
  const params = {
    orders_offset: pagination?.orders_offset ?? 0,
    orders_limit: pagination?.orders_limit ?? 20,
    payments_offset: pagination?.payments_offset ?? 0,
    payments_limit: pagination?.payments_limit ?? 20,
  }
  return useQuery({
    queryKey: ['debt', 'client', personId, params],
    queryFn: async () =>
      (await api.get<ClientDetail>(`/debt/client/${personId}`, { params })).data,
    enabled: personId !== null,
    placeholderData: (prev) => prev,
  })
}

// ── Contact log mutations ─────────────────────────────────────────────────

export type ContactPayload = {
  outcome: string
  promised_amount?: number | null
  promised_by_date?: string | null
  follow_up_date?: string | null
  note?: string | null
}

export function useLogContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ personId, payload }: { personId: number; payload: ContactPayload }) => {
      const res = await api.post<ContactLogEntry>(`/debt/client/${personId}/contact`, payload)
      return res.data
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['debt', 'client', variables.personId] })
      qc.invalidateQueries({ queryKey: ['debt', 'worklist'] })
    },
  })
}

export function useUpdateContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ entryId, payload }: { entryId: number; payload: ContactPayload }) => {
      const res = await api.patch<ContactLogEntry>(`/contact/${entryId}`, payload)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['debt', 'client'] })
      qc.invalidateQueries({ queryKey: ['debt', 'worklist'] })
    },
  })
}

export function useDeleteContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (entryId: number) => {
      await api.delete(`/contact/${entryId}`)
      return entryId
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['debt', 'client'] })
      qc.invalidateQueries({ queryKey: ['debt', 'worklist'] })
    },
  })
}

// ── Sales RFM (top segment summary on dashboard) ──────────────────────────

export type RfmRow = {
  person_id: number
  name: string
  direction: string | null
  region: string | null
  last_order_date: string | null
  days_since: number | null
  deals: number
  revenue: number
  r: number
  f: number
  m: number
  score: string
  segment: string
}

export type RfmSegmentDistribution = {
  segment: string
  clients: number
  revenue: number
}

export type RfmResponse = {
  rows: RfmRow[]
  total: number
  page: number
  size: number
  sort: string
  totals: { revenue: number; deals: number }
  segment_distribution: RfmSegmentDistribution[]
}

/**
 * For the dashboard segment summary we don't need any rows — we only need the
 * `segment_distribution` server-side aggregate. Request size=1 so we don't
 * pay for the full payload.
 */
export function useSalesRfmSummary() {
  return useQuery({
    queryKey: ['sales', 'rfm', { size: 1 }],
    queryFn: async () =>
      (await api.get<RfmResponse>('/sales/rfm', { params: { size: 1, page: 0 } })).data,
  })
}

// ── Dayslice projection (admin only — caller must gate) ───────────────────

export type DaysliceProjection = {
  slice: { month_start: string; as_of: string; day_n: number; month_days: number }
  history: { year: number; mtd: number; month_total: number; ratio: number }[]
  current_mtd: { sotuv: number; kirim: number }
  projection: {
    sotuv: { min: number; mean: number; max: number }
    kirim: { min: number; mean: number; max: number }
  }
}

export function useDaysliceProjection(opts: { enabled: boolean }) {
  return useQuery({
    queryKey: ['dayslice', 'projection'],
    queryFn: async () => (await api.get<DaysliceProjection>('/dayslice/projection')).data,
    enabled: opts.enabled,
  })
}

// ── Snapshots / rooms ─────────────────────────────────────────────────────

export function useSnapshotsDirections() {
  return useQuery({
    queryKey: ['snapshots', 'directions'],
    queryFn: async () =>
      (await api.get<{ directions: string[] }>('/snapshots/directions')).data.directions,
  })
}

export type Room = { room_id: string; room_code: string; room_name: string; seen_at: string }

export function useRooms() {
  return useQuery({
    queryKey: ['rooms'],
    queryFn: async () =>
      (await api.get<{ rooms: Room[] }>('/rooms')).data.rooms,
  })
}

// ── Data viewer hooks ─────────────────────────────────────────────────────

export function useDataTables() {
  return useQuery({
    queryKey: ['data', 'tables'],
    queryFn: async () =>
      (await api.get<{ tables: TableSchema[] }>('/data/tables')).data.tables,
    staleTime: 60 * 60 * 1000, // schema doesn't change in a session
  })
}

export function useDataRows(
  key: string,
  params: { limit: number; offset: number; sort?: string; search?: string; filters?: FilterTriple[] },
  options?: Pick<UseQueryOptions<RowsResponse>, 'enabled'>,
) {
  const qs = buildRowsQuery(params)
  return useQuery({
    queryKey: ['data', key, 'rows', params],
    queryFn: async () =>
      (await api.get<RowsResponse>(`/data/${key}/rows?${qs.toString()}`)).data,
    placeholderData: (prev) => prev, // keep previous page visible while next loads
    enabled: options?.enabled ?? true,
  })
}

export function useDataDistinct(
  key: string,
  column: string,
  q: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ['data', key, 'distinct', column, q],
    queryFn: async () =>
      (
        await api.get<DistinctResponse>(`/data/${key}/distinct/${column}`, {
          params: { q: q || undefined, limit: 200 },
        })
      ).data,
    enabled: (options?.enabled ?? true) && !!column,
  })
}

export function useDataRow(key: string, pk: string | null) {
  return useQuery({
    queryKey: ['data', key, 'row', pk],
    queryFn: async () =>
      (await api.get<Record<string, unknown>>(`/data/${key}/row/${pk}`)).data,
    enabled: !!pk,
  })
}

export function dataExportHref(
  key: string,
  params: { sort?: string; search?: string; filters?: FilterTriple[] },
): string {
  const qs = buildRowsQuery(params)
  qs.set('format', 'xlsx')
  return `/api/data/${key}/export?${qs.toString()}`
}

// ── Legal persons editable ─────────────────────────────────────────────────

export type LegalPersonPatchResult = Record<string, unknown>

type EditableField = 'direction' | 'instalment-days' | 'group'

const PATCH_BODY_KEY: Record<EditableField, string> = {
  direction: 'direction',
  'instalment-days': 'instalment_days',
  group: 'client_group',
}

export function useUpdateLegalPersonField(field: EditableField) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ personId, value }: { personId: number; value: string | number }) => {
      const body = { [PATCH_BODY_KEY[field]]: value }
      const res = await api.patch<LegalPersonPatchResult>(
        `/data/legal-persons/${personId}/${field}`,
        body,
      )
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['data', 'legal_person'] })
      qc.invalidateQueries({ queryKey: ['data', 'legal-persons'] })
    },
  })
}

export function useLegalPersonsDirections() {
  return useQuery({
    queryKey: ['legal-persons', 'directions'],
    queryFn: async () =>
      (await api.get<{ directions: string[] }>('/data/legal-persons/directions')).data.directions,
    staleTime: 60 * 60 * 1000,
  })
}

export function useLegalPersonsGroups() {
  return useQuery({
    queryKey: ['legal-persons', 'groups'],
    queryFn: async () =>
      (await api.get<{ groups: string[] }>('/data/legal-persons/groups')).data.groups,
    staleTime: 60 * 60 * 1000,
  })
}

// ── Analytics: shared shapes ──────────────────────────────────────────────

export type AnalyticsFilters = {
  from?: string // ISO date
  to?: string
  direction?: string
  region?: string
  manager?: string
}

export type AnalyticsRankParams = AnalyticsFilters & {
  page?: number
  size?: number
  search?: string
  sort?: string
  with_sparkline?: boolean
}

function aparams(p: AnalyticsFilters): Record<string, string | undefined> {
  return {
    from: p.from || undefined,
    to: p.to || undefined,
    direction: p.direction || undefined,
    region: p.region || undefined,
    manager: p.manager || undefined,
  }
}

function rparams(p: AnalyticsRankParams): Record<string, string | number | boolean | undefined> {
  return {
    ...aparams(p),
    page: p.page ?? 0,
    size: p.size ?? 50,
    search: p.search || undefined,
    sort: p.sort || undefined,
    with_sparkline: p.with_sparkline || undefined,
  }
}

// Generic delta type (current / prior / yoy + pct)
export type DeltaBlock = {
  current: number
  prior: number
  yoy?: number
  mom_pct: number
  yoy_pct?: number
}

export type AnalyticsWindow = {
  window: { from: string; to: string }
  comparison?: { mom: { from: string; to: string }; yoy: { from: string; to: string } }
}

// ── Sales hooks ───────────────────────────────────────────────────────────

export type SalesOverview = AnalyticsWindow & {
  revenue: DeltaBlock
  deals: DeltaBlock
  unique_clients: DeltaBlock
  avg_deal: DeltaBlock
  returns_pct: { current: number }
}

export function useSalesOverview(p: AnalyticsFilters) {
  return useQuery({
    queryKey: ['sales', 'overview', p],
    queryFn: async () => (await api.get<SalesOverview>('/sales/overview', { params: aparams(p) })).data,
    placeholderData: (prev) => prev,
  })
}

export type TimeseriesPoint = { date: string; value: number; ma?: number; yoy?: number }
export type TimeseriesResponse = { series: TimeseriesPoint[] }

export function useSalesTimeseries(p: AnalyticsFilters & { granularity?: 'day' | 'week' | 'month' | 'quarter' }) {
  return useQuery({
    queryKey: ['sales', 'timeseries', p],
    queryFn: async () =>
      (
        await api.get<TimeseriesResponse>('/sales/timeseries', {
          params: { ...aparams(p), granularity: p.granularity ?? 'month' },
        })
      ).data,
    placeholderData: (prev) => prev,
  })
}

export type SalesClientRow = {
  person_id: number
  name: string
  direction: string | null
  region: string | null
  revenue: number
  deals: number
  qty: number
  avg_deal: number
  last_order: string | null
  first_order: string | null
  yoy_pct: number | null
  sparkline: number[] | null
}

export type RankResponse<T> = {
  rows: T[]
  total: number
  page: number
  size: number
  sort: string
  totals?: Record<string, number>
}

export function useSalesClients(p: AnalyticsRankParams) {
  return useQuery({
    queryKey: ['sales', 'clients', p],
    queryFn: async () =>
      (await api.get<RankResponse<SalesClientRow>>('/sales/clients', { params: rparams(p) })).data,
    placeholderData: (prev) => prev,
  })
}

export type SalesManagerRow = {
  manager: string
  direction?: string | null
  region?: string | null
  revenue: number
  deals: number
  unique_clients: number
  avg_deal: number
  yoy_pct: number | null
}

export function useSalesManagers(p: AnalyticsRankParams) {
  return useQuery({
    queryKey: ['sales', 'managers', p],
    queryFn: async () =>
      (await api.get<RankResponse<SalesManagerRow>>('/sales/managers', { params: rparams(p) })).data,
    placeholderData: (prev) => prev,
  })
}

export type SalesBrandRow = {
  brand: string
  revenue: number
  deals: number
  qty: number
  unique_clients: number
}

export function useSalesBrands(p: AnalyticsRankParams) {
  return useQuery({
    queryKey: ['sales', 'brands', p],
    queryFn: async () =>
      (await api.get<RankResponse<SalesBrandRow>>('/sales/brands', { params: rparams(p) })).data,
    placeholderData: (prev) => prev,
  })
}

export type SalesRegionRow = {
  region: string
  revenue: number
  deals: number
  unique_clients: number
}

export function useSalesRegions(p: AnalyticsRankParams) {
  return useQuery({
    queryKey: ['sales', 'regions', p],
    queryFn: async () =>
      (await api.get<RankResponse<SalesRegionRow>>('/sales/regions', { params: rparams(p) })).data,
    placeholderData: (prev) => prev,
  })
}

export type CrossSellRow = { left: string; right: string; pair_count: number; lift: number }

export function useSalesCrossSell(p: AnalyticsFilters & { limit?: number }) {
  return useQuery({
    queryKey: ['sales', 'cross-sell', p],
    queryFn: async () =>
      (
        await api.get<{ pairs?: CrossSellRow[]; rows?: CrossSellRow[] }>('/sales/cross-sell', {
          params: { ...aparams(p), limit: Math.max(p.limit ?? 20, 5) },
        })
      ).data,
    placeholderData: (prev) => prev,
  })
}

export function useSalesRfm(p: AnalyticsRankParams) {
  return useQuery({
    queryKey: ['sales', 'rfm', p],
    queryFn: async () =>
      (await api.get<RfmResponse>('/sales/rfm', { params: rparams(p) })).data,
    placeholderData: (prev) => prev,
  })
}

export type HeatmapResponse = {
  row_labels: string[]
  col_labels: string[]
  values: number[][]
}

export function useSalesSeasonality(p: AnalyticsFilters & { years?: number }) {
  return useQuery({
    queryKey: ['sales', 'seasonality', p],
    queryFn: async () =>
      (
        await api.get<HeatmapResponse>('/sales/seasonality', {
          params: { ...aparams(p), years: p.years ?? 4 },
        })
      ).data,
    placeholderData: (prev) => prev,
  })
}

export function salesExportHref(
  endpoint: 'clients' | 'managers' | 'brands' | 'regions',
  p: AnalyticsRankParams,
): string {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(rparams(p))) {
    if (v !== undefined && v !== '') qs.set(k, String(v))
  }
  return `/api/sales/export/${endpoint}.xlsx?${qs.toString()}`
}

// ── Payments hooks ────────────────────────────────────────────────────────

export type PaymentsOverview = AnalyticsWindow & {
  receipts: DeltaBlock
  payments: DeltaBlock
  payers: DeltaBlock
  avg_payment: { current: number }
  dso: { current: number | null }
  collection_ratio: { current: number | null }
}

export function usePaymentsOverview(p: AnalyticsFilters) {
  return useQuery({
    queryKey: ['payments', 'overview', p],
    queryFn: async () =>
      (await api.get<PaymentsOverview>('/payments/overview', { params: aparams(p) })).data,
    placeholderData: (prev) => prev,
  })
}

export function usePaymentsTimeseries(p: AnalyticsFilters & { granularity?: 'day' | 'week' | 'month' | 'quarter' }) {
  return useQuery({
    queryKey: ['payments', 'timeseries', p],
    queryFn: async () =>
      (
        await api.get<TimeseriesResponse>('/payments/timeseries', {
          params: { ...aparams(p), granularity: p.granularity ?? 'month' },
        })
      ).data,
    placeholderData: (prev) => prev,
  })
}

export type MethodSplit = { split: { method: string; count: number; amount: number }[] }

export function usePaymentsMethodSplit(p: AnalyticsFilters) {
  return useQuery({
    queryKey: ['payments', 'method-split', p],
    queryFn: async () =>
      (await api.get<MethodSplit>('/payments/method-split', { params: aparams(p) })).data,
    placeholderData: (prev) => prev,
  })
}

export type WeekdayPattern = { pattern: { dow: number; label: string; count: number; amount: number }[] }

export function usePaymentsWeekday(p: AnalyticsFilters) {
  return useQuery({
    queryKey: ['payments', 'weekday', p],
    queryFn: async () =>
      (await api.get<WeekdayPattern>('/payments/weekday', { params: aparams(p) })).data,
    placeholderData: (prev) => prev,
  })
}

export type Velocity = { histogram: { bucket: string; count: number; amount: number }[] }

export function usePaymentsVelocity(p: AnalyticsFilters) {
  return useQuery({
    queryKey: ['payments', 'velocity', p],
    queryFn: async () =>
      (await api.get<Velocity>('/payments/velocity', { params: aparams(p) })).data,
    placeholderData: (prev) => prev,
  })
}

export type CollectionRatio = {
  series: { month: string; invoiced: number; paid: number; ratio: number | null }[]
}

export function usePaymentsCollectionRatio(p: AnalyticsFilters) {
  return useQuery({
    queryKey: ['payments', 'collection-ratio', p],
    queryFn: async () =>
      (await api.get<CollectionRatio>('/payments/collection-ratio', { params: aparams(p) })).data,
    placeholderData: (prev) => prev,
  })
}

export type PaymentsRankRow = {
  person_id: number
  name: string
  direction?: string | null
  region?: string | null
  receipts?: number
  amount?: number
  payments?: number
  count?: number
  last_payment?: string | null
  avg_amount?: number
  days_between?: number | null
  yoy_pct?: number | null
}

export function usePaymentsPayers(p: AnalyticsRankParams) {
  return useQuery({
    queryKey: ['payments', 'payers', p],
    queryFn: async () =>
      (await api.get<RankResponse<PaymentsRankRow>>('/payments/payers', { params: rparams(p) })).data,
    placeholderData: (prev) => prev,
  })
}

export function usePaymentsPrepayers(p: AnalyticsRankParams) {
  return useQuery({
    queryKey: ['payments', 'prepayers', p],
    queryFn: async () =>
      (await api.get<RankResponse<PaymentsRankRow>>('/payments/prepayers', { params: rparams(p) })).data,
    placeholderData: (prev) => prev,
  })
}

export function usePaymentsRegularity(p: AnalyticsRankParams) {
  return useQuery({
    queryKey: ['payments', 'regularity', p],
    queryFn: async () =>
      (await api.get<RankResponse<PaymentsRankRow>>('/payments/regularity', { params: rparams(p) })).data,
    placeholderData: (prev) => prev,
  })
}

export function usePaymentsChurned(p: AnalyticsRankParams) {
  return useQuery({
    queryKey: ['payments', 'churned', p],
    queryFn: async () =>
      (await api.get<RankResponse<PaymentsRankRow>>('/payments/churned', { params: rparams(p) })).data,
    placeholderData: (prev) => prev,
  })
}

export function usePaymentsRfm(p: AnalyticsRankParams) {
  return useQuery({
    queryKey: ['payments', 'rfm', p],
    queryFn: async () =>
      (await api.get<RfmResponse>('/payments/rfm', { params: rparams(p) })).data,
    placeholderData: (prev) => prev,
  })
}

export function paymentsExportHref(
  endpoint: 'payers' | 'prepayers' | 'regularity' | 'churned',
  p: AnalyticsRankParams,
): string {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(rparams(p))) {
    if (v !== undefined && v !== '') qs.set(k, String(v))
  }
  return `/api/payments/export/${endpoint}.xlsx?${qs.toString()}`
}

// ── Returns hooks ─────────────────────────────────────────────────────────

export type ReturnsOverview = AnalyticsWindow & {
  returns: DeltaBlock
  rate: { current: number }
  return_lines: DeltaBlock
  avg_ticket: { current: number }
}

export function useReturnsOverview(p: AnalyticsFilters) {
  return useQuery({
    queryKey: ['returns', 'overview', p],
    queryFn: async () =>
      (await api.get<ReturnsOverview>('/returns/overview', { params: aparams(p) })).data,
    placeholderData: (prev) => prev,
  })
}

export type ReturnsTimelinePoint = { date: string; forward: number; returns: number; rate: number | null }

export function useReturnsTimeline(p: AnalyticsFilters & { granularity?: 'day' | 'week' | 'month' | 'quarter' }) {
  return useQuery({
    queryKey: ['returns', 'timeline', p],
    queryFn: async () =>
      (
        await api.get<{ series: ReturnsTimelinePoint[] }>('/returns/timeline', {
          params: { ...aparams(p), granularity: p.granularity ?? 'month' },
        })
      ).data,
    placeholderData: (prev) => prev,
  })
}

export type BrandHeatmap = {
  row_labels: string[]
  col_labels: string[]
  values_rate: number[][]
  values_amount: number[][]
  totals?: Record<string, number>
}

export function useReturnsBrandHeatmap(p: AnalyticsFilters & { months?: number }) {
  return useQuery({
    queryKey: ['returns', 'brand-heatmap', p],
    queryFn: async () =>
      (
        await api.get<BrandHeatmap>('/returns/brand-heatmap', {
          params: { ...aparams(p), months: p.months ?? 12 },
        })
      ).data,
    placeholderData: (prev) => prev,
  })
}

export type ReturnsClientRow = {
  person_id: number
  name: string
  region?: string | null
  direction?: string | null
  returns: number
  return_lines: number
  forward?: number
  rate?: number
}

export function useReturnsClients(p: AnalyticsRankParams) {
  return useQuery({
    queryKey: ['returns', 'clients', p],
    queryFn: async () =>
      (await api.get<RankResponse<ReturnsClientRow>>('/returns/clients', { params: rparams(p) })).data,
    placeholderData: (prev) => prev,
  })
}

export type ReturnsRegionRow = {
  region: string
  returns: number
  return_lines: number
  forward?: number
  rate?: number
}

export function useReturnsRegions(p: AnalyticsRankParams) {
  return useQuery({
    queryKey: ['returns', 'regions', p],
    queryFn: async () =>
      (await api.get<RankResponse<ReturnsRegionRow>>('/returns/regions', { params: rparams(p) })).data,
    placeholderData: (prev) => prev,
  })
}

export function returnsExportHref(
  endpoint: 'clients' | 'regions',
  p: AnalyticsRankParams,
): string {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(rparams(p))) {
    if (v !== undefined && v !== '') qs.set(k, String(v))
  }
  return `/api/returns/export/${endpoint}.xlsx?${qs.toString()}`
}

// ── Comparison hooks ──────────────────────────────────────────────────────

export type ComparisonRow = {
  label: string
  values: number[]
  share_pct: number[]
  trend_delta_pct: number
  rank_now: number
  rank_prev: number | null
  plan?: number[]
  plan_index_pct?: number[]
}

export type ComparisonResponse = {
  columns: string[]
  rows: ComparisonRow[]
  totals: number[]
  mode: 'yearly' | 'monthly' | 'daily'
  dimension: string
  measure: 'sotuv' | 'kirim'
}

export type ComparisonParams = {
  measure: 'sotuv' | 'kirim'
  dimension?: 'manager' | 'direction' | 'brand' | 'model' | 'region'
  mode?: 'yearly' | 'monthly' | 'daily'
  year_end?: number
  years?: number
  year?: number
  month?: number
  direction?: string
  region?: string
  manager?: string
  with_plan?: boolean
}

export function useComparisonMatrix(p: ComparisonParams) {
  return useQuery({
    queryKey: ['comparison', p.measure, p],
    queryFn: async () =>
      (
        await api.get<ComparisonResponse>(`/comparison/${p.measure}`, {
          params: {
            dimension: p.dimension ?? 'manager',
            mode: p.mode ?? 'yearly',
            year_end: p.year_end,
            years: p.years,
            year: p.year,
            month: p.month,
            direction: p.direction || undefined,
            region: p.region || undefined,
            manager: p.manager || undefined,
            with_plan: p.with_plan || undefined,
          },
        })
      ).data,
    placeholderData: (prev) => prev,
  })
}

export type ComparisonDrillRow = {
  label: string
  bucket: string
  delivery_date?: string
  payment_date?: string
  amount: number
  client?: string
  manager?: string
  direction?: string
  brand?: string
  region?: string
}

export type ComparisonDrillResponse = {
  rows: ComparisonDrillRow[]
  total: number
}

export function useComparisonDrill(
  p: ComparisonParams & { dimension_value: string; bucket: string; limit?: number; enabled?: boolean },
) {
  return useQuery({
    queryKey: ['comparison', p.measure, 'drill', p],
    queryFn: async () =>
      (
        await api.get<ComparisonDrillResponse>(`/comparison/${p.measure}/drill`, {
          params: {
            dimension: p.dimension ?? 'manager',
            mode: p.mode ?? 'yearly',
            dimension_value: p.dimension_value,
            bucket: p.bucket,
            year_end: p.year_end,
            years: p.years,
            year: p.year,
            month: p.month,
            direction: p.direction || undefined,
            region: p.region || undefined,
            manager: p.manager || undefined,
            limit: p.limit ?? 500,
          },
        })
      ).data,
    enabled: p.enabled ?? !!(p.dimension_value && p.bucket),
  })
}
