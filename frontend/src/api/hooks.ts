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

export type DebtListResponse = {
  summary?: Record<string, unknown>
  by_collector?: unknown[]
  rows: DebtRow[]
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
      (await api.get<DebtListResponse>('/debt/prepayments', { params: { limit: 1 } })).data,
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
