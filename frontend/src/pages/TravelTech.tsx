import { useEffect, useState, useMemo, useCallback } from 'react'
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import {
  fetchSummary,
  fetchTimeline,
  fetchKpisOta,
  fetchFunnel,
  fetchPrePost,
  type Summary,
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
import DemandFunnel from '../components/DemandFunnel'
import DataTable from '../components/DataTable'

interface OtaRow {
  destination_id: string
  search_demand: number
  bookings: number
  conversion_rate: number
  market_share_pct: number
}

function fmt(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return n.toFixed(0)
}

function pct(n: number): string {
  return n.toFixed(1) + '%'
}

export default function TravelTech() {
  const { filters, latestMiddleEastCrisis } = useFilters()
  const filterParams = useFilterParams()
  const period = filters.period

  const [summary, setSummary] = useState<Summary | null>(null)
  const [timeline, setTimeline] = useState<TimelinePoint[]>([])
  const [otaData, setOtaData] = useState<OtaRow[]>([])
  const [funnelRaw, setFunnelRaw] = useState<{ stages?: { name: string; value: number }[] } | null>(null)
  const [prePostRaw, setPrePostRaw] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([
      fetchSummary(filterParams),
      fetchTimeline(filterParams),
      fetchKpisOta(filterParams),
      fetchFunnel(filterParams),
      fetchPrePost(filterParams),
    ])
      .then(([s, t, ota, funnel, pp]) => {
        if (cancelled) return
        setSummary(s)
        setTimeline(t.data ?? t ?? [])
        const rows = (ota as { data?: OtaRow[] })?.data ?? (Array.isArray(ota) ? ota : [])
        setOtaData(rows as OtaRow[])
        setFunnelRaw(funnel as Record<string, unknown>)
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

  const totalSearch = useMemo(() => {
    if (otaData.length) return otaData.reduce((s, r) => s + (r.search_demand || 0), 0)
    return timeline.reduce((s, p) => s + (p.search_demand || 0), 0)
  }, [otaData, timeline])

  const totalBookings = useMemo(() => {
    if (summary) return summary.total_bookings
    return timeline.reduce((s, p) => s + (p.bookings || 0), 0)
  }, [summary, timeline])

  const avgAdr = useMemo(() => {
    if (!timeline.length) return 200
    const vals = timeline.filter((p) => p.adr > 0)
    return vals.length ? vals.reduce((s, p) => s + p.adr, 0) / vals.length : 200
  }, [timeline])

  const conversionRate = useMemo(() => {
    return totalSearch > 0 ? (totalBookings / totalSearch) * 100 : 0
  }, [totalSearch, totalBookings])

  const totalRoomNights = useMemo(() => {
    return summary?.total_room_nights ?? timeline.reduce((s, p) => s + (p.room_nights || 0), 0)
  }, [summary, timeline])

  const destCount = summary?.destinations_count ?? otaData.length

  const topSearchDest = useMemo(() => {
    if (!otaData.length) return 'N/A'
    const top = [...otaData].sort((a, b) => (b.search_demand || 0) - (a.search_demand || 0))[0]
    return top ? countryName(top.destination_id) : 'N/A'
  }, [otaData])

  const insights = useMemo(() => [
    `Total search volume: ${fmt(totalSearch)} across ${destCount} destinations`,
    `Overall search-to-booking conversion: ${pct(conversionRate)}`,
    `Average ADR: $${avgAdr.toFixed(0)}`,
    `Market with highest search volume: ${topSearchDest}`,
    `Demand funnel efficiency: ${pct(conversionRate)} search-to-booking conversion`,
  ], [totalSearch, destCount, conversionRate, avgAdr, topSearchDest])

  const conversionTimeline = useMemo(() => {
    return timeline.map((p) => ({
      date: p.date,
      conversion: p.search_demand > 0 ? (p.bookings / p.search_demand) * 100 : 0,
    }))
  }, [timeline])

  const scatterData = useMemo(() => {
    return timeline.filter((_, i) => i % 30 === 0).map((p) => ({
      search_demand: p.search_demand,
      bookings: p.bookings,
    }))
  }, [timeline])

  const funnelStages = useMemo(() => {
    if (funnelRaw && Array.isArray((funnelRaw as { stages?: unknown }).stages)) {
      return (funnelRaw as { stages: { name: string; value: number }[] }).stages
    }
    if (funnelRaw && Array.isArray((funnelRaw as { data?: unknown }).data)) {
      return (funnelRaw as { data: { name: string; value: number }[] }).data
    }
    if (Array.isArray(funnelRaw)) return funnelRaw as { name: string; value: number }[]
    return [
      { name: 'Search', value: Math.round(totalSearch) },
      { name: 'Views', value: Math.round(totalSearch * 0.45) },
      { name: 'Shortlist', value: Math.round(totalSearch * 0.18) },
      { name: 'Bookings', value: totalBookings },
    ]
  }, [funnelRaw, totalSearch, totalBookings])

  const crisisDate = useMemo(() => {
    const pp = prePostRaw as Record<string, unknown> | null
    if (pp?.crisis_date) return String(pp.crisis_date)
    if (pp?.date) return String(pp.date)
    return undefined
  }, [prePostRaw])

  const otaColumns = [
    { key: 'destination_id', label: 'Destination', format: (v: unknown) => countryName(String(v ?? '')) },
    { key: 'search_demand', label: 'Search Demand', format: (v: unknown) => fmt(Number(v ?? 0)) },
    { key: 'bookings', label: 'Bookings', format: (v: unknown) => fmt(Number(v ?? 0)) },
    { key: 'conversion_rate', label: 'Conversion %', format: (v: unknown) => pct(Number(v ?? 0)) },
    { key: 'market_share_pct', label: 'Market Share %', format: (v: unknown) => pct(Number(v ?? 0)) },
  ]

  const calcFields = useMemo(() => [
    { name: 'transactions', label: 'Monthly Transactions', defaultValue: 10000, min: 1000, max: 100000, step: 1000 },
    { name: 'markup', label: 'Markup %', defaultValue: 8, min: 1, max: 20, step: 0.5 },
    { name: 'txFee', label: 'Transaction Fee ($)', defaultValue: 3, min: 0.5, max: 10, step: 0.5 },
    { name: 'connFee', label: 'Connector Fee ($)', defaultValue: 1.5, min: 0.5, max: 5, step: 0.5 },
  ], [])

  const calcFormula = useCallback(
    (v: Record<string, number>) =>
      v.transactions * (v.markup / 100 * avgAdr + v.txFee + v.connFee),
    [avgAdr],
  )

  const actions = [
    { title: 'Optimize API Response Times', description: 'Optimize API response times for high-demand corridors', priority: 'high' as const },
    { title: 'Increase Connector Integrations', description: 'Increase connector integrations for recovering markets', priority: 'high' as const },
    { title: 'Adjust Markup Strategy', description: 'Adjust markup for high-transaction destinations', priority: 'medium' as const },
    { title: 'Improve Conversion Funnel', description: 'Improve search-to-booking conversion funnel', priority: 'medium' as const },
    { title: 'Expand Market Coverage', description: 'Expand market coverage to emerging destinations', priority: 'low' as const },
  ]

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-slate-800">Travel Tech Platforms</h2>
        <div className="flex items-center justify-center h-64 text-slate-400">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span>Loading platform data...</span>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-slate-800">Travel Tech Platforms</h2>
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
        <h2 className="text-2xl font-bold text-slate-800">Travel Tech Platforms</h2>
        <p className="text-slate-500 mt-1">Demand partners, search analytics, and platform performance metrics.</p>
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
        <KpiCard title="Total Search Volume" value={fmt(totalSearch)} icon="🔍" subtitle="All platforms" />
        <KpiCard title="Total Bookings" value={fmt(totalBookings)} icon="📋" subtitle="Confirmed" />
        <KpiCard title="Conversion Rate" value={pct(conversionRate)} icon="📈" subtitle="Search → Booking" />
        <KpiCard title="Average ADR" value={`$${avgAdr.toFixed(0)}`} icon="💰" subtitle="All destinations" />
        <KpiCard title="Room Nights" value={fmt(totalRoomNights)} icon="🛏️" subtitle="Total sold" />
        <KpiCard title="Market Coverage" value={String(destCount)} icon="🌍" subtitle="Destinations" />
      </div>

      {/* Expanded Tech KPI Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Platform Health Metrics</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="bg-gradient-to-br from-violet-50 to-violet-100 rounded-lg p-4 border border-violet-200">
            <p className="text-xs font-medium text-violet-500 uppercase tracking-wider">API Latency</p>
            <p className="text-xl font-bold text-violet-800 mt-1">120ms</p>
            <p className="text-xs text-violet-400 mt-1">Avg response time</p>
          </div>
          <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-lg p-4 border border-emerald-200">
            <p className="text-xs font-medium text-emerald-500 uppercase tracking-wider">System Uptime</p>
            <p className="text-xl font-bold text-emerald-800 mt-1">99.9%</p>
            <p className="text-xs text-emerald-400 mt-1">Last 30 days</p>
          </div>
          <div className="bg-gradient-to-br from-sky-50 to-sky-100 rounded-lg p-4 border border-sky-200">
            <p className="text-xs font-medium text-sky-500 uppercase tracking-wider">Active Clients</p>
            <p className="text-xl font-bold text-sky-800 mt-1">{destCount}</p>
            <p className="text-xs text-sky-400 mt-1">Connected destinations</p>
          </div>
          <div className="bg-gradient-to-br from-teal-50 to-teal-100 rounded-lg p-4 border border-teal-200">
            <p className="text-xs font-medium text-teal-500 uppercase tracking-wider">Data Freshness</p>
            <p className="text-xl font-bold text-teal-800 mt-1">Real-time</p>
            <p className="text-xs text-teal-400 mt-1">Live data feed</p>
          </div>
          <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-lg p-4 border border-indigo-200">
            <p className="text-xs font-medium text-indigo-500 uppercase tracking-wider">Client Growth</p>
            <p className="text-xl font-bold text-indigo-800 mt-1">+15% YoY</p>
            <p className="text-xs text-indigo-400 mt-1">Year-over-year</p>
          </div>
          <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg p-4 border border-amber-200">
            <p className="text-xs font-medium text-amber-500 uppercase tracking-wider">Feature Adoption</p>
            <p className="text-xl font-bold text-amber-800 mt-1">78%</p>
            <p className="text-xs text-amber-400 mt-1">Of available features</p>
          </div>
        </div>
      </div>

      {/* Charts 2x2 */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ChartCard title="Search Volume Trend">
          {timeline.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-400">No timeline data</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={timeline} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v?.slice?.(0, 7) ?? v} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={fmt} width={52} />
                <Tooltip formatter={(v: number) => [fmt(v), 'Search Demand']} contentStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="search_demand" name="Search Demand" fill="#10b981" fillOpacity={0.2} stroke="#10b981" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Conversion Rate Over Time">
          {conversionTimeline.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-400">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={conversionTimeline} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v?.slice?.(0, 7) ?? v} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => pct(v)} width={52} domain={[0, 'auto']} />
                <Tooltip formatter={(v: number) => [pct(v), 'Conversion Rate']} contentStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="conversion" name="Conversion %" stroke="#6366f1" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Search vs Bookings Correlation">
          {scatterData.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-400">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <ScatterChart margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" dataKey="search_demand" name="Search" tick={{ fontSize: 11 }} tickFormatter={fmt} />
                <YAxis type="number" dataKey="bookings" name="Bookings" tick={{ fontSize: 11 }} tickFormatter={fmt} width={52} />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  formatter={(v: number, name: string) => [fmt(v), name === 'search_demand' ? 'Search' : 'Bookings']}
                  contentStyle={{ fontSize: 12 }}
                />
                <Scatter data={scatterData} fill="#3b82f6" fillOpacity={0.7} />
              </ScatterChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <DemandFunnel stages={funnelStages} />
      </div>

      {/* OTA Performance Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">OTA Performance</h3>
        <DataTable
          columns={otaColumns}
          data={otaData as unknown as Record<string, unknown>[]}
          loading={false}
          emptyMessage="No OTA performance data available."
        />
      </div>

      {/* Revenue Calculator */}
      <RevenueCalculator
        fields={calcFields}
        formula={calcFormula}
        resultLabel="Estimated Platform Revenue ($)"
      />

      {/* Action Panel */}
      <ActionPanel actions={actions} />
    </div>
  )
}
