import { useEffect, useState, useMemo } from 'react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  Area,
  ComposedChart,
  PieChart,
  Pie,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
  Cell,
} from 'recharts'
import {
  fetchSummary,
  fetchAnalytics,
  fetchTimeline,
  fetchCrisisEvents,
  fetchPrePost,
  fetchForecastDataset,
  fetchRecovery,
  fetchRiskIndex,
  fetchBehavior,
  type Summary,
  type TimelinePoint,
  type CrisisEvent,
  type ShockMetric,
} from '../services/api'
import { countryName } from '../utils/countryNames'
import { useFilters } from '../context/FilterContext'
import { useFilterParams } from '../hooks/useFilteredData'
import ChartCard from '../components/ChartCard'
import KpiCard from '../components/KpiCard'
import ExecSummary from '../components/ExecSummary'
import ActionPanel from '../components/ActionPanel'
import SankeyFlow from '../components/SankeyFlow'

interface Analytics {
  shock_metrics: ShockMetric[]
  top_gaining: ShockMetric[]
  top_losing: ShockMetric[]
  substitution: ShockMetric[]
  sankey_flows: { source: string; target: string; value: number }[]
  resilience_ranking: unknown[]
  search_booking_corr: { pearson_r?: number; spearman_rho?: number; r_squared?: number; n?: number }
}

interface PrePostData {
  pre: Record<string, number>
  post: Record<string, number>
  [key: string]: unknown
}

interface ForecastRow {
  date: string
  metric?: string
  forecast?: number
  upper?: number
  lower?: number
  model?: string
  [key: string]: unknown
}

interface CombinedForecastPoint {
  date: string
  historical: number | null
  forecast: number | null
  upper: number | null
  lower: number | null
}

interface RecoveryRow {
  destination_id: string
  baseline_level?: number
  trough_level?: number
  recovery_50_date?: string
  recovery_90_date?: string
  recovery_100_date?: string
  [key: string]: unknown
}

interface RiskRow {
  destination_id?: string
  risk_level?: string
  risk_score?: number
  [key: string]: unknown
}

type ForecastHorizon = 30 | 60 | 90

function formatNum(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return n % 1 === 0 ? String(n) : n.toFixed(1)
}

