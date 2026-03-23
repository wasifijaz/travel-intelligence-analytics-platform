import { useEffect, useState, useMemo } from 'react'
import {
  fetchSummary,
  fetchAnalytics,
  fetchTimeline,
  fetchCorridor,
  fetchPrePost,
  type Summary,
  type ShockMetric,
  type TimelinePoint,
} from '../services/api'
import { countryName } from '../utils/countryNames'
import { useFilters } from '../context/FilterContext'
import { useFilterParams } from '../hooks/useFilteredData'
import KpiCard from '../components/KpiCard'
import ExecSummary from '../components/ExecSummary'
import ActionPanel from '../components/ActionPanel'
import RevenueCalculator from '../components/RevenueCalculator'
import ChartCard from '../components/ChartCard'
import CorridorMatrix from '../components/CorridorMatrix'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  ZAxis,
} from 'recharts'

function fmt(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return n.toLocaleString(undefined, { maximumFractionDigits: 1 })
}

function pct(n: number | null | undefined): string {
  if (n == null) return '—'
  return (n > 0 ? '+' : '') + n.toFixed(1) + '%'
}

function fmtDollar(n: number): string {
  return '$' + n.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

interface AnalyticsData {
  shock_metrics: ShockMetric[]
  top_gaining: ShockMetric[]
  top_losing: ShockMetric[]
  search_booking_corr: { pearson_r?: number; spearman_rho?: number; r_squared?: number; n?: number }
}

interface PrePostData {
  crisis_date?: string
  pre?: { total_bookings?: number; total_search?: number; total_cancellations?: number }
  post?: { total_bookings?: number; total_search?: number; total_cancellations?: number }
}

interface CorridorRow {
  source: string
  bookings_pre: number
  bookings_post: number
  change_pct: number
}

const DMC_ACTIONS = [
  {
    title: 'Increase package offerings in rising destinations',
    description: 'Capitalize on destinations showing strong booking growth by expanding your package catalog and targeting high-demand experiences.',
    priority: 'high' as const,
  },
  {
    title: 'Shift marketing focus to high-growth corridors',
    description: 'Redirect advertising budgets toward origin-destination corridors that demonstrate the strongest recovery and growth trajectories.',
    priority: 'high' as const,
  },
  {
    title: 'Diversify destination portfolio away from conflict zones',
    description: 'Reduce exposure to geopolitical risk by adding alternative destinations that serve similar traveler interests with lower volatility.',
    priority: 'medium' as const,
  },
  {
    title: 'Improve conversion rates in high-search/low-booking markets',
    description: 'Destinations with strong search demand but weak conversion need pricing adjustments, better content, or streamlined booking flows.',
    priority: 'medium' as const,
  },
  {
    title: 'Develop premium packages for resilient destinations',
    description: 'Destinations that maintained or grew bookings through crisis periods are ideal candidates for higher-margin premium offerings.',
    priority: 'low' as const,
  },
]

const REVENUE_FIELDS = [
  { name: 'packagePrice', label: 'Average Package Price ($)', defaultValue: 1500, min: 500, max: 5000, step: 100 },
  { name: 'bookings', label: 'Bookings', defaultValue: 500, min: 100, max: 5000, step: 50 },
  { name: 'margin', label: 'Margin %', defaultValue: 15, min: 5, max: 40, step: 1 },
]

const revenueFormula = (v: Record<string, number>) =>
  (v.packagePrice * v.bookings * v.margin) / 100

export default function TMCDMC() {
  const { filters, latestMiddleEastCrisis } = useFilters()
  const filterParams = useFilterParams()
  const period = filters.period

  const [summary, setSummary] = useState<Summary | null>(null)
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [timeline, setTimeline] = useState<TimelinePoint[]>([])
  const [corridor, setCorridor] = useState<CorridorRow[]>([])
  const [prepost, setPrepost] = useState<PrePostData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    Promise.all([
      fetchSummary(filterParams),
      fetchAnalytics(filterParams),
      fetchTimeline(filterParams),
      fetchCorridor(filterParams),
      fetchPrePost(filterParams),
    ])
      .then(([s, a, t, c, pp]) => {
        if (cancelled) return
        setSummary(s)
        setAnalytics(a as AnalyticsData)
        setTimeline(t.data || [])
        const corridorData = (c as { data?: CorridorRow[] }).data ?? (Array.isArray(c) ? c : [])
        setCorridor(corridorData as CorridorRow[])
        setPrepost(pp as PrePostData)
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || 'Failed to load DMC data')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [filterParams])

  const shockMetrics = analytics?.shock_metrics ?? []

  const topDestByBookings = useMemo(() => {
    if (!shockMetrics.length) return null
    return [...shockMetrics].sort(
      (a, b) => (b.post_bookings ?? 0) - (a.post_bookings ?? 0)
    )[0]
  }, [shockMetrics])

  const highestGrowth = useMemo(() => {
    if (!shockMetrics.length) return null
    return [...shockMetrics]
      .filter((m) => m.booking_change_pct != null)
      .sort((a, b) => (b.booking_change_pct ?? 0) - (a.booking_change_pct ?? 0))[0]
  }, [shockMetrics])

  const totalSearchDemand = useMemo(() => {
    return timeline.reduce((s, t) => s + (t.search_demand ?? 0), 0)
  }, [timeline])

  const avgBookingVolume = summary && summary.destinations_count > 0
    ? Math.round(summary.total_bookings / summary.destinations_count)
    : 0

  const postCancellations = prepost?.post?.total_cancellations ?? 0

  const avgConversionRate = useMemo(() => {
    const search = prepost?.pre?.total_search ?? prepost?.post?.total_search ?? totalSearchDemand
    const bookings = summary?.total_bookings ?? 0
    if (!search) return 0
    return (bookings / search) * 100
  }, [prepost, summary, totalSearchDemand])

  const corrPearson = analytics?.search_booking_corr?.pearson_r

  const destCount = summary?.destinations_count ?? 0

  const avgBookingValue = useMemo(() => {
    if (!destCount || !summary) return 0
    const avgAdr = timeline.length
      ? timeline.filter(t => t.adr > 0).reduce((s, t) => s + t.adr, 0) / timeline.filter(t => t.adr > 0).length
      : 200
    return (summary.total_bookings * avgAdr) / destCount
  }, [summary, destCount, timeline])

  const insights = useMemo(() => {
    const items: string[] = []
    if (summary) {
      items.push(
        `Total bookings managed across ${summary.destinations_count} destinations: ${fmt(summary.total_bookings)}`
      )
      items.push(`Average booking volume per destination: ${fmt(avgBookingVolume)}`)
    }
    if (topDestByBookings) {
      items.push(`Top destination by bookings: ${countryName(topDestByBookings.destination_id)}`)
    }
    if (highestGrowth && highestGrowth.booking_change_pct != null) {
      items.push(
        `Highest growth market: ${countryName(highestGrowth.destination_id)} with ${pct(highestGrowth.booking_change_pct)} change`
      )
    }
    if (corrPearson != null) {
      const strength = Math.abs(corrPearson) > 0.7 ? 'strong' : Math.abs(corrPearson) > 0.4 ? 'moderate' : 'weak'
      items.push(
        `Search-to-booking conversion shows ${strength} correlation (r=${corrPearson.toFixed(2)}), indicating ${
          strength === 'strong'
            ? 'search demand reliably predicts bookings'
            : 'room to improve conversion funnels'
        }`
      )
    }
    return items
  }, [summary, avgBookingVolume, topDestByBookings, highestGrowth, corrPearson])

  const top15Destinations = useMemo(() => {
    return [...shockMetrics]
      .sort((a, b) => (b.post_bookings ?? 0) - (a.post_bookings ?? 0))
      .slice(0, 15)
      .map((m) => ({
        destination: countryName(m.destination_id),
        bookings: m.post_bookings ?? 0,
      }))
  }, [shockMetrics])

  const bookingChangeData = useMemo(() => {
    return [...shockMetrics]
      .filter((m) => m.booking_change_pct != null)
      .sort((a, b) => (b.booking_change_pct ?? 0) - (a.booking_change_pct ?? 0))
      .slice(0, 20)
      .map((m) => ({
        destination: countryName(m.destination_id),
        change: m.booking_change_pct ?? 0,
      }))
  }, [shockMetrics])

  const scatterData = useMemo(() => {
    return shockMetrics
      .filter((m) => m.pre_bookings != null && m.booking_change_pct != null)
      .map((m) => ({
        destination: countryName(m.destination_id),
        pre_bookings: m.pre_bookings ?? 0,
        change_pct: m.booking_change_pct ?? 0,
      }))
  }, [shockMetrics])

  const filteredTimeline = useMemo(() => {
    if (period === 'all' || !prepost?.crisis_date) return timeline
    const crisis = new Date(prepost.crisis_date)
    if (period === 'pre') return timeline.filter((t) => new Date(t.date) < crisis)
    return timeline.filter((t) => new Date(t.date) >= crisis)
  }, [timeline, period, prepost])

  if (error) {
    return (
      <div className="rounded-xl bg-red-50 border border-red-200 p-6 text-red-700">
        <p className="font-medium">Error loading DMC dashboard</p>
        <p className="text-sm mt-1">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-slate-800">DMC Analytics</h2>
        <p className="text-slate-500 mt-1">
          Destination management performance, corridor analysis, and market intelligence.
        </p>
      </div>

      {/* Latest Middle East Crisis Date */}
      {latestMiddleEastCrisis && (
        <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
          <span className="text-amber-600 text-lg">⚠</span>
          <div>
            <span className="text-sm font-semibold text-amber-800">
              Latest Middle East Crisis: {latestMiddleEastCrisis.crisis_name}
            </span>
            <span className="text-sm text-amber-600 ml-2">
              ({latestMiddleEastCrisis.crisis_start_date})
            </span>
          </div>
        </div>
      )}

      {/* Executive Summary */}
      {!loading && insights.length > 0 && <ExecSummary insights={insights} />}

      {/* Period indicator */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-600">Period:</span>
          <span className={`text-sm font-semibold px-3 py-1 rounded-full ${
            period === 'pre' ? 'bg-blue-100 text-blue-700' :
            period === 'post' ? 'bg-orange-100 text-orange-700' :
            'bg-slate-100 text-slate-600'
          }`}>
            {period === 'pre' ? 'Pre-Crisis' : period === 'post' ? 'Post-Crisis' : 'All Periods'}
          </span>
          {prepost?.crisis_date && (
            <span className="text-xs text-slate-400 ml-2">Crisis date: {prepost.crisis_date}</span>
          )}
        </div>
        {loading && (
          <span className="text-sm text-slate-400 animate-pulse">Loading data…</span>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <KpiCard
          title="Total Bookings"
          value={loading ? '—' : fmt(summary?.total_bookings ?? 0)}
          icon="📊"
          subtitle="All managed bookings"
        />
        <KpiCard
          title="Destinations"
          value={loading ? '—' : summary?.destinations_count ?? 0}
          icon="🌍"
          subtitle="Active destinations"
        />
        <KpiCard
          title="Avg Volume / Dest"
          value={loading ? '—' : fmt(avgBookingVolume)}
          icon="📈"
          subtitle="Bookings per destination"
        />
        <KpiCard
          title="Search Demand"
          value={loading ? '—' : fmt(totalSearchDemand)}
          icon="🔍"
          subtitle="Total search volume"
        />
        <KpiCard
          title="Avg Conversion"
          value={loading ? '—' : avgConversionRate.toFixed(1) + '%'}
          icon="🎯"
          subtitle="Search to booking"
        />
        <KpiCard
          title="Cancellations"
          value={loading ? '—' : fmt(postCancellations)}
          icon="❌"
          subtitle="Post-crisis impact"
        />
      </div>

      {/* Expanded KPI Section */}
      {!loading && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Expanded DMC Metrics</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <div className="bg-gradient-to-br from-violet-50 to-violet-100 rounded-lg p-4 border border-violet-200">
              <p className="text-xs font-medium text-violet-500 uppercase tracking-wider">Service Margin</p>
              <p className="text-xl font-bold text-violet-800 mt-1">12%</p>
              <p className="text-xs text-violet-400 mt-1">Avg. service margin</p>
            </div>
            <div className="bg-gradient-to-br from-sky-50 to-sky-100 rounded-lg p-4 border border-sky-200">
              <p className="text-xs font-medium text-sky-500 uppercase tracking-wider">Client Retention</p>
              <p className="text-xl font-bold text-sky-800 mt-1">78%</p>
              <p className="text-xs text-sky-400 mt-1">Year-over-year</p>
            </div>
            <div className="bg-gradient-to-br from-teal-50 to-teal-100 rounded-lg p-4 border border-teal-200">
              <p className="text-xs font-medium text-teal-500 uppercase tracking-wider">Avg Booking Value</p>
              <p className="text-xl font-bold text-teal-800 mt-1">{fmtDollar(avgBookingValue)}</p>
              <p className="text-xs text-teal-400 mt-1">Per destination avg</p>
            </div>
            <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-lg p-4 border border-emerald-200">
              <p className="text-xs font-medium text-emerald-500 uppercase tracking-wider">Group Bookings</p>
              <p className="text-xl font-bold text-emerald-800 mt-1">25%</p>
              <p className="text-xs text-emerald-400 mt-1">Of total bookings</p>
            </div>
            <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-lg p-4 border border-indigo-200">
              <p className="text-xs font-medium text-indigo-500 uppercase tracking-wider">Corporate Travel</p>
              <p className="text-xl font-bold text-indigo-800 mt-1">40%</p>
              <p className="text-xs text-indigo-400 mt-1">Of total volume</p>
            </div>
          </div>
        </div>
      )}

      {/* Charts — 2x2 Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Destination Booking Volume (Top 15)">
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-slate-400">Loading…</div>
          ) : top15Destinations.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-400">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={top15Destinations} margin={{ top: 8, right: 12, left: 8, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="destination"
                  tick={{ fontSize: 10 }}
                  angle={-45}
                  textAnchor="end"
                  interval={0}
                />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={fmt} width={52} />
                <Tooltip formatter={(v: number) => [fmt(v), 'Bookings']} contentStyle={{ fontSize: 12 }} />
                <Bar dataKey="bookings" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Booking Change by Destination">
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-slate-400">Loading…</div>
          ) : bookingChangeData.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-400">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={bookingChangeData} margin={{ top: 8, right: 12, left: 8, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="destination"
                  tick={{ fontSize: 10 }}
                  angle={-45}
                  textAnchor="end"
                  interval={0}
                />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v + '%'} width={52} />
                <Tooltip
                  formatter={(v: number) => [pct(v), 'Change']}
                  contentStyle={{ fontSize: 12 }}
                />
                <Bar dataKey="change" radius={[4, 4, 0, 0]}>
                  {bookingChangeData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.change >= 0 ? '#10b981' : '#ef4444'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Search vs Booking Trend">
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-slate-400">Loading…</div>
          ) : filteredTimeline.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-400">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={filteredTimeline} margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => (v?.length >= 10 ? v.slice(0, 7) : v)}
                />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={fmt} width={52} />
                <Tooltip formatter={(v: number) => [fmt(v), '']} contentStyle={{ fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line
                  type="monotone"
                  dataKey="search_demand"
                  name="Search Demand"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="bookings"
                  name="Bookings"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Destination Growth Scatter">
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-slate-400">Loading…</div>
          ) : scatterData.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-400">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <ScatterChart margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="pre_bookings"
                  name="Pre-Crisis Bookings"
                  tick={{ fontSize: 11 }}
                  tickFormatter={fmt}
                  label={{ value: 'Pre-Crisis Bookings', position: 'insideBottom', offset: -4, fontSize: 11 }}
                />
                <YAxis
                  dataKey="change_pct"
                  name="Booking Change %"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => v + '%'}
                  label={{ value: 'Change %', angle: -90, position: 'insideLeft', fontSize: 11 }}
                  width={56}
                />
                <ZAxis range={[40, 200]} />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  contentStyle={{ fontSize: 12 }}
                  formatter={(value: number, name: string) => {
                    if (name === 'Pre-Crisis Bookings') return [fmt(value), name]
                    return [pct(value), name]
                  }}
                  labelFormatter={(_: unknown, payload: Array<{ payload?: { destination?: string } }>) =>
                    payload?.[0]?.payload?.destination ?? ''
                  }
                />
                <Scatter data={scatterData} fill="#6366f1">
                  {scatterData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.change_pct >= 0 ? '#10b981' : '#ef4444'}
                    />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Corridor Matrix */}
      {!loading && corridor.length > 0 && <CorridorMatrix data={corridor} />}

      {/* Destination Performance Table */}
      {!loading && shockMetrics.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 overflow-x-auto">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Destination Performance</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 pr-4 font-medium text-gray-500">Destination</th>
                <th className="text-right py-2 px-3 font-medium text-gray-500">Pre Bookings</th>
                <th className="text-right py-2 px-3 font-medium text-gray-500">Post Bookings</th>
                <th className="text-right py-2 px-3 font-medium text-gray-500">Booking Chg%</th>
                <th className="text-right py-2 px-3 font-medium text-gray-500">Search Chg%</th>
                <th className="text-right py-2 pl-3 font-medium text-gray-500">ADR Chg%</th>
              </tr>
            </thead>
            <tbody>
              {shockMetrics.map((m) => (
                <tr key={m.destination_id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="py-2.5 pr-4 font-medium text-gray-800">{countryName(m.destination_id)}</td>
                  <td className="py-2.5 px-3 text-right text-gray-600 tabular-nums">
                    {m.pre_bookings != null ? m.pre_bookings.toLocaleString() : '—'}
                  </td>
                  <td className="py-2.5 px-3 text-right text-gray-600 tabular-nums">
                    {m.post_bookings != null ? m.post_bookings.toLocaleString() : '—'}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-md text-xs font-semibold tabular-nums ${
                        m.booking_change_pct == null
                          ? 'bg-gray-50 text-gray-500'
                          : m.booking_change_pct >= 0
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-red-50 text-red-700'
                      }`}
                    >
                      {pct(m.booking_change_pct)}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-md text-xs font-semibold tabular-nums ${
                        m.search_change_pct == null
                          ? 'bg-gray-50 text-gray-500'
                          : (m.search_change_pct ?? 0) >= 0
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-red-50 text-red-700'
                      }`}
                    >
                      {pct(m.search_change_pct)}
                    </span>
                  </td>
                  <td className="py-2.5 pl-3 text-right">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-md text-xs font-semibold tabular-nums ${
                        m.adr_change_pct == null
                          ? 'bg-gray-50 text-gray-500'
                          : (m.adr_change_pct ?? 0) >= 0
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-red-50 text-red-700'
                      }`}
                    >
                      {pct(m.adr_change_pct)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Revenue Calculator + Action Panel — side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RevenueCalculator
          fields={REVENUE_FIELDS}
          formula={revenueFormula}
          resultLabel="Estimated Profit ($)"
        />
        <ActionPanel actions={DMC_ACTIONS} />
      </div>
    </div>
  )
}
