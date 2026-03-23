import axios from 'axios'

/**
 * In dev, always use same-origin `/api` so Vite proxies to the backend (see vite.config).
 * Avoids broken calls when an old API is still bound to :8080 while `.env` points there.
 * In production, set `VITE_API_URL` to your API origin (e.g. https://api.example.com).
 */
function apiBaseUrl(): string {
  if (import.meta.env.DEV) {
    return '/api'
  }
  const raw = import.meta.env.VITE_API_URL as string | undefined
  if (!raw) return '/api'
  const base = raw.replace(/\/+$/, '')
  if (base.endsWith('/api')) return base
  return `${base}/api`
}

const apiBase = apiBaseUrl()

const api = axios.create({
  baseURL: apiBase,
  timeout: 60000,
  headers: { 'Content-Type': 'application/json' },
  // Axios 1.x: avoid edge cases where absolute-looking paths override baseURL
  allowAbsoluteUrls: false,
})

export interface Summary {
  date_min: string | null
  date_max: string | null
  total_bookings: number
  total_room_nights: number
  destinations_count: number
  records_count: number
  last_updated: string | null
}

export interface TimelinePoint {
  date: string
  bookings: number
  search_demand: number
  adr: number
  room_nights: number
}

export interface CrisisEvent {
  crisis_id?: number
  crisis_name: string
  crisis_start_date: string
  crisis_end_date?: string | null
  affected_regions?: string
}

export interface ShockMetric {
  destination_id: string
  booking_change_pct: number | null
  search_change_pct?: number | null
  adr_change_pct?: number | null
  cancellation_spike?: number | null
  pre_bookings?: number
  post_bookings?: number
}

export interface FilterParams {
  date_from?: string
  date_to?: string
  destination?: string
  crisis_id?: number
  source_market?: string
  travel_type?: string
}

export const fetchSummary = (params?: FilterParams) =>
  api.get<Summary>('/summary', { params }).then((r) => r.data)

export const fetchTimeline = (params?: FilterParams) =>
  api.get<{ data: TimelinePoint[]; count: number }>('/timeline', { params }).then((r) => r.data)

export const fetchCrisisEvents = () =>
  api.get<{ data: CrisisEvent[]; count: number }>('/crisis-events').then((r) => r.data)

export const fetchAnalytics = (params?: FilterParams) =>
  api.get<{
    shock_metrics: ShockMetric[]
    top_gaining: ShockMetric[]
    top_losing: ShockMetric[]
    substitution: ShockMetric[]
    sankey_flows: { source: string; target: string; value: number }[]
    resilience_ranking: unknown[]
    search_booking_corr: { pearson_r?: number; spearman_rho?: number; r_squared?: number; n?: number }
  }>('/analytics', { params }).then((r) => r.data)

export const fetchRecovery = () =>
  api.get<{ data: unknown[]; count: number }>('/forecast/recovery').then((r) => r.data)

export const fetchMetrics = (params?: FilterParams & { limit?: number }) =>
  api.get<{ data: unknown[]; count: number }>('/metrics', { params }).then((r) => r.data)

export const checkHealth = () => api.get<{ status: string }>('/health').then((r) => r.data).catch(() => null)

export const fetchKpisHotel = (params?: FilterParams) => api.get('/kpis/hotel', { params }).then((r) => r.data)
export const fetchKpisOta = (params?: FilterParams) => api.get('/kpis/ota', { params }).then((r) => r.data)
export const fetchRiskIndex = (params?: FilterParams) => api.get('/risk-index', { params }).then((r) => r.data)
export const fetchCorridor = (params?: FilterParams) => api.get('/corridor', { params }).then((r) => r.data)
export const fetchFunnel = (params?: FilterParams) => api.get('/funnel', { params }).then((r) => r.data)
export const fetchPrePost = (params?: FilterParams) => api.get('/prepost', { params }).then((r) => r.data)
export const fetchForecastDataset = () => api.get('/forecast/dataset').then((r) => r.data)
export const fetchTimelineByDest = (params?: FilterParams) => api.get('/timeline-by-dest', { params }).then((r) => r.data)
export const fetchBehavior = (params?: FilterParams) => api.get('/behavior', { params }).then((r) => r.data)

export const fetchDestinations = () =>
  api.get<{ data: { destination_id: string; destination_name: string; region: string }[]; count: number }>('/destinations').then(r => r.data)

export const fetchTravelFlows = (params?: FilterParams) =>
  api.get<{ data: { travel_type: string; bookings: number; search_demand: number; room_nights: number; avg_adr: number; share_pct: number }[]; count: number }>('/travel-flows', { params }).then(r => r.data)

export const fetchSourceMarkets = () =>
  api.get<{ data: { id: string }[]; count: number }>('/source-markets').then(r => r.data)

export interface TravelDemandIntelPayload {
  measures: {
    flights_total: number
    seat_capacity: number
    passengers: number
    load_factor_pct: number | null
    airfare_index: number
    visa_applications: number
    visa_issued: number
    visa_rejected: number
    visa_approval_rate_pct: number | null
    visa_rejection_rate_pct: number | null
    visa_to_booking_pct: number | null
    search_to_visa_pct: number | null
    capacity_vs_demand_gap: number
    market_health_index: number | null
    flights_lead_30d: number
    flights_lead_60d: number
    visa_lead_15d: number
    visa_lead_30d: number
    flights_prev_period: number
    visa_prev_period: number
    bookings_prev_period: number
    total_bookings: number
    total_searches: number
    flights_growth: number | null
    visa_growth: number | null
    bookings_growth: number | null
    room_nights: number
    booking_lag_from_visa_days: number | null
    processing_time_days: number
    visa_growth_wow: number | null
    visa_growth_yoy: number | null
    visa_to_arrival_lag_days: number | null
    policy_impact_index: number | null
    flights_vs_bookings_elasticity: number | null
    visa_shock_baseline: number
    flight_shock_baseline: number
    booking_shock_baseline: number
  }
  funnel: { stage: string; value: number }[]
  flights_by_route: { route: string; flights_count: number }[]
  visas_by_origin: { origin_country: string; visa_applications: number }[]
  load_factor_trend: { date: string; load_factor_pct: number }[]
  seat_vs_bookings: { label: string; value: number }[]
  shock_trend: { date: string; visa_shock: number; flight_shock: number; booking_shock: number }[]
  insights: {
    global_travel_market_pulse: string
    lead_indicators_insight: string
    visa_intelligence_insight: string
    elasticity_insight: string
  }
  action_panel: string[]
}

export const fetchTravelDemandIntel = (params?: FilterParams) =>
  api.get<TravelDemandIntelPayload>('/travel-demand-intelligence', { params }).then((r) => r.data)

export const fetchTravelDemandExecutiveSummary = (params?: FilterParams) =>
  api.get<{ summary: string }>('/travel-demand-intelligence/summary', { params }).then((r) => r.data)

export default api
