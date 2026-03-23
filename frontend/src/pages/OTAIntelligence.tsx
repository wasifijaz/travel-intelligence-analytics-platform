import { useEffect, useState, useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from 'recharts'
import {
  fetchSummary,
  fetchAnalytics,
  fetchCorridor,
  fetchRiskIndex,
  fetchPrePost,
  type Summary,
  type ShockMetric,
} from '../services/api'
import { countryName } from '../utils/countryNames'
import { useFilters } from '../context/FilterContext'
import { useFilterParams } from '../hooks/useFilteredData'
import KpiCard from '../components/KpiCard'
import ExecSummary from '../components/ExecSummary'
import ActionPanel from '../components/ActionPanel'
import ChartCard from '../components/ChartCard'
import CorridorMatrix from '../components/CorridorMatrix'
import RiskHeatmap from '../components/RiskHeatmap'
import DataTable from '../components/DataTable'
import SankeyFlow from '../components/SankeyFlow'

interface CorridorRow {
  source: string
  bookings_pre: number
  bookings_post: number
  change_pct: number
}

interface RiskEntry {
  destination_id: string
  travel_risk_index: number
  risk_tier: string
}

interface ResilienceEntry {
  destination_id: string
  resilience_score: number
  [k: string]: unknown
}

function fmt(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return n.toFixed(0)
}

function pct(n: number): string {
  return (n >= 0 ? '+' : '') + n.toFixed(1) + '%'
}

export default function OTAIntelligence() {
  const { filters, latestMiddleEastCrisis } = useFilters()
  const filterParams = useFilterParams()
  const period = filters.period

  const [summary, setSummary] = useState<Summary | null>(null)
  const [analytics, setAnalytics] = useState<{
    shock_metrics: ShockMetric[]
    top_gaining: ShockMetric[]
    top_losing: ShockMetric[]
    substitution: ShockMetric[]
    sankey_flows: { source: string; target: string; value: number }[]
    resilience_ranking: ResilienceEntry[]
    search_booking_corr: { pearson_r?: number; spearman_rho?: number; r_squared?: number; n?: number }
  } | null>(null)
  const [corridorData, setCorridorData] = useState<CorridorRow[]>([])
  const [riskData, setRiskData] = useState<RiskEntry[]>([])
  const [prePostRaw, setPrePostRaw] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([
      fetchSummary(filterParams),
      fetchAnalytics(filterParams),
      fetchCorridor(filterParams),
      fetchRiskIndex(filterParams),
      fetchPrePost(filterParams),
    ])
      .then(([s, a, cor, risk, pp]) => {
        if (cancelled) return
        setSummary(s)
        setAnalytics(a as typeof analytics)
        const corRows = (cor as { data?: CorridorRow[] })?.data ?? (Array.isArray(cor) ? cor : [])
        setCorridorData(corRows as CorridorRow[])
        const riskRows = (risk as { data?: RiskEntry[] })?.data ?? (Array.isArray(risk) ? risk : [])
        setRiskData(riskRows as RiskEntry[])
        setPrePostRaw(pp as Record<string, unknown>)
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || 'Failed to load data')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [filterParams])

  const shockMetrics = analytics?.shock_metrics ?? []
  const sankeyFlows = analytics?.sankey_flows ?? []
  const corr = analytics?.search_booking_corr

  const destCount = summary?.destinations_count ?? shockMetrics.length

  const avgBookingChange = useMemo(() => {
    const valid = shockMetrics.filter((m) => m.booking_change_pct != null)
    if (!valid.length) return 0
    return valid.reduce((s, m) => s + (m.booking_change_pct ?? 0), 0) / valid.length
  }, [shockMetrics])

  const resilientCount = useMemo(() => {
    return shockMetrics.filter((m) => (m.booking_change_pct ?? -1) > 0).length
  }, [shockMetrics])

  const topGainer = useMemo(() => {
    if (analytics?.top_gaining?.length) return countryName(analytics.top_gaining[0].destination_id)
    const sorted = [...shockMetrics].sort((a, b) => (b.booking_change_pct ?? -Infinity) - (a.booking_change_pct ?? -Infinity))
    return sorted[0] ? countryName(sorted[0].destination_id) : 'N/A'
  }, [analytics, shockMetrics])

  const topDecliner = useMemo(() => {
    if (analytics?.top_losing?.length) return countryName(analytics.top_losing[0].destination_id)
    const sorted = [...shockMetrics].sort((a, b) => (a.booking_change_pct ?? Infinity) - (b.booking_change_pct ?? Infinity))
    return sorted[0] ? countryName(sorted[0].destination_id) : 'N/A'
  }, [analytics, shockMetrics])

  const pearsonR = corr?.pearson_r ?? 0
  const rSquared = corr?.r_squared ?? 0

  const demandGrowthRate = useMemo(() => {
    const valid = shockMetrics.filter(m => m.booking_change_pct != null)
    if (!valid.length) return 0
    const positives = valid.filter(m => (m.booking_change_pct ?? 0) > 0)
    return (positives.length / valid.length) * 100
  }, [shockMetrics])

  const adrChangeByDest = useMemo(() => {
    return [...shockMetrics]
      .filter(m => m.adr_change_pct != null)
      .sort((a, b) => Math.abs(b.adr_change_pct ?? 0) - Math.abs(a.adr_change_pct ?? 0))
      .slice(0, 10)
      .map(m => ({
        destination: countryName(m.destination_id),
        adr_change: m.adr_change_pct ?? 0,
      }))
  }, [shockMetrics])

  const marketShareRankings = useMemo(() => {
    return [...shockMetrics]
      .sort((a, b) => (b.post_bookings ?? 0) - (a.post_bookings ?? 0))
      .slice(0, 10)
      .map((m, i) => ({
        rank: i + 1,
        destination: countryName(m.destination_id),
        postBookings: m.post_bookings ?? 0,
        change: m.booking_change_pct ?? 0,
      }))
  }, [shockMetrics])

  const insights = useMemo(() => [
    `Monitoring ${destCount} destinations across full crisis timeline`,
    `Average booking change: ${pct(avgBookingChange)} post-crisis`,
    `Search-booking correlation: r=${pearsonR.toFixed(3)} (R²=${rSquared.toFixed(3)})`,
    `${resilientCount} destinations showing positive recovery signals`,
    `Demand substitution observed: top gainer is ${topGainer}`,
  ], [destCount, avgBookingChange, pearsonR, rSquared, resilientCount, topGainer])

  const crisisDate = useMemo(() => {
    const pp = prePostRaw
    if (pp?.crisis_date) return String(pp.crisis_date)
    if (pp?.date) return String(pp.date)
    return undefined
  }, [prePostRaw])

  const bookingChangeChart = useMemo(() => {
    return shockMetrics
      .filter((m) => m.booking_change_pct != null)
      .sort((a, b) => Math.abs(b.booking_change_pct ?? 0) - Math.abs(a.booking_change_pct ?? 0))
      .slice(0, 10)
      .map((m) => ({
        destination_id: countryName(m.destination_id),
        booking_change_pct: m.booking_change_pct ?? 0,
      }))
      .sort((a, b) => b.booking_change_pct - a.booking_change_pct)
  }, [shockMetrics])

  const searchChangeChart = useMemo(() => {
    return shockMetrics
      .filter((m) => m.search_change_pct != null)
      .sort((a, b) => Math.abs(b.search_change_pct ?? 0) - Math.abs(a.search_change_pct ?? 0))
      .slice(0, 10)
      .map((m) => ({
        destination_id: countryName(m.destination_id),
        search_change_pct: m.search_change_pct ?? 0,
      }))
      .sort((a, b) => b.search_change_pct - a.search_change_pct)
  }, [shockMetrics])

  const resilienceData = useMemo(() => {
    const ranking = analytics?.resilience_ranking ?? []
    return (ranking as ResilienceEntry[])
      .filter((r) => r.destination_id && r.resilience_score != null)
      .sort((a, b) => (b.resilience_score ?? 0) - (a.resilience_score ?? 0))
      .slice(0, 15)
      .map(r => ({
        ...r,
        destination_id: countryName(r.destination_id),
      }))
  }, [analytics])

  const substitutionViz = useMemo(() => {
    const losers = [...shockMetrics]
      .filter((m) => (m.booking_change_pct ?? 0) < 0)
      .sort((a, b) => (a.booking_change_pct ?? 0) - (b.booking_change_pct ?? 0))
      .slice(0, 5)
    const gainers = [...shockMetrics]
      .filter((m) => (m.booking_change_pct ?? 0) > 0)
      .sort((a, b) => (b.booking_change_pct ?? 0) - (a.booking_change_pct ?? 0))
      .slice(0, 5)
    return { losers, gainers }
  }, [shockMetrics])

  const deepDiveColumns = [
    { key: 'destination_id', label: 'Destination', format: (v: unknown) => countryName(String(v ?? '')) },
    { key: 'booking_change_pct', label: 'Booking Chg %', format: (v: unknown) => v != null ? pct(Number(v)) : '—' },
    { key: 'search_change_pct', label: 'Search Chg %', format: (v: unknown) => v != null ? pct(Number(v)) : '—' },
    { key: 'adr_change_pct', label: 'ADR Chg %', format: (v: unknown) => v != null ? pct(Number(v)) : '—' },
    { key: 'cancellation_spike', label: 'Cancel Spike', format: (v: unknown) => v != null ? Number(v).toFixed(2) : '—' },
    { key: 'pre_bookings', label: 'Pre Bookings', format: (v: unknown) => v != null ? fmt(Number(v)) : '—' },
    { key: 'post_bookings', label: 'Post Bookings', format: (v: unknown) => v != null ? fmt(Number(v)) : '—' },
  ]

  const otaDestsGaining = useMemo(() => {
    return shockMetrics
      .filter((m) => (m.booking_change_pct ?? 0) > 10)
      .sort((a, b) => (b.booking_change_pct ?? 0) - (a.booking_change_pct ?? 0))
      .map((m) => ({ name: countryName(m.destination_id), change: +(m.booking_change_pct ?? 0).toFixed(1) }))
  }, [shockMetrics])

  const otaDestsLosing = useMemo(() => {
    return shockMetrics
      .filter((m) => (m.booking_change_pct ?? 0) < -10)
      .sort((a, b) => (a.booking_change_pct ?? 0) - (b.booking_change_pct ?? 0))
      .map((m) => ({ name: countryName(m.destination_id), change: +(m.booking_change_pct ?? 0).toFixed(1) }))
  }, [shockMetrics])

  const actions = [
    { title: 'Reallocate Inventory', description: 'Reallocate inventory to gaining destinations', priority: 'high' as const },
    { title: 'Monitor Recovery Signals', description: 'Monitor recovery signals in declining markets', priority: 'high' as const },
    { title: 'Adjust Search Marketing', description: 'Adjust search marketing for high-correlation markets', priority: 'medium' as const },
    { title: 'Review Pricing Strategy', description: 'Review pricing in markets with ADR volatility', priority: 'medium' as const },
    { title: 'Expand Resilient Markets', description: 'Expand presence in resilient destinations', priority: 'low' as const },
  ]

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-slate-800">Market Intelligence</h2>
        <div className="flex items-center justify-center h-64 text-slate-400">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span>Loading market intelligence...</span>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-slate-800">Market Intelligence</h2>
        <div className="rounded-xl bg-red-50 border border-red-200 p-6 text-red-700">
          <p className="font-medium">Error loading data</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Market Intelligence</h2>
        <p className="text-slate-500 mt-1">Crisis impact analysis, demand substitution, and destination resilience.</p>
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
      <ExecSummary insights={insights} />

      {/* Period indicator */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-slate-600">Period:</span>
        <span className={`text-sm font-semibold px-3 py-1 rounded-full ${
          period === 'pre' ? 'bg-blue-100 text-blue-700' :
          period === 'post' ? 'bg-orange-100 text-orange-700' :
          'bg-slate-100 text-slate-600'
        }`}>
          {period === 'pre' ? 'Pre-Crisis' : period === 'post' ? 'Post-Crisis' : 'All Periods'}
        </span>
        {crisisDate && (
          <span className="text-xs text-slate-400 ml-2">Crisis date: {crisisDate}</span>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <KpiCard title="Destinations Monitored" value={destCount} icon="📍" subtitle="Full coverage" />
        <KpiCard
          title="Avg Booking Change"
          value={pct(avgBookingChange)}
          change={avgBookingChange}
          icon="📊"
          subtitle="Post-crisis"
        />
        <KpiCard title="Search-Booking r" value={pearsonR.toFixed(3)} icon="🔗" subtitle={`R²=${rSquared.toFixed(3)}`} />
        <KpiCard title="Resilient Markets" value={resilientCount} icon="💪" subtitle="Positive recovery" />
        <KpiCard title="Top Gainer" value={topGainer} icon="🟢" subtitle="Highest booking growth" />
        <KpiCard title="Top Decliner" value={topDecliner} icon="🔴" subtitle="Largest decline" />
      </div>

      {/* Expanded Intelligence Sections */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Market Intelligence Indicators</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-gradient-to-br from-violet-50 to-violet-100 rounded-lg p-4 border border-violet-200">
            <p className="text-xs font-medium text-violet-500 uppercase tracking-wider">Demand Growth Rate</p>
            <p className="text-xl font-bold text-violet-800 mt-1">{demandGrowthRate.toFixed(1)}%</p>
            <p className="text-xs text-violet-400 mt-1">Destinations with positive change</p>
          </div>
          <div className="bg-gradient-to-br from-sky-50 to-sky-100 rounded-lg p-4 border border-sky-200">
            <p className="text-xs font-medium text-sky-500 uppercase tracking-wider">Seasonal Index</p>
            <p className="text-xl font-bold text-sky-800 mt-1">
              {period === 'post' ? 'High' : period === 'pre' ? 'Moderate' : 'Baseline'}
            </p>
            <p className="text-xs text-sky-400 mt-1">Current seasonal indicator</p>
          </div>
          <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-lg p-4 border border-emerald-200">
            <p className="text-xs font-medium text-emerald-500 uppercase tracking-wider">Recovery Signals</p>
            <p className="text-xl font-bold text-emerald-800 mt-1">{resilientCount} / {destCount}</p>
            <p className="text-xs text-emerald-400 mt-1">Markets showing recovery</p>
          </div>
          <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg p-4 border border-amber-200">
            <p className="text-xs font-medium text-amber-500 uppercase tracking-wider">Correlation Strength</p>
            <p className="text-xl font-bold text-amber-800 mt-1">
              {Math.abs(pearsonR) > 0.7 ? 'Strong' : Math.abs(pearsonR) > 0.4 ? 'Moderate' : 'Weak'}
            </p>
            <p className="text-xs text-amber-400 mt-1">Search-to-booking signal</p>
          </div>
        </div>
      </div>

      {/* Price Competitiveness — ADR Changes by Destination */}
      {adrChangeByDest.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Price Competitiveness</h3>
          <p className="text-sm text-slate-500 mb-4">ADR changes by destination (top 10 by magnitude)</p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {adrChangeByDest.map((d) => (
              <div
                key={d.destination}
                className={`rounded-lg p-3 border ${
                  d.adr_change >= 0
                    ? 'bg-emerald-50 border-emerald-200'
                    : 'bg-red-50 border-red-200'
                }`}
              >
                <p className="text-xs font-medium text-slate-600 truncate">{d.destination}</p>
                <p className={`text-lg font-bold mt-1 ${
                  d.adr_change >= 0 ? 'text-emerald-700' : 'text-red-700'
                }`}>
                  {pct(d.adr_change)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Market Share Rankings */}
      {marketShareRankings.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Market Share Rankings</h3>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Rank</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Destination</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">Post-Crisis Bookings</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">Change</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {marketShareRankings.map((r) => (
                  <tr key={r.rank} className="hover:bg-slate-50/50">
                    <td className="px-4 py-2.5 font-bold text-slate-500">#{r.rank}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-800">{r.destination}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{fmt(r.postBookings)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-semibold tabular-nums ${
                        r.change >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                      }`}>
                        {pct(r.change)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Charts 2x2 */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ChartCard title="Booking Change by Destination">
          {bookingChangeChart.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-400">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(300, bookingChangeChart.length * 28)}>
              <BarChart data={bookingChangeChart} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => v + '%'} />
                <YAxis type="category" dataKey="destination_id" tick={{ fontSize: 10 }} width={100} />
                <Tooltip formatter={(v: number) => [pct(v), 'Booking Change']} contentStyle={{ fontSize: 12 }} />
                <ReferenceLine x={0} stroke="#94a3b8" />
                <Bar dataKey="booking_change_pct" name="Booking Change %" radius={[0, 4, 4, 0]}>
                  {bookingChangeChart.map((entry, i) => (
                    <Cell key={i} fill={entry.booking_change_pct >= 0 ? '#10b981' : '#ef4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Search Change by Destination">
          {searchChangeChart.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-400">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(300, searchChangeChart.length * 28)}>
              <BarChart data={searchChangeChart} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => v + '%'} />
                <YAxis type="category" dataKey="destination_id" tick={{ fontSize: 10 }} width={100} />
                <Tooltip formatter={(v: number) => [pct(v), 'Search Change']} contentStyle={{ fontSize: 12 }} />
                <ReferenceLine x={0} stroke="#94a3b8" />
                <Bar dataKey="search_change_pct" name="Search Change %" radius={[0, 4, 4, 0]}>
                  {searchChangeChart.map((entry, i) => (
                    <Cell key={i} fill={entry.search_change_pct >= 0 ? '#10b981' : '#ef4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Resilience Ranking (Top 15)">
          {resilienceData.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-400">No resilience data</div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(300, resilienceData.length * 28)}>
              <BarChart data={resilienceData} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="destination_id" tick={{ fontSize: 10 }} width={100} />
                <Tooltip formatter={(v: number) => [v.toFixed(2), 'Resilience Score']} contentStyle={{ fontSize: 12 }} />
                <Bar dataKey="resilience_score" name="Resilience Score" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Demand Substitution Flow">
          <div className="flex-1 flex gap-4 min-h-[280px]">
            <div className="flex-1 flex flex-col gap-2">
              <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-1">Top Losers</p>
              {substitutionViz.losers.map((m) => (
                <div key={m.destination_id} className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-red-800 truncate">{countryName(m.destination_id)}</span>
                  <span className="text-xs font-bold text-red-600 tabular-nums">{pct(m.booking_change_pct ?? 0)}</span>
                </div>
              ))}
              {substitutionViz.losers.length === 0 && (
                <div className="text-slate-400 text-sm">No losers</div>
              )}
            </div>

            <div className="flex flex-col items-center justify-center gap-3 px-2">
              {[...Array(Math.max(substitutionViz.losers.length, substitutionViz.gainers.length, 1))].map((_, i) => (
                <div key={i} className="text-slate-300 text-lg">&rarr;</div>
              ))}
            </div>

            <div className="flex-1 flex flex-col gap-2">
              <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide mb-1">Top Gainers</p>
              {substitutionViz.gainers.map((m) => (
                <div key={m.destination_id} className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-emerald-800 truncate">{countryName(m.destination_id)}</span>
                  <span className="text-xs font-bold text-emerald-600 tabular-nums">{pct(m.booking_change_pct ?? 0)}</span>
                </div>
              ))}
              {substitutionViz.gainers.length === 0 && (
                <div className="text-slate-400 text-sm">No gainers</div>
              )}
            </div>
          </div>
        </ChartCard>
      </div>

      {/* Sankey Flow */}
      {sankeyFlows.length > 0 && (
        <ChartCard title="Demand Shift Sankey">
          <SankeyFlow flows={sankeyFlows} />
        </ChartCard>
      )}

      {/* Corridor Matrix */}
      <CorridorMatrix data={corridorData} />

      {/* Destinations Unlocked vs Lost */}
      {(otaDestsGaining.length > 0 || otaDestsLosing.length > 0) && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-sm border border-emerald-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <h3 className="text-lg font-semibold text-emerald-800">Destinations Gaining</h3>
              <span className="text-xs text-emerald-500 ml-auto">&gt;10% booking growth</span>
            </div>
            {otaDestsGaining.length === 0 ? (
              <p className="text-sm text-slate-400">No destinations with &gt;10% growth</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {otaDestsGaining.map((d) => (
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
            {otaDestsLosing.length === 0 ? (
              <p className="text-sm text-slate-400">No destinations with &lt;-10% decline</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {otaDestsLosing.map((d) => (
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

      {/* Risk Heatmap */}
      <RiskHeatmap data={riskData} />

      {/* Destination Deep Dive Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Destination Deep Dive</h3>
        <DataTable
          columns={deepDiveColumns}
          data={shockMetrics as unknown as Record<string, unknown>[]}
          loading={false}
          emptyMessage="No shock metrics available."
        />
      </div>

      {/* Action Panel */}
      <ActionPanel actions={actions} />
    </div>
  )
}
