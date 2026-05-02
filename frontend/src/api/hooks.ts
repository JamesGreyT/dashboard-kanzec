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
