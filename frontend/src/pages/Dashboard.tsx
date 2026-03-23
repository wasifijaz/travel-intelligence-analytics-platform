import { useEffect, useState, useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart,
  BarChart,
  Bar,
  Cell,
} from 'recharts'
import {
  fetchSummary,
  fetchTimeline,
  fetchAnalytics,
  fetchCrisisEvents,
  fetchFunnel,
  fetchPrePost,
  fetchBehavior,
  fetchTravelFlows,
  checkHealth,
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
import DemandFunnel from '../components/DemandFunnel'
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

interface FunnelStage {
  name: string
  value: number
}

interface PrePostData {
  pre: Record<string, number>
  post: Record<string, number>
  [key: string]: unknown
}

function formatNum(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return n % 1 === 0 ? String(n) : n.toFixed(1)
}

function pctChange(pre: number, post: number): number | undefined {
  if (!pre || pre === 0) return undefined
  return ((post - pre) / Math.abs(pre)) * 100
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

export default function Dashboard() {
  const { filters, latestMiddleEastCrisis } = useFilters()
  const filterParams = useFilterParams()
  const period = filters.period

  const [summary, setSummary] = useState<Summary | null>(null)
  const [timeline, setTimeline] = useState<TimelinePoint[]>([])
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [crisis, setCrisis] = useState<CrisisEvent[]>([])
  const [funnel, setFunnel] = useState<FunnelStage[]>([])
  const [prepost, setPrepost] = useState<PrePostData | null>(null)
  const [behaviorData, setBehaviorData] = useState<Record<string, unknown> | null>(null)
  const [travelFlows, setTravelFlows] = useState<{ travel_type: string; bookings: number; share_pct: number; avg_adr: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [backendOk, setBackendOk] = useState<boolean | null>(null)

  useEffect(() => {
    checkHealth().then((r) => setBackendOk(r?.status === 'ok')).catch(() => setBackendOk(false))
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    Promise.all([
      fetchSummary(filterParams),
      fetchTimeline(filterParams),
      fetchAnalytics(filterParams),
      fetchCrisisEvents(),
      fetchFunnel(filterParams).catch(() => ({ stages: [] })),
      fetchPrePost(filterParams).catch(() => null),
      fetchBehavior(filterParams).catch(() => null),
      fetchTravelFlows(filterParams).catch(() => ({ data: [] })),
    ])
      .then(([s, t, a, c, f, pp, beh, tf]) => {
        if (cancelled) return
        setSummary(s)
        setTimeline(t.data || [])
        setAnalytics(a)
        setCrisis(c.data || [])
        const stages: FunnelStage[] = Array.isArray(f?.stages)
          ? f.stages
          : Array.isArray(f?.data)
            ? f.data
            : Array.isArray(f)
              ? f
              : []
        setFunnel(stages)
        setPrepost(pp)
        setBehaviorData(beh)
        setTravelFlows(Array.isArray(tf?.data) ? tf.data : [])
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || 'Failed to load data')
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

  const avgAdr = useMemo(() => {
    if (!timeline.length) return 0
    const valid = timeline.filter((t) => t.adr > 0)
    if (!valid.length) return 0
    return valid.reduce((sum, t) => sum + t.adr, 0) / valid.length
  }, [timeline])

  const totalSearchDemand = useMemo(() => {
    return timeline.reduce((sum, t) => sum + (t.search_demand || 0), 0)
  }, [timeline])

  const prepostChanges = useMemo(() => {
    if (!prepost?.pre || !prepost?.post) return null
    const pre = prepost.pre as Record<string, number>
    const post = prepost.post as Record<string, number>
    return {
      bookings: pctChange(pre.bookings ?? pre.total_bookings ?? 0, post.bookings ?? post.total_bookings ?? 0),
      room_nights: pctChange(pre.room_nights ?? pre.total_room_nights ?? 0, post.room_nights ?? post.total_room_nights ?? 0),
      adr: pctChange(pre.adr ?? pre.avg_adr ?? 0, post.adr ?? post.avg_adr ?? 0),
      destinations: pctChange(pre.destinations ?? pre.destinations_count ?? 0, post.destinations ?? post.destinations_count ?? 0),
      search_demand: pctChange(pre.search_demand ?? 0, post.search_demand ?? 0),
    }
  }, [prepost])

  const insights = useMemo(() => {
    const items: string[] = []
    if (summary) {
      items.push(
        `Total bookings across ${summary.destinations_count} destinations: ${formatNum(summary.total_bookings)}`
      )
    }
    if (analytics?.top_gaining?.[0]) {
      const g = analytics.top_gaining[0]
      items.push(
        `Top gaining market: ${countryName(g.destination_id)} with +${(g.booking_change_pct ?? 0).toFixed(1)}% booking change`
      )
    }
    if (analytics?.top_losing?.[0]) {
      const l = analytics.top_losing[0]
      items.push(
        `Top declining market: ${countryName(l.destination_id)} with ${(l.booking_change_pct ?? 0).toFixed(1)}% booking change`
      )
    }
    if (analytics?.search_booking_corr?.pearson_r != null) {
      items.push(
        `Search-to-booking correlation: r=${analytics.search_booking_corr.pearson_r.toFixed(3)}`
      )
    }
    if (summary?.date_min && summary?.date_max) {
      items.push(`Data range: ${summary.date_min} to ${summary.date_max}`)
    }
    return items
  }, [summary, analytics])

  const monthlyBookings = useMemo(() => {
    const grouped: Record<string, { month: string; bookings: number }> = {}
    timeline.forEach((t) => {
      const month = t.date?.slice(0, 7)
      if (!month) return
      if (!grouped[month]) grouped[month] = { month, bookings: 0 }
      grouped[month].bookings += t.bookings
    })
    return Object.values(grouped).sort((a, b) => a.month.localeCompare(b.month))
  }, [timeline])

  const searchBookingRatio = useMemo(() => {
    return timeline
      .filter((t) => t.bookings > 0)
      .map((t) => ({
        date: t.date,
        ratio: t.search_demand && t.bookings ? +(t.search_demand / t.bookings).toFixed(2) : 0,
      }))
  }, [timeline])

  const gainersData = useMemo(() => {
    return [...(analytics?.top_gaining ?? [])]
      .sort((a, b) => (b.booking_change_pct ?? 0) - (a.booking_change_pct ?? 0))
      .slice(0, 10)
      .map((d) => ({
        destination: countryName(d.destination_id),
        change: +(d.booking_change_pct ?? 0).toFixed(1),
      }))
  }, [analytics])

  const losersData = useMemo(() => {
    return [...(analytics?.top_losing ?? [])]
      .sort((a, b) => (a.booking_change_pct ?? 0) - (b.booking_change_pct ?? 0))
      .slice(0, 10)
      .map((d) => ({
        destination: countryName(d.destination_id),
        change: +(d.booking_change_pct ?? 0).toFixed(1),
      }))
  }, [analytics])

  const destinationsGaining = useMemo(() => {
    return (analytics?.shock_metrics ?? [])
      .filter((m) => (m.booking_change_pct ?? 0) > 10)
      .sort((a, b) => (b.booking_change_pct ?? 0) - (a.booking_change_pct ?? 0))
      .map((m) => ({ name: countryName(m.destination_id), change: +(m.booking_change_pct ?? 0).toFixed(1) }))
  }, [analytics])

  const destinationsLosing = useMemo(() => {
    return (analytics?.shock_metrics ?? [])
      .filter((m) => (m.booking_change_pct ?? 0) < -10)
      .sort((a, b) => (a.booking_change_pct ?? 0) - (b.booking_change_pct ?? 0))
      .map((m) => ({ name: countryName(m.destination_id), change: +(m.booking_change_pct ?? 0).toFixed(1) }))
  }, [analytics])

  const behaviorCharts = useMemo(() => {
    if (!behaviorData) return null
    const raw = behaviorData as Record<string, unknown>
    const toBarData = (arr: unknown): { name: string; value: number; pct: number }[] => {
      if (!arr) return []
      if (Array.isArray(arr)) {
        return arr
          .filter((item: Record<string, unknown>) => item && typeof item === 'object')
          .map((item: Record<string, unknown>) => ({
            name: String(item.category || item.name || ''),
            value: Number(item.count ?? item.value ?? 0),
            pct: Number(item.pct ?? 0),
          }))
      }
      if (typeof arr === 'object') {
        return Object.entries(arr as Record<string, number>)
          .map(([name, value]) => ({ name, value: Number(value) || 0, pct: 0 }))
      }
      return []
    }
    return {
      lengthOfStay: toBarData(raw.length_of_stay),
      bookingWindow: toBarData(raw.booking_window),
      travelerType: toBarData(raw.traveler_type),
    }
  }, [behaviorData])

  const actions = useMemo(() => {
    const items: { title: string; description: string; priority: 'high' | 'medium' | 'low' }[] = []
    if (analytics?.top_losing?.[0]) {
      const worst = analytics.top_losing[0]
      items.push({
        title: `Urgent: Support ${countryName(worst.destination_id)}`,
        description: `This destination saw a ${(worst.booking_change_pct ?? 0).toFixed(1)}% drop in bookings. Consider targeted marketing campaigns and rate adjustments.`,
        priority: 'high',
      })
    }
    if (analytics?.top_gaining?.[0]) {
      const best = analytics.top_gaining[0]
      items.push({
        title: `Capitalize on ${countryName(best.destination_id)} growth`,
        description: `Bookings grew ${(best.booking_change_pct ?? 0).toFixed(1)}%. Increase inventory allocation and premium pricing strategies.`,
        priority: 'medium',
      })
    }
    if (analytics?.search_booking_corr?.pearson_r != null && analytics.search_booking_corr.pearson_r > 0.5) {
      items.push({
        title: 'Leverage search-booking correlation',
        description: `With r=${analytics.search_booking_corr.pearson_r.toFixed(2)}, search demand strongly predicts bookings. Invest in SEO and SEM for underperforming destinations.`,
        priority: 'medium',
      })
    }
    if (crisis.length > 0) {
      items.push({
        title: 'Review crisis preparedness',
        description: `${crisis.length} crisis event(s) recorded. Ensure recovery playbooks are up to date for all affected regions.`,
        priority: crisis.length >= 3 ? 'high' : 'low',
      })
    }
    if (prepostChanges?.adr != null && prepostChanges.adr < -5) {
      items.push({
        title: 'ADR recovery plan needed',
        description: `Average daily rate dropped ${Math.abs(prepostChanges.adr).toFixed(1)}% post-crisis. Evaluate revenue management strategies.`,
        priority: 'high',
      })
    }
    if (!items.length) {
      items.push({
        title: 'Monitor data quality',
        description: 'Continue tracking all KPIs and review data freshness regularly.',
        priority: 'low',
      })
    }
    return items
  }, [analytics, crisis, prepostChanges])

  const prepostStats = useMemo(() => {
    if (!prepost?.pre || !prepost?.post || period === 'all') return null
    const source = period === 'pre' ? prepost.pre : prepost.post
    return source as Record<string, number>
  }, [prepost, period])

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
      <div className="space-y-4">
        {backendOk === false && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-amber-800 text-sm">
            Backend not reachable. Run <strong>run_backend.bat</strong> and leave that window open, then refresh.
          </div>
        )}
        <div className="rounded-xl bg-red-50 border border-red-200 p-6 text-red-700">
          <p className="font-medium text-lg">Error loading dashboard</p>
          <p className="text-sm mt-2">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 text-sm font-medium bg-red-100 hover:bg-red-200 text-red-800 rounded-lg transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {backendOk === false && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-amber-800 text-sm">
          Backend not reachable. Run <strong>run_backend.bat</strong> and leave that window open, then refresh.
        </div>
      )}

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

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Executive Overview</h2>
          <p className="text-sm text-slate-500 mt-1">Hospitality market intelligence at a glance</p>
        </div>
        {period !== 'all' && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700 border border-indigo-200">
            Viewing: {period === 'pre' ? 'Pre-Crisis' : 'Post-Crisis'} data
            {crisisDate && <span className="text-indigo-400 ml-1">({crisisDate})</span>}
          </span>
        )}
      </div>

      {/* § 1 — Executive Summary */}
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

      {/* § 3 — KPI Cards */}
      {loading ? (
        <SkeletonKpiRow />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <KpiCard
            title="Total Bookings"
            value={summary ? formatNum(summary.total_bookings) : '—'}
            change={prepostChanges?.bookings}
            icon="📊"
            subtitle="All destinations"
          />
          <KpiCard
            title="Room Nights"
            value={summary ? formatNum(summary.total_room_nights) : '—'}
            change={prepostChanges?.room_nights}
            icon="🛏️"
            subtitle="Cumulative"
          />
          <KpiCard
            title="Avg ADR"
            value={avgAdr ? `$${formatNum(Math.round(avgAdr))}` : '—'}
            change={prepostChanges?.adr}
            icon="💰"
            subtitle="Average daily rate"
          />
          <KpiCard
            title="Destinations"
            value={summary?.destinations_count ?? '—'}
            change={prepostChanges?.destinations}
            icon="🌍"
            subtitle="Active markets"
          />
          <KpiCard
            title="Search Demand"
            value={formatNum(totalSearchDemand)}
            change={prepostChanges?.search_demand}
            icon="🔍"
            subtitle="Total search volume"
          />
          <KpiCard
            title="Crisis Events"
            value={crisis.length}
            icon="⚠️"
            subtitle="Recorded events"
          />
        </div>
      )}

      {/* § 4 — Demand Funnel */}
      {loading ? (
        <SkeletonBlock className="h-64" />
      ) : funnel.length > 0 ? (
        <DemandFunnel stages={funnel} />
      ) : null}

      {/* § 4b — Sankey Demand Shift Flow */}
      {!loading && (analytics?.sankey_flows?.length ?? 0) > 0 && (
        <ChartCard title="Demand Shift — Traveler Flow Between Destinations">
          <SankeyFlow flows={analytics?.sankey_flows || []} />
        </ChartCard>
      )}

      {/* § 5 — Time Series Charts (2×2) */}
      {loading ? (
        <SkeletonChartGrid />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Bookings & Search Demand */}
          <ChartCard title="Bookings & Search Demand over Time">
            {timeline.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-slate-400">No timeline data</div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={timeline} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: string) => v?.slice(0, 7) ?? v}
                    interval="preserveStartEnd"
                  />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={formatNum} width={52} />
                  <Tooltip
                    formatter={(v: number, name: string) => [formatNum(v), name]}
                    labelFormatter={(l: string) => `Date: ${l}`}
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null
                      return (
                        <div className="bg-white border border-slate-200 rounded-lg shadow-md p-3 text-xs">
                          <p className="font-semibold text-slate-700 mb-1">Date: {label}</p>
                          {payload.map((p, i) => (
                            <p key={i} style={{ color: p.color }} className="flex justify-between gap-4">
                              <span>{p.name}:</span>
                              <span className="font-medium">{formatNum(Number(p.value))}</span>
                            </p>
                          ))}
                          <p className="text-slate-400 mt-1 pt-1 border-t border-slate-100">Metric: Demand Overview</p>
                        </div>
                      )
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} iconSize={10} />
                  <Line type="monotone" dataKey="bookings" name="Bookings" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="search_demand" name="Search Demand" stroke="#10b981" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* ADR & Room Nights (dual Y-axis) */}
          <ChartCard title="ADR & Room Nights over Time">
            {timeline.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-slate-400">No timeline data</div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={timeline} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: string) => v?.slice(0, 7) ?? v}
                    interval="preserveStartEnd"
                  />
                  <YAxis yAxisId="L" tick={{ fontSize: 11 }} tickFormatter={formatNum} width={52} />
                  <YAxis yAxisId="R" orientation="right" tick={{ fontSize: 11 }} width={52} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null
                      return (
                        <div className="bg-white border border-slate-200 rounded-lg shadow-md p-3 text-xs">
                          <p className="font-semibold text-slate-700 mb-1">Date: {label}</p>
                          {payload.map((p, i) => (
                            <p key={i} style={{ color: p.color }} className="flex justify-between gap-4">
                              <span>{p.name}:</span>
                              <span className="font-medium">
                                {p.name === 'ADR ($)' ? `$${Number(p.value).toFixed(0)}` : formatNum(Number(p.value))}
                              </span>
                            </p>
                          ))}
                          <p className="text-slate-400 mt-1 pt-1 border-t border-slate-100">Metric: Revenue & Occupancy</p>
                        </div>
                      )
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} iconSize={10} />
                  <Area yAxisId="L" type="monotone" dataKey="room_nights" name="Room Nights" fill="#3b82f6" fillOpacity={0.25} stroke="#3b82f6" strokeWidth={2} />
                  <Area yAxisId="R" type="monotone" dataKey="adr" name="ADR ($)" fill="#f59e0b" fillOpacity={0.15} stroke="#f59e0b" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* Monthly Bookings Trend */}
          <ChartCard title="Monthly Bookings Trend">
            {monthlyBookings.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-slate-400">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={monthlyBookings} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={formatNum} width={52} />
                  <Tooltip
                    formatter={(v: number) => [formatNum(v), 'Bookings']}
                    labelFormatter={(l: string) => `Month: ${l}`}
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                  <Bar dataKey="bookings" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* Search-to-Booking Ratio */}
          <ChartCard title="Search-to-Booking Ratio over Time">
            {searchBookingRatio.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-slate-400">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={searchBookingRatio} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: string) => v?.slice(0, 7) ?? v}
                    interval="preserveStartEnd"
                  />
                  <YAxis tick={{ fontSize: 11 }} width={52} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null
                      return (
                        <div className="bg-white border border-slate-200 rounded-lg shadow-md p-3 text-xs">
                          <p className="font-semibold text-slate-700 mb-1">Date: {label}</p>
                          {payload.map((p, i) => (
                            <p key={i} style={{ color: p.color }} className="flex justify-between gap-4">
                              <span>{p.name}:</span>
                              <span className="font-medium">{Number(p.value).toFixed(2)}</span>
                            </p>
                          ))}
                          <p className="text-slate-400 mt-1 pt-1 border-t border-slate-100">Metric: Conversion Efficiency</p>
                        </div>
                      )
                    }}
                  />
                  <Line type="monotone" dataKey="ratio" name="Search/Booking" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>
      )}

      {/* § 6 — Top Gainers / Losers (side by side) */}
      {loading ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <SkeletonBlock className="h-80" />
          <SkeletonBlock className="h-80" />
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <ChartCard title="Top Gaining Destinations">
            {gainersData.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-slate-400">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(280, gainersData.length * 36)}>
                <BarChart data={gainersData} layout="vertical" margin={{ top: 4, right: 30, left: 10, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v}%`} />
                  <YAxis type="category" dataKey="destination" tick={{ fontSize: 11 }} width={120} />
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

          <ChartCard title="Top Declining Destinations">
            {losersData.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-slate-400">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(280, losersData.length * 36)}>
                <BarChart data={losersData} layout="vertical" margin={{ top: 4, right: 30, left: 10, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v}%`} />
                  <YAxis type="category" dataKey="destination" tick={{ fontSize: 11 }} width={120} />
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
        </div>
      )}

      {/* § 6b — Destinations Unlocked vs Lost */}
      {!loading && (destinationsGaining.length > 0 || destinationsLosing.length > 0) && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-sm border border-emerald-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <h3 className="text-lg font-semibold text-emerald-800">Destinations Gaining</h3>
              <span className="text-xs text-emerald-500 ml-auto">&gt;10% booking growth</span>
            </div>
            {destinationsGaining.length === 0 ? (
              <p className="text-sm text-slate-400">No destinations with &gt;10% growth</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {destinationsGaining.map((d) => (
                  <div key={d.name} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-emerald-50 hover:bg-emerald-100 transition-colors">
                    <span className="text-sm font-medium text-emerald-900">{d.name}</span>
                    <span className="text-sm font-bold text-emerald-600 tabular-nums">+{d.change}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-red-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
              <h3 className="text-lg font-semibold text-red-800">Destinations Losing</h3>
              <span className="text-xs text-red-500 ml-auto">&lt;-10% booking decline</span>
            </div>
            {destinationsLosing.length === 0 ? (
              <p className="text-sm text-slate-400">No destinations with &lt;-10% decline</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {destinationsLosing.map((d) => (
                  <div key={d.name} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-red-50 hover:bg-red-100 transition-colors">
                    <span className="text-sm font-medium text-red-900">{d.name}</span>
                    <span className="text-sm font-bold text-red-600 tabular-nums">{d.change}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* § 6c — Travel Behavior */}
      {!loading && behaviorCharts && (
        <div>
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Travel Behavior Distributions</h3>
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {behaviorCharts.lengthOfStay.length > 0 && (
              <ChartCard title="Length of Stay">
                <ResponsiveContainer width="100%" height={Math.max(220, behaviorCharts.lengthOfStay.length * 32)}>
                  <BarChart data={behaviorCharts.lengthOfStay} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={formatNum} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                    <Tooltip formatter={(v: number) => [formatNum(v), 'Bookings']} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Bar dataKey="value" fill="#6366f1" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            )}
            {behaviorCharts.bookingWindow.length > 0 && (
              <ChartCard title="Booking Window">
                <ResponsiveContainer width="100%" height={Math.max(220, behaviorCharts.bookingWindow.length * 32)}>
                  <BarChart data={behaviorCharts.bookingWindow} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={formatNum} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                    <Tooltip formatter={(v: number) => [formatNum(v), 'Bookings']} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            )}
            {behaviorCharts.travelerType.length > 0 && (
              <ChartCard title="Traveler Type">
                <ResponsiveContainer width="100%" height={Math.max(220, behaviorCharts.travelerType.length * 32)}>
                  <BarChart data={behaviorCharts.travelerType} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={formatNum} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                    <Tooltip formatter={(v: number) => [formatNum(v), 'Bookings']} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Bar dataKey="value" fill="#10b981" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            )}
          </div>
        </div>
      )}

      {/* § 6d — Travel Flow Analysis */}
      {!loading && travelFlows.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Travel Flow Analysis</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartCard title="Demand Share by Travel Type">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={travelFlows} margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="travel_type" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={formatNum} />
                  <Tooltip formatter={(v: number, name: string) => [name === 'share_pct' ? `${v}%` : formatNum(v), name]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Bar dataKey="bookings" name="Bookings" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h4 className="text-sm font-semibold text-gray-700 mb-3">Travel Type Breakdown</h4>
              <div className="space-y-3">
                {travelFlows.map(f => (
                  <div key={f.travel_type} className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-800 w-28 capitalize">{f.travel_type}</span>
                    <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${f.share_pct}%` }} />
                    </div>
                    <span className="text-xs font-mono text-gray-600 w-20 text-right">{f.share_pct}% ({formatNum(f.bookings)})</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-3 border-t border-gray-100 text-xs text-gray-400">
                Avg ADR: {travelFlows.map(f => `${f.travel_type}: $${f.avg_adr?.toFixed(0) ?? '—'}`).join(' | ')}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* § 7 — Crisis Events Table */}
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
                    <th className="text-left py-3 px-3 font-semibold text-slate-700">Event Name</th>
                    <th className="text-left py-3 px-3 font-semibold text-slate-700">Start Date</th>
                    <th className="text-left py-3 px-3 font-semibold text-slate-700">End Date</th>
                    <th className="text-left py-3 px-3 font-semibold text-slate-700">Regions</th>
                  </tr>
                </thead>
                <tbody>
                  {crisis.map((e, i) => (
                    <tr
                      key={e.crisis_id ?? i}
                      className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                    >
                      <td className="py-2.5 px-3 text-slate-800 font-medium">{e.crisis_name}</td>
                      <td className="py-2.5 px-3 text-slate-600">{e.crisis_start_date}</td>
                      <td className="py-2.5 px-3 text-slate-600">{e.crisis_end_date ?? '—'}</td>
                      <td className="py-2.5 px-3 text-slate-600 max-w-xs truncate" title={formatRegions(e.affected_regions)}>
                        {formatRegions(e.affected_regions)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ChartCard>
      )}

      {/* § 8 — Action Panel */}
      {loading ? (
        <SkeletonBlock className="h-48" />
      ) : (
        <ActionPanel actions={actions} />
      )}
    </div>
  )
}