function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 rounded-lg ${className}`} />
}

function SkeletonKpiRow() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <SkeletonBlock key={i} className="h-28" />
      ))}
    </div>
  )
}

function SkeletonChartGrid() {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      {Array.from({ length: 4 }).map((_, i) => (
        <SkeletonBlock key={i} className="h-80" />
      ))}
    </div>
  )
}

const CRISIS_LINE_COLORS = [
  '#dc2626', '#ea580c', '#d97706', '#65a30d', '#0891b2',
  '#7c3aed', '#db2777', '#0d9488', '#4f46e5', '#be123c',
]

const CRISIS_BG_COLORS = [
  'rgba(220,38,38,0.06)', 'rgba(234,88,12,0.06)', 'rgba(217,119,6,0.06)',
  'rgba(101,163,13,0.06)', 'rgba(8,145,178,0.06)', 'rgba(124,58,237,0.06)',
  'rgba(219,39,119,0.06)', 'rgba(13,148,136,0.06)', 'rgba(79,70,229,0.06)',
  'rgba(190,18,60,0.06)',
]

export default function GlobalCrisis() {
  const { filters, latestMiddleEastCrisis } = useFilters()
  const filterParams = useFilterParams()
  const period = filters.period

  const [summary, setSummary] = useState<Summary | null>(null)
  const [timeline, setTimeline] = useState<TimelinePoint[]>([])
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [crisis, setCrisis] = useState<CrisisEvent[]>([])
  const [prepost, setPrepost] = useState<PrePostData | null>(null)
  const [forecastData, setForecastData] = useState<ForecastRow[]>([])
  const [recoveryData, setRecoveryData] = useState<RecoveryRow[]>([])
  const [riskData, setRiskData] = useState<RiskRow[]>([])
  const [forecastHorizon, setForecastHorizon] = useState<ForecastHorizon>(90)
  const [whatIf, setWhatIf] = useState({
    demandGrowth: 0,
    priceElasticity: 1.0,
    crisisSeverity: 0.5,
    travelRestrictions: 0,
    seasonalityWeight: 1.0,
  })
  const [behavior, setBehavior] = useState<any>(null)
  const [crisisAnalyticsById, setCrisisAnalyticsById] = useState<Record<number, Analytics>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  /** Per-crisis analytics for crisis table (Demand Impact, Top Affected) — independent of global crisis filter */
  useEffect(() => {
    if (!crisis.length) return
    let cancelled = false
    Promise.all(
      crisis.map((evt) =>
        evt.crisis_id != null
          ? fetchAnalytics({ ...filterParams, crisis_id: evt.crisis_id })
          : Promise.resolve(null),
      ),
    )
      .then((results) => {
        if (cancelled) return
        const m: Record<number, Analytics> = {}
        crisis.forEach((evt, i) => {
          if (evt.crisis_id != null && results[i]) m[evt.crisis_id] = results[i] as Analytics
        })
        setCrisisAnalyticsById(m)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [crisis, filterParams])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    Promise.all([
      fetchSummary(filterParams),
      fetchTimeline(filterParams),
      fetchAnalytics(filterParams),
      fetchCrisisEvents(),
      fetchPrePost(filterParams).catch(() => null),
      fetchForecastDataset().catch(() => ({ data: [] })),
      fetchRecovery().catch(() => ({ data: [] })),
      fetchRiskIndex(filterParams).catch(() => ({ data: [] })),
      fetchBehavior(filterParams).catch(() => null),
    ])
      .then(([s, t, a, c, pp, fd, rec, ri, beh]) => {
        if (cancelled) return
        setSummary(s)
        setTimeline(t.data || [])
        setAnalytics(a)
        setCrisis(c.data || [])
        setPrepost(pp)
        const fRows = Array.isArray(fd?.data) ? fd.data : Array.isArray(fd) ? fd : []
        setForecastData(fRows as ForecastRow[])
        const rRows = Array.isArray(rec?.data) ? rec.data : Array.isArray(rec) ? rec : []
        setRecoveryData(rRows as RecoveryRow[])
        const riRows = Array.isArray(ri?.data) ? ri.data : Array.isArray(ri) ? ri : []
        setRiskData(riRows as RiskRow[])
        setBehavior(beh)
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || 'Failed to load crisis data')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [filterParams])

  const crisisDate = useMemo(() => {
    if (!crisis.length) return undefined
    return crisis[0].crisis_start_date
  }, [crisis])

  const shockMetrics = analytics?.shock_metrics || []

  const avgBookingChange = useMemo(() => {
    const valid = shockMetrics.filter((m) => m.booking_change_pct != null)
    if (!valid.length) return 0
    return valid.reduce((s, m) => s + Number(m.booking_change_pct), 0) / valid.length
  }, [shockMetrics])

  const avgAdrChange = useMemo(() => {
    const valid = shockMetrics.filter((m) => m.adr_change_pct != null)
    if (!valid.length) return 0
    return valid.reduce((s, m) => s + Number(m.adr_change_pct), 0) / valid.length
  }, [shockMetrics])

  const avgSearchChange = useMemo(() => {
    const valid = shockMetrics.filter((m) => m.search_change_pct != null)
    if (!valid.length) return 0
    return valid.reduce((s, m) => s + Number(m.search_change_pct), 0) / valid.length
  }, [shockMetrics])

  const destinationsAffected = useMemo(() => {
    return new Set(shockMetrics.map((m) => m.destination_id)).size
  }, [shockMetrics])

  const recoveryLeader = useMemo(() => {
    const gainers = analytics?.top_gaining || []
    if (!gainers.length) return '—'
    return countryName(String(gainers[0].destination_id))
  }, [analytics])

  const recoveryLeaderPct = useMemo(() => {
    const gainers = analytics?.top_gaining || []
    if (!gainers.length) return undefined
    return Number(gainers[0].booking_change_pct ?? 0)
  }, [analytics])

  const highRiskCount = useMemo(() => {
    return riskData.filter(
      (r) => String(r.risk_level || '').toLowerCase() === 'high'
    ).length
  }, [riskData])

  const forecastRecoveryMarkets = useMemo(() => {
    const positiveDestinations = (analytics?.top_gaining || []).length
    return positiveDestinations
  }, [analytics])

  const insights = useMemo(() => {
    const items: string[] = []
    if (crisis.length && summary?.date_min && summary?.date_max) {
      items.push(
        `${crisis.length} geopolitical crisis event${crisis.length > 1 ? 's' : ''} tracked from ${summary.date_min} to ${summary.date_max}`
      )
    }
    if (avgBookingChange !== 0) {
      items.push(
        `Average booking decline across affected markets: ${avgBookingChange.toFixed(1)}%`
      )
    }
    if (recoveryLeader !== '—' && recoveryLeaderPct !== undefined) {
      items.push(
        `Top recovering destination: ${recoveryLeader} with ${recoveryLeaderPct > 0 ? '+' : ''}${recoveryLeaderPct.toFixed(1)}% improvement`
      )
    }
    if (highRiskCount > 0) {
      items.push(`${highRiskCount} destination${highRiskCount > 1 ? 's' : ''} at High risk`)
    } else if (riskData.length > 0) {
      items.push(`No destinations currently at High risk level`)
    }
    if (forecastRecoveryMarkets > 0) {
      items.push(
        `Forecast shows recovery signals in ${forecastRecoveryMarkets} market${forecastRecoveryMarkets > 1 ? 's' : ''}`
      )
    }
    return items
  }, [summary, crisis, avgBookingChange, recoveryLeader, recoveryLeaderPct, highRiskCount, riskData, forecastRecoveryMarkets])

  const prepostStats = useMemo(() => {
    if (!prepost?.pre || !prepost?.post || period === 'all') return null
    return (period === 'pre' ? prepost.pre : prepost.post) as Record<string, number>
  }, [prepost, period])

  const gainersData = useMemo(() => {
    return (analytics?.top_gaining ?? []).slice(0, 10).map((d) => ({
      name: countryName(String(d.destination_id)),
      change: +(d.booking_change_pct ?? 0).toFixed(1),
    }))
  }, [analytics])

  const losersData = useMemo(() => {
    return (analytics?.top_losing ?? []).slice(0, 10).map((d) => ({
      name: countryName(String(d.destination_id)),
      change: +(d.booking_change_pct ?? 0).toFixed(1),
    }))
  }, [analytics])

  const cancellationData = useMemo(() => {
    return [...shockMetrics]
      .filter((m) => m.cancellation_spike != null && Number(m.cancellation_spike) !== 0)
      .sort((a, b) => Number(b.cancellation_spike ?? 0) - Number(a.cancellation_spike ?? 0))
      .slice(0, 10)
      .map((m) => ({
        name: countryName(String(m.destination_id)),
        spike: +(Number(m.cancellation_spike) || 0).toFixed(1),
      }))
  }, [shockMetrics])

  const adrChangeData = useMemo(() => {
    return [...shockMetrics]
      .filter((m) => m.adr_change_pct != null)
      .sort((a, b) => Math.abs(Number(b.adr_change_pct ?? 0)) - Math.abs(Number(a.adr_change_pct ?? 0)))
      .slice(0, 10)
      .map((m) => ({
        name: countryName(String(m.destination_id)),
        change: +(Number(m.adr_change_pct) || 0).toFixed(1),
      }))
  }, [shockMetrics])

  const destinationsGaining = useMemo(() => {
    return shockMetrics
      .filter((m) => Number(m.booking_change_pct ?? 0) > 10)
      .sort((a, b) => Number(b.booking_change_pct ?? 0) - Number(a.booking_change_pct ?? 0))
      .map((m) => ({
        name: countryName(String(m.destination_id)),
        change: +(Number(m.booking_change_pct) || 0).toFixed(1),
      }))
  }, [shockMetrics])

  const destinationsLosing = useMemo(() => {
    return shockMetrics
      .filter((m) => Number(m.booking_change_pct ?? 0) < -10)
      .sort((a, b) => Number(a.booking_change_pct ?? 0) - Number(b.booking_change_pct ?? 0))
      .map((m) => ({
        name: countryName(String(m.destination_id)),
        change: +(Number(m.booking_change_pct) || 0).toFixed(1),
      }))
  }, [shockMetrics])

  const forecastByMetric = useMemo(() => {
    const grouped: Record<string, ForecastRow[]> = {}
    forecastData.forEach((row) => {
      const metric = row.metric || 'bookings'
      if (!grouped[metric]) grouped[metric] = []
      grouped[metric].push(row)
    })
    Object.values(grouped).forEach((arr) =>
      arr.sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    )
    return grouped
  }, [forecastData])

  const combinedForecastByMetric = useMemo(() => {
    const result: Record<string, CombinedForecastPoint[]> = {}

    const timelineMetricKeys: Record<string, string> = {
      bookings: 'bookings',
      search_demand: 'search_demand',
      adr: 'adr',
    }

    const dateKey = (d: string | undefined) => (d ? String(d).slice(0, 10) : '')

    for (const [metric, fRows] of Object.entries(forecastByMetric)) {
      const tlKey = timelineMetricKeys[metric] || metric
      const forecastStartDate = fRows.length > 0 ? fRows[0].date : undefined
      const fsKey = dateKey(forecastStartDate)

      let horizonEnd: string | undefined
      if (forecastStartDate) {
        const d = new Date(forecastStartDate)
        d.setDate(d.getDate() + forecastHorizon)
        horizonEnd = d.toISOString().slice(0, 10)
      }

      const historicalPoints: CombinedForecastPoint[] = timeline
        .filter((tp) => {
          const val = (tp as unknown as Record<string, unknown>)[tlKey]
          if (val === null || val === undefined) return false
          if (Number.isNaN(Number(val))) return false
          if (fsKey && dateKey(tp.date) >= fsKey) return false
          return true
        })
        .map((tp) => ({
          date: tp.date,
          historical: Number((tp as unknown as Record<string, unknown>)[tlKey]) || 0,
          forecast: null,
          upper: null,
          lower: null,
        }))

      const forecastPoints: CombinedForecastPoint[] = fRows
        .filter((r) => !horizonEnd || r.date <= horizonEnd)
        .map((r) => ({
          date: r.date,
          historical: null,
          forecast: r.forecast ?? null,
          upper: r.upper ?? null,
          lower: r.lower ?? null,
        }))

      if (historicalPoints.length > 0 && forecastPoints.length > 0) {
        const lastHist = historicalPoints[historicalPoints.length - 1]
        const bridgePoint: CombinedForecastPoint = {
          date: lastHist.date,
          historical: lastHist.historical,
          forecast: lastHist.historical,
          upper: null,
          lower: null,
        }
        historicalPoints[historicalPoints.length - 1] = bridgePoint
      }

      const combined = [...historicalPoints, ...forecastPoints]
      if (combined.length > 0) result[metric] = combined
    }
    return result
  }, [forecastByMetric, timeline, forecastHorizon])

  const whatIfAdjustedForecast = useMemo(() => {
    const result: Record<string, CombinedForecastPoint[]> = {}
    for (const [metric, rows] of Object.entries(combinedForecastByMetric)) {
      result[metric] = rows.map(r => {
        if (r.forecast == null) return r
        const growthFactor = 1 + whatIf.demandGrowth / 100
        const crisisImpact = 1 - whatIf.crisisSeverity * 0.4
        const restrictionImpact = 1 - whatIf.travelRestrictions * 0.3 / 100
        const seasonality = whatIf.seasonalityWeight
        const priceFactor = metric === 'adr' ? whatIf.priceElasticity : 1
        const multiplier = growthFactor * crisisImpact * restrictionImpact * seasonality * priceFactor
        return {
          ...r,
          forecast: r.forecast * multiplier,
          upper: r.upper != null ? r.upper * multiplier : null,
          lower: r.lower != null ? r.lower * multiplier : null,
        }
      })
    }
    return result
  }, [combinedForecastByMetric, whatIf])

  const forecastModel = useMemo(() => {
    for (const row of forecastData) {
      if (row.model) return row.model
    }
    return null
  }, [forecastData])

  const forecastSplitDate = useMemo(() => {
    for (const rows of Object.values(forecastByMetric)) {
      if (rows.length > 0) return rows[0].date
    }
    return undefined
  }, [forecastByMetric])

  const forecastMetricColors: Record<string, string> = {
    bookings: '#2563eb',
    search_demand: '#059669',
    adr: '#d97706',
  }

  const crisisActions = useMemo(() => [
    {
      title: 'Activate crisis response protocols for high-risk markets',
      description: highRiskCount > 0
        ? `${highRiskCount} destination${highRiskCount > 1 ? 's' : ''} classified as High risk require immediate crisis protocols, including demand monitoring, rate locks, and partner communication.`
        : 'Proactively review crisis playbooks for markets that may escalate to high risk.',
      priority: 'high' as const,
    },
    {
      title: `Reallocate inventory toward ${recoveryLeader}`,
      description: recoveryLeader !== '—'
        ? `Shift inventory and marketing spend toward ${recoveryLeader} and other recovering destinations to capture rebounding demand.`
        : 'Identify destinations showing earliest recovery signals and prioritize inventory allocation.',
      priority: 'high' as const,
    },
    {
      title: 'Implement dynamic pricing for crisis-affected corridors',
      description: `With an average ADR change of ${avgAdrChange.toFixed(1)}%, deploy dynamic pricing models that adjust to rapidly changing demand patterns in affected corridors.`,
      priority: 'medium' as const,
    },
    {
      title: 'Strengthen partnerships in resilient destinations',
      description: 'Engage with hotel and supplier partners in destinations showing resilience to secure preferential rates and inventory commitments.',
      priority: 'medium' as const,
    },
    {
      title: 'Prepare contingency plans for escalation scenarios',
      description: `With ${crisis.length} active crisis event${crisis.length !== 1 ? 's' : ''}, develop contingency response plans for potential escalation, including customer communication templates and rebooking protocols.`,
      priority: 'low' as const,
    },
  ], [highRiskCount, recoveryLeader, avgAdrChange, crisis.length])

  const BEHAVIOR_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']

  const losData = useMemo(() => {
    if (!behavior?.length_of_stay) return []
    const raw = behavior.length_of_stay
    if (Array.isArray(raw)) return raw.map((r: any) => ({ name: r.category || r.los || r.name || '?', value: Number(r.count ?? r.value ?? r.percentage ?? 0) }))
    return Object.entries(raw).map(([k, v]) => ({ name: k, value: Number(v) }))
  }, [behavior])

  const bookingWindowData = useMemo(() => {
    if (!behavior?.booking_window) return []
    const raw = behavior.booking_window
    if (Array.isArray(raw)) return raw.map((r: any) => ({ name: r.category || r.window || r.name || '?', value: Number(r.count ?? r.value ?? r.percentage ?? 0) }))
    return Object.entries(raw).map(([k, v]) => ({ name: k, value: Number(v) }))
  }, [behavior])

  const travelerTypeData = useMemo(() => {
    if (!behavior?.traveler_type) return []
    const raw = behavior.traveler_type
    if (Array.isArray(raw)) return raw.map((r: any) => ({ name: r.category || r.type || r.name || '?', value: Number(r.count ?? r.value ?? r.percentage ?? 0) }))
    return Object.entries(raw).map(([k, v]) => ({ name: k, value: Number(v) }))
  }, [behavior])

  const formatRegions = (regions: string | undefined | null): string => {
    if (!regions) return '—'
    return regions.split(',').map(r => {
      const trimmed = r.trim()
      const resolved = countryName(trimmed)
      return resolved !== trimmed ? resolved : trimmed
    }).join(', ')
  }

  if (error) {
    return (
      <div className="rounded-xl bg-red-50 border border-red-200 p-6 text-red-700">
        <p className="font-medium text-lg">Error loading crisis data</p>
        <p className="text-sm mt-2">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 px-4 py-2 text-sm font-medium bg-red-100 hover:bg-red-200 text-red-800 rounded-lg transition-colors"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Latest Middle East Crisis Banner */}
      {latestMiddleEastCrisis && (
        <div className="rounded-xl bg-gradient-to-r from-rose-50 via-orange-50 to-amber-50 border border-rose-200 p-4 flex items-center gap-3">
          <span className="text-2xl">🔴</span>
          <div>
            <p className="text-sm font-bold text-rose-800">
              Latest Crisis: {latestMiddleEastCrisis.crisis_name}
            </p>
            <p className="text-xs text-rose-600 mt-0.5">
              Started {latestMiddleEastCrisis.crisis_start_date}
              {latestMiddleEastCrisis.crisis_end_date
                ? ` — Ended ${latestMiddleEastCrisis.crisis_end_date}`
                : ' — Ongoing'}
              {latestMiddleEastCrisis.affected_regions && (
                <span className="ml-2 text-rose-500">
                  · Affected: {formatRegions(latestMiddleEastCrisis.affected_regions)}
                </span>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Global Crisis & Forecasting</h2>
          <p className="text-sm text-slate-500 mt-1">
            Crisis impact analysis, demand forecasting, and recovery tracking
          </p>
        </div>
        {period !== 'all' && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700 border border-indigo-200">
            Viewing: {period === 'pre' ? 'Pre-Crisis' : 'Post-Crisis'} data
            {crisisDate && <span className="text-indigo-400 ml-1">({crisisDate})</span>}
          </span>
        )}
      </div>

      {/* Section 1: Executive Summary */}
      {loading ? (
        <SkeletonBlock className="h-36" />
      ) : (
        <ExecSummary insights={insights} />
      )}

      {/* Pre/Post comparison banner */}
      {period !== 'all' && prepostStats && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-indigo-800 mb-2">
            Showing {period === 'pre' ? 'Pre-Crisis' : 'Post-Crisis'} snapshot
          </p>
          <div className="flex flex-wrap gap-6 text-sm text-indigo-700">
            {Object.entries(prepostStats).map(([key, val]) => (
              <span key={key}>
                <span className="font-medium capitalize">{key.replace(/_/g, ' ')}:</span>{' '}
                {typeof val === 'number' ? formatNum(val) : String(val)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Section 3: Crisis KPI Cards */}
      {loading ? (
        <SkeletonKpiRow />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <KpiCard
            title="Crisis Events"
            value={crisis.length}
            icon="⚠️"
            subtitle="Geopolitical events tracked"
          />
          <KpiCard
            title="Avg Booking Change"
            value={`${avgBookingChange >= 0 ? '+' : ''}${avgBookingChange.toFixed(1)}%`}
            change={avgBookingChange}
            icon="📉"
            subtitle="Across affected markets"
          />
          <KpiCard
            title="Avg ADR Change"
            value={`${avgAdrChange >= 0 ? '+' : ''}${avgAdrChange.toFixed(1)}%`}
            change={avgAdrChange}
            icon="💰"
            subtitle="Rate impact"
          />
          <KpiCard
            title="Avg Search Change"
            value={`${avgSearchChange >= 0 ? '+' : ''}${avgSearchChange.toFixed(1)}%`}
            change={avgSearchChange}
            icon="🔍"
            subtitle="Demand signal shift"
          />
          <KpiCard
            title="Destinations Affected"
            value={destinationsAffected}
            icon="🌍"
            subtitle="Unique markets impacted"
          />
          <KpiCard
            title="Recovery Leader"
            value={recoveryLeader.length > 14 ? recoveryLeader.slice(0, 14) + '…' : recoveryLeader}
            change={recoveryLeaderPct}
            icon="🏆"
            subtitle="Top gainer destination"
          />
        </div>
      )}

      {/* Section 4: Crisis Timeline Chart with colored background regions */}
      {loading ? (
        <SkeletonBlock className="h-80" />
      ) : (
        <ChartCard title="Crisis Timeline — Bookings with Crisis Event Markers">
          {timeline.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-400">No timeline data</div>
          ) : (
            <ResponsiveContainer width="100%" height={340}>
              <LineChart data={timeline} margin={{ top: 16, right: 24, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: string) => v?.slice(0, 7) ?? v}
                  interval="preserveStartEnd"
                />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={formatNum} width={52} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null
                    const activeCrises = crisis.filter(evt =>
                      evt.crisis_start_date <= label &&
                      (!evt.crisis_end_date || evt.crisis_end_date >= label)
                    )
                    return (
                      <div className="bg-white border border-slate-200 rounded-lg shadow-md p-3 text-xs max-w-xs">
                        <p className="font-semibold text-slate-700 mb-1">Date: {label}</p>
                        {payload.map((p, i) => (
                          <p key={i} style={{ color: p.color }} className="flex justify-between gap-4">
                            <span>{p.name}:</span>
                            <span className="font-medium">{formatNum(Number(p.value))}</span>
                          </p>
                        ))}
                        {activeCrises.length > 0 && (
                          <div className="mt-1.5 pt-1.5 border-t border-slate-100">
                            <p className="text-rose-600 font-medium">Active Crisis:</p>
                            {activeCrises.map((c, i) => (
                              <p key={i} className="text-rose-500">{c.crisis_name}</p>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} iconSize={10} />

                {/* Colored background regions for crisis phases */}
                {crisis.map((evt, idx) => {
                  const endDate = evt.crisis_end_date || timeline[timeline.length - 1]?.date
                  if (!endDate) return null
                  return (
                    <ReferenceArea
                      key={`area-${evt.crisis_id ?? idx}`}
                      x1={evt.crisis_start_date}
                      x2={endDate}
                      fill={CRISIS_BG_COLORS[idx % CRISIS_BG_COLORS.length]}
                      fillOpacity={1}
                      strokeOpacity={0}
                    />
                  )
                })}

                <Line
                  type="monotone"
                  dataKey="bookings"
                  name="Bookings"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="search_demand"
                  name="Search Demand"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                />
                {crisis.map((evt, idx) => (
                  <ReferenceLine
                    key={evt.crisis_id ?? idx}
                    x={evt.crisis_start_date}
                    stroke={CRISIS_LINE_COLORS[idx % CRISIS_LINE_COLORS.length]}
                    strokeDasharray="4 2"
                    strokeWidth={2}
                    ifOverflow="extendDomain"
                    label={{
                      value: (evt.crisis_name || '').split(' ').slice(0, 2).join(' '),
                      position: idx % 2 === 0 ? 'top' : 'bottom',
                      fontSize: 9,
                      fill: '#64748b',
                    }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      )}

      {/* Section 4b: Sankey Demand Shift Flow */}
      {!loading && (analytics?.sankey_flows?.length ?? 0) > 0 && (
        <ChartCard title="Demand Shift — Traveler Flow Between Destinations">
          <SankeyFlow
            key={`sankey-${filterParams.crisis_id ?? 'all'}-${filterParams.date_from ?? ''}-${filterParams.date_to ?? ''}-${filterParams.destination ?? ''}`}
            flows={analytics?.sankey_flows || []}
          />
        </ChartCard>
      )}

      {/* Section 5: 2x2 Chart Grid */}
      {loading ? (
        <SkeletonChartGrid />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Top Gainers */}
          <ChartCard title="Top Gainers — Booking Change %">
            {gainersData.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-slate-400">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(280, gainersData.length * 34)}>
                <BarChart data={gainersData} layout="vertical" margin={{ top: 4, right: 30, left: 10, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v}%`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
                  <Tooltip
                    formatter={(v: number) => [`${v.toFixed(1)}%`, 'Booking Change']}
                    labelFormatter={(dest: string) => `Destination: ${dest}`}
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                  <Bar dataKey="change" radius={[0, 4, 4, 0]}>
                    {gainersData.map((_, i) => (
                      <Cell key={i} fill="#10b981" />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* Top Losers */}
          <ChartCard title="Top Losers — Booking Change %">
            {losersData.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-slate-400">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(280, losersData.length * 34)}>
                <BarChart data={losersData} layout="vertical" margin={{ top: 4, right: 30, left: 10, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v}%`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
                  <Tooltip
                    formatter={(v: number) => [`${v.toFixed(1)}%`, 'Booking Change']}
                    labelFormatter={(dest: string) => `Destination: ${dest}`}
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                  <Bar dataKey="change" radius={[0, 4, 4, 0]}>
                    {losersData.map((_, i) => (
                      <Cell key={i} fill="#ef4444" />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* Cancellation Spike */}
          <ChartCard title="Cancellation Spike by Destination">
            {cancellationData.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-slate-400">No cancellation data</div>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(280, cancellationData.length * 34)}>
                <BarChart data={cancellationData} layout="vertical" margin={{ top: 4, right: 30, left: 10, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v}%`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
                  <Tooltip
                    formatter={(v: number) => [`${v.toFixed(1)}%`, 'Cancellation Spike']}
                    labelFormatter={(dest: string) => `Destination: ${dest}`}
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                  <Bar dataKey="spike" fill="#f97316" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* ADR Change by Destination */}
          <ChartCard title="ADR Change % by Destination">
            {adrChangeData.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-slate-400">No ADR data</div>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(280, adrChangeData.length * 34)}>
                <BarChart data={adrChangeData} layout="vertical" margin={{ top: 4, right: 30, left: 10, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v}%`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
                  <Tooltip
                    formatter={(v: number) => [`${v.toFixed(1)}%`, 'ADR Change']}
                    labelFormatter={(dest: string) => `Destination: ${dest}`}
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                  <Bar dataKey="change" radius={[0, 4, 4, 0]}>
                    {adrChangeData.map((d, i) => (
                      <Cell key={i} fill={d.change >= 0 ? '#10b981' : '#ef4444'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>
      )}

      {/* Section 5b: Destinations Unlocked vs Lost */}
      {!loading && (destinationsGaining.length > 0 || destinationsLosing.length > 0) && (
        <div className="space-y-4">
          <h3 className="text-xl font-bold text-slate-800">Destinations Unlocked vs Lost</h3>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5">
              <h4 className="text-sm font-semibold text-emerald-800 mb-3 flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500" />
                Destinations Gaining Demand ({destinationsGaining.length})
              </h4>
              {destinationsGaining.length === 0 ? (
                <p className="text-sm text-slate-400">No destinations with &gt;10% gain</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {destinationsGaining.map((d, i) => (
                    <div key={i} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-emerald-100">
                      <span className="text-sm font-medium text-slate-700 truncate mr-2">{d.name}</span>
                      <span className="text-sm font-bold text-emerald-600 whitespace-nowrap">+{d.change}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="rounded-xl border border-red-200 bg-red-50/50 p-5">
              <h4 className="text-sm font-semibold text-red-800 mb-3 flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" />
                Destinations Losing Demand ({destinationsLosing.length})
              </h4>
              {destinationsLosing.length === 0 ? (
                <p className="text-sm text-slate-400">No destinations with &gt;10% decline</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {destinationsLosing.map((d, i) => (
                    <div key={i} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-red-100">
                      <span className="text-sm font-medium text-slate-700 truncate mr-2">{d.name}</span>
                      <span className="text-sm font-bold text-red-600 whitespace-nowrap">{d.change}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Section 6: Forecast */}
      {loading ? (
        <SkeletonBlock className="h-80" />
      ) : (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <h3 className="text-xl font-bold text-slate-800">Demand Forecast</h3>
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
                Forecast
              </span>
              {forecastModel && (
                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-violet-100 text-violet-700 border border-violet-200">
                  Model: {forecastModel}
                </span>
              )}
            </div>

            {/* Forecast horizon toggle */}
            <div className="inline-flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500">Horizon:</span>
              <div className="inline-flex rounded-lg bg-gray-100 p-0.5">
                {([30, 60, 90] as ForecastHorizon[]).map((h) => (
                  <button
                    key={h}
                    onClick={() => setForecastHorizon(h)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                      forecastHorizon === h
                        ? 'bg-white text-blue-700 shadow-sm'
                        : 'text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    {h}d
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* What-If Forecast Simulator */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-3 mb-5">
              <h4 className="text-base font-semibold text-gray-900">What-If Forecast Simulator</h4>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 font-medium">Interactive</span>
              <button
                onClick={() => setWhatIf({ demandGrowth: 0, priceElasticity: 1.0, crisisSeverity: 0.5, travelRestrictions: 0, seasonalityWeight: 1.0 })}
                className="ml-auto text-xs text-slate-500 hover:text-slate-700 underline"
              >
                Reset
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {[
                { key: 'demandGrowth', label: 'Demand Growth Rate', min: -50, max: 50, step: 1, unit: '%', desc: 'Expected YoY demand change' },
                { key: 'priceElasticity', label: 'Price Elasticity', min: 0.5, max: 2.0, step: 0.1, unit: 'x', desc: 'Price sensitivity multiplier' },
                { key: 'crisisSeverity', label: 'Crisis Severity', min: 0, max: 1, step: 0.05, unit: '', desc: '0 = no crisis, 1 = severe' },
                { key: 'travelRestrictions', label: 'Travel Restrictions', min: 0, max: 100, step: 5, unit: '%', desc: 'Restriction level impact' },
                { key: 'seasonalityWeight', label: 'Seasonality Weight', min: 0.5, max: 1.5, step: 0.1, unit: 'x', desc: 'Seasonal pattern strength' },
              ].map(param => (
                <div key={param.key} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-700">{param.label}</span>
                    <span className="text-xs font-mono text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                      {whatIf[param.key as keyof typeof whatIf]}{param.unit}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={param.min}
                    max={param.max}
                    step={param.step}
                    value={whatIf[param.key as keyof typeof whatIf]}
                    onChange={e => setWhatIf(prev => ({ ...prev, [param.key]: parseFloat(e.target.value) }))}
                    className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                  <span className="text-[10px] text-gray-400">{param.desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Forecast Charts by Metric */}
          {Object.keys(whatIfAdjustedForecast).length > 0 ? (
            <div className="space-y-6">
              {Object.entries(whatIfAdjustedForecast).map(([metric, rows]) => {
                const color = forecastMetricColors[metric] || '#6366f1'
                const bandColor = color + '18'
                return (
                  <ChartCard
                    key={metric}
                    title={`Forecast: ${metric.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}`}
                  >
                    <div className="mb-2 flex items-center gap-4 text-xs text-slate-500 px-1">
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block w-6 h-1 rounded" style={{ backgroundColor: '#0f172a' }} />
                        Historical (actual)
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block w-6 border-t-[3px] border-dashed rounded" style={{ borderColor: color }} />
                        Forecast
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block w-4 h-3 rounded opacity-35" style={{ backgroundColor: color }} />
                        Confidence band
                      </span>
                    </div>
                    <ResponsiveContainer width="100%" height={320}>
                      <ComposedChart data={rows} margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 11 }}
                          tickFormatter={(v: string) => v?.slice(5, 10) ?? v}
                          interval="preserveStartEnd"
                        />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={formatNum} width={52} />
                        <Tooltip
                          content={({ active, payload, label }) => {
                            if (!active || !payload?.length) return null
                            const row = rows.find(r => r.date === label)
                            const isForecast = row?.forecast != null && row?.historical == null
                            return (
                              <div className="bg-white border border-slate-200 rounded-lg shadow-md p-3 text-xs">
                                <p className="font-semibold text-slate-700 mb-1">
                                  {label}
                                  {isForecast && (
                                    <span className="ml-2 px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 text-[10px] font-medium">
                                      FORECAST
                                    </span>
                                  )}
                                </p>
                                {payload.filter(p => p.value != null).map((p, i) => (
                                  <p key={i} style={{ color: p.color === 'transparent' ? '#94a3b8' : p.color }} className="flex justify-between gap-4">
                                    <span>{p.name}:</span>
                                    <span className="font-medium">{formatNum(Number(p.value))}</span>
                                  </p>
                                ))}
                                {row?.upper != null && row?.lower != null && (
                                  <p className="text-slate-400 mt-1 pt-1 border-t border-slate-100">
                                    Range: {formatNum(row.lower)} – {formatNum(row.upper)}
                                  </p>
                                )}
                              </div>
                            )
                          }}
                        />

                        {forecastSplitDate && (
                          <ReferenceLine
                            x={forecastSplitDate}
                            stroke="#94a3b8"
                            strokeDasharray="6 3"
                            strokeWidth={1.5}
                            label={{
                              value: 'Forecast →',
                              position: 'top',
                              fill: '#64748b',
                              fontSize: 10,
                            }}
                          />
                        )}

                        <Area
                          type="monotone"
                          dataKey="upper"
                          name="Upper Bound"
                          stroke="transparent"
                          fill={bandColor}
                          fillOpacity={0.5}
                        />
                        <Area
                          type="monotone"
                          dataKey="lower"
                          name="Lower Bound"
                          stroke="transparent"
                          fill="#ffffff"
                          fillOpacity={0.8}
                        />

                        <Line
                          type="monotone"
                          dataKey="historical"
                          name="Actual"
                          stroke="#0f172a"
                          strokeWidth={3}
                          dot={false}
                          connectNulls
                          isAnimationActive={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="forecast"
                          name="Forecast"
                          stroke={color}
                          strokeWidth={3.5}
                          strokeDasharray="8 5"
                          dot={false}
                          connectNulls
                          isAnimationActive={false}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </ChartCard>
                )
              })}
            </div>
          ) : (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-8 text-center text-slate-500">
              No forecast dataset available. Run the forecasting pipeline to generate predictions.
            </div>
          )}

          {/* Recovery Table */}
          {recoveryData.length > 0 && (
            <ChartCard title="Recovery Trajectory by Destination">
              <div className="overflow-x-auto -mx-1">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-slate-200">
                      <th className="text-left py-3 px-3 font-semibold text-slate-700">Destination</th>
                      <th className="text-left py-3 px-3 font-semibold text-slate-700">Baseline</th>
                      <th className="text-left py-3 px-3 font-semibold text-slate-700">Trough</th>
                      <th className="text-left py-3 px-3 font-semibold text-slate-700">50% Recovery</th>
                      <th className="text-left py-3 px-3 font-semibold text-slate-700">90% Recovery</th>
                      <th className="text-left py-3 px-3 font-semibold text-slate-700">100% Recovery</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recoveryData.map((row, i) => (
                      <tr key={i} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                        <td className="py-2.5 px-3 text-slate-800 font-medium">{countryName(row.destination_id)}</td>
                        <td className="py-2.5 px-3 text-slate-600">
                          {row.baseline_level != null ? formatNum(Number(row.baseline_level)) : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">
                          {row.trough_level != null ? formatNum(Number(row.trough_level)) : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">{row.recovery_50_date ?? '—'}</td>
                        <td className="py-2.5 px-3 text-slate-600">{row.recovery_90_date ?? '—'}</td>
                        <td className="py-2.5 px-3 text-slate-600">{row.recovery_100_date ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ChartCard>
          )}
        </div>
      )}

      {/* Section 6b: Travel Behavior Analysis */}
      {!loading && behavior && (losData.length > 0 || bookingWindowData.length > 0 || travelerTypeData.length > 0) && (
        <div className="space-y-4">
          <h3 className="text-xl font-bold text-slate-800">Travel Behavior Analysis</h3>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {losData.length > 0 && (
              <ChartCard title="Length of Stay Distribution">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={losData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={50} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={formatNum} width={48} />
                    <Tooltip
                      formatter={(v: number) => [formatNum(v), 'Count']}
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {losData.map((_: any, i: number) => (
                        <Cell key={i} fill={BEHAVIOR_COLORS[i % BEHAVIOR_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {bookingWindowData.length > 0 && (
              <ChartCard title="Booking Window Distribution">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={bookingWindowData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={50} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={formatNum} width={48} />
                    <Tooltip
                      formatter={(v: number) => [formatNum(v), 'Count']}
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {bookingWindowData.map((_: any, i: number) => (
                        <Cell key={i} fill={BEHAVIOR_COLORS[(i + 2) % BEHAVIOR_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {travelerTypeData.length > 0 && (
              <ChartCard title="Traveler Type Distribution">
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={travelerTypeData}
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      innerRadius={40}
                      dataKey="value"
                      nameKey="name"
                      label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={{ strokeWidth: 1 }}
                    >
                      {travelerTypeData.map((_: any, i: number) => (
                        <Cell key={i} fill={BEHAVIOR_COLORS[i % BEHAVIOR_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v: number, name: string) => [formatNum(v), name]}
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>
            )}
          </div>
        </div>
      )}

      {/* Section 7: Enhanced Crisis Events Table */}
      {loading ? (
        <SkeletonBlock className="h-48" />
      ) : (
        <ChartCard title={`Crisis Events (${crisis.length})`}>
          {crisis.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-400">No crisis events recorded</div>
          ) : (
            <div className="overflow-x-auto -mx-1">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-slate-200">
                    <th className="text-left py-3 px-3 font-semibold text-slate-700">Crisis Name</th>
                    <th className="text-left py-3 px-3 font-semibold text-slate-700">Start Date</th>
                    <th className="text-left py-3 px-3 font-semibold text-slate-700">Affected Regions</th>
                    <th className="text-left py-3 px-3 font-semibold text-slate-700">Demand Impact</th>
                    <th className="text-left py-3 px-3 font-semibold text-slate-700">Top Affected</th>
                    <th className="text-left py-3 px-3 font-semibold text-slate-700">Risk Level</th>
                  </tr>
                </thead>
                <tbody>
                  {crisis.map((evt, i) => {
                    const rowAn = evt.crisis_id != null ? crisisAnalyticsById[evt.crisis_id] : null
                    const rowSm = rowAn?.shock_metrics ?? []
                    const preSum = rowSm.reduce((s, m) => s + (Number(m.pre_bookings) || 0), 0)
                    const postSum = rowSm.reduce((s, m) => s + (Number(m.post_bookings) || 0), 0)
                    const demandImpactPct =
                      preSum > 0 ? ((postSum - preSum) / preSum) * 100 : null
                    const topAffected = (rowAn?.top_losing ?? [])
                      .slice(0, 3)
                      .map(m => countryName(String(m.destination_id)))
                    const avgDecline = rowSm.length
                      ? rowSm.reduce((s, m) => s + Number(m.booking_change_pct ?? 0), 0) / rowSm.length
                      : 0
                    const riskLevel = Math.abs(avgDecline) > 0.3 ? 'High' : Math.abs(avgDecline) > 0.15 ? 'Medium' : 'Low'
                    const riskColors = { High: 'bg-red-100 text-red-700', Medium: 'bg-amber-100 text-amber-700', Low: 'bg-green-100 text-green-700' }
                    return (
                      <tr
                        key={evt.crisis_id ?? i}
                        className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                      >
                        <td className="py-2.5 px-3 text-slate-800 font-medium">{evt.crisis_name}</td>
                        <td className="py-2.5 px-3 text-slate-600">{evt.crisis_start_date}</td>
                        <td className="py-2.5 px-3 text-slate-600 max-w-[200px]">
                          <span className="line-clamp-2" title={formatRegions(evt.affected_regions)}>
                            {formatRegions(evt.affected_regions)}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          {demandImpactPct != null && !Number.isNaN(demandImpactPct) ? (
                            <span className={`font-semibold ${demandImpactPct < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                              {demandImpactPct >= 0 ? '+' : ''}{demandImpactPct.toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 text-xs">
                          {topAffected.length > 0 ? topAffected.join(', ') : '—'}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${riskColors[riskLevel]}`}>
                            {riskLevel}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </ChartCard>
      )}

      {/* Section 8: Action Panel */}
      {loading ? (
        <SkeletonBlock className="h-48" />
      ) : (
        <ActionPanel actions={crisisActions} />
      )}
    </div>
  )
}
