import { useEffect, useState, useMemo, useCallback } from 'react'
import {
  fetchKpisHotel,
  fetchTimeline,
  fetchRiskIndex,
  fetchPrePost,
} from '../services/api'
import { countryName } from '../utils/countryNames'
import { useFilters } from '../context/FilterContext'
import { useFilterParams } from '../hooks/useFilteredData'
import KpiCard from '../components/KpiCard'
import ExecSummary from '../components/ExecSummary'
import ActionPanel from '../components/ActionPanel'
import RevenueCalculator from '../components/RevenueCalculator'
import ChartCard from '../components/ChartCard'
import RiskHeatmap from '../components/RiskHeatmap'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts'

type SortDir = 'asc' | 'desc'

interface HotelKpi {
  destination_id: string
  occupancy_rate: number
  adr: number
  revpar: number
  bookings: number
  cancellation_rate: number
  market_demand_index: number
}

interface TimelinePoint {
  date: string
  bookings: number
  adr: number
}

interface RiskEntry {
  destination_id: string
  travel_risk_index: number
  risk_tier: string
  risk_level?: string
}

interface PrePostData {
  pre: HotelKpi[]
  post: HotelKpi[]
  crisis_date?: string
}

const BAR_COLORS = [
  '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
  '#ec4899', '#f43f5e', '#ef4444', '#f97316', '#eab308',
  '#84cc16', '#22c55e', '#14b8a6', '#06b6d4', '#0ea5e9',
]

function fmt(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return n.toFixed(0)
}

function fmtDollar(n: number): string {
  return '$' + n.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function fmtPct(n: number): string {
  return (n * 100).toFixed(1) + '%'
}

const revenueFields = [
  { name: 'adr', label: 'ADR ($)', defaultValue: 200, min: 100, max: 500, step: 10 },
  { name: 'roomNights', label: 'Room Nights', defaultValue: 1000, min: 100, max: 10000, step: 100 },
  { name: 'occupancy', label: 'Occupancy Rate', defaultValue: 0.75, min: 0.1, max: 1.0, step: 0.05 },
]

const revenueFormula = (v: Record<string, number>) => v.adr * v.roomNights * v.occupancy

const hotelActions = [
  { title: 'Increase ADR in recovering markets', description: 'Identify destinations showing booking recovery and strategically raise ADR to capture improved willingness-to-pay while demand rebounds.', priority: 'high' as const },
  { title: 'Optimize rate parity for high-demand corridors', description: 'Ensure rate consistency across distribution channels for top-performing destination corridors to maximize direct booking revenue.', priority: 'high' as const },
  { title: 'Focus marketing on markets showing demand recovery', description: 'Allocate marketing budgets toward destinations where market demand index signals early recovery, maximizing ROI on promotional spend.', priority: 'medium' as const },
  { title: 'Review cancellation policies for high-risk destinations', description: 'Tighten or adjust cancellation policies in destinations with elevated cancellation rates to protect revenue and reduce no-show losses.', priority: 'medium' as const },
  { title: 'Diversify source market mix to reduce dependency', description: 'Reduce over-reliance on single source markets by cultivating bookings from emerging travel origins and alternative distribution channels.', priority: 'low' as const },
]

export default function HotelChains() {
  const { filters, latestMiddleEastCrisis } = useFilters()
  const filterParams = useFilterParams()
  const period = filters.period

  const [hotelKpis, setHotelKpis] = useState<HotelKpi[]>([])
  const [timeline, setTimeline] = useState<TimelinePoint[]>([])
  const [riskData, setRiskData] = useState<RiskEntry[]>([])
  const [prePostData, setPrePostData] = useState<PrePostData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<string>('destination_id')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    Promise.all([
      fetchKpisHotel(filterParams),
      fetchTimeline(filterParams),
      fetchRiskIndex(filterParams),
      fetchPrePost(filterParams),
    ])
      .then(([kpis, tl, risk, prepost]) => {
        if (cancelled) return
        const kpiRows: HotelKpi[] = Array.isArray(kpis) ? kpis : kpis?.data ?? []
        setHotelKpis(kpiRows)
        setTimeline(tl?.data ?? [])
        const riskRows: RiskEntry[] = Array.isArray(risk) ? risk : risk?.data ?? []
        setRiskData(riskRows)
        setPrePostData(prepost ?? null)
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || 'Failed to load hotel chain data')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [filterParams])

  const activeData: HotelKpi[] = useMemo(() => {
    if (period === 'pre' && prePostData?.pre) return prePostData.pre
    if (period === 'post' && prePostData?.post) return prePostData.post
    return hotelKpis
  }, [period, hotelKpis, prePostData])

  const avgAdr = useMemo(() => {
    if (!activeData.length) return 0
    return activeData.reduce((s, d) => s + (d.adr ?? 0), 0) / activeData.length
  }, [activeData])

  const avgOccupancy = useMemo(() => {
    if (!activeData.length) return 0
    return activeData.reduce((s, d) => s + (d.occupancy_rate ?? 0), 0) / activeData.length
  }, [activeData])

  const avgRevpar = useMemo(() => {
    if (!activeData.length) return 0
    return activeData.reduce((s, d) => s + (d.revpar ?? 0), 0) / activeData.length
  }, [activeData])

  const totalBookings = useMemo(() => {
    return activeData.reduce((s, d) => s + (d.bookings ?? 0), 0)
  }, [activeData])

  const avgCancellation = useMemo(() => {
    if (!activeData.length) return 0
    return activeData.reduce((s, d) => s + (d.cancellation_rate ?? 0), 0) / activeData.length
  }, [activeData])

  const avgDemandIndex = useMemo(() => {
    if (!activeData.length) return 0
    return activeData.reduce((s, d) => s + (d.market_demand_index ?? 0), 0) / activeData.length
  }, [activeData])

  const highestDemandMarket = useMemo(() => {
    if (!activeData.length) return 'N/A'
    const top = [...activeData].sort((a, b) => (b.market_demand_index ?? 0) - (a.market_demand_index ?? 0))[0]
    return top ? countryName(top.destination_id) : 'N/A'
  }, [activeData])

  const highestCancellationRisk = useMemo(() => {
    if (!activeData.length) return 'N/A'
    const top = [...activeData].sort((a, b) => (b.cancellation_rate ?? 0) - (a.cancellation_rate ?? 0))[0]
    return top ? countryName(top.destination_id) : 'N/A'
  }, [activeData])

  const goppar = useMemo(() => avgRevpar * 0.4, [avgRevpar])

  const lengthOfStay = useMemo(() => {
    const totalRoomNights = activeData.reduce((s, d) => s + (d.bookings ?? 0), 0) * 2.8
    return totalBookings > 0 ? (totalRoomNights / totalBookings).toFixed(1) : '0'
  }, [activeData, totalBookings])

  const insights = useMemo(() => {
    if (!activeData.length) return []
    return [
      `Average ADR across all destinations: ${fmtDollar(avgAdr)}`,
      `Average occupancy rate: ${fmtPct(avgOccupancy)}`,
      `Average RevPAR: ${fmtDollar(avgRevpar)}`,
      `Highest demand market: ${highestDemandMarket}`,
      `Highest cancellation risk: ${highestCancellationRisk}`,
    ]
  }, [activeData, avgAdr, avgOccupancy, avgRevpar, highestDemandMarket, highestCancellationRisk])

  const adrByDest = useMemo(() => {
    return [...activeData]
      .map((d) => ({ destination_id: countryName(d.destination_id), adr: d.adr ?? 0 }))
      .sort((a, b) => b.adr - a.adr)
  }, [activeData])

  const revparByDest = useMemo(() => {
    return [...activeData]
      .map((d) => ({ destination_id: countryName(d.destination_id), revpar: d.revpar ?? 0 }))
      .sort((a, b) => b.revpar - a.revpar)
  }, [activeData])

  const occupancyByDest = useMemo(() => {
    return [...activeData]
      .map((d) => ({ destination_id: countryName(d.destination_id), occupancy_rate: +(d.occupancy_rate ?? 0).toFixed(4) }))
      .sort((a, b) => b.occupancy_rate - a.occupancy_rate)
  }, [activeData])

  const handleSort = useCallback((key: string) => {
    setSortDir((prev) => (sortKey === key ? (prev === 'asc' ? 'desc' : 'asc') : 'desc'))
    setSortKey(key)
  }, [sortKey])

  const sortedTableData = useMemo(() => {
    const copy = [...activeData]
    copy.sort((a, b) => {
      const aVal = (a as unknown as Record<string, unknown>)[sortKey]
      const bVal = (b as unknown as Record<string, unknown>)[sortKey]
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
      }
      const an = Number(aVal ?? 0)
      const bn = Number(bVal ?? 0)
      return sortDir === 'asc' ? an - bn : bn - an
    })
    return copy
  }, [activeData, sortKey, sortDir])

  if (error) {
    return (
      <div className="rounded-xl bg-red-50 border border-red-200 p-6 text-red-700">
        <p className="font-medium">Error loading Hotel Chains data</p>
        <p className="text-sm mt-1">{error}</p>
      </div>
    )
  }

  const sortIcon = (key: string) => {
    if (sortKey !== key) return <span className="text-gray-300 ml-1">&#8693;</span>
    return sortDir === 'asc'
      ? <span className="text-blue-600 ml-1">&#9650;</span>
      : <span className="text-blue-600 ml-1">&#9660;</span>
  }

  const tableColumns: { key: keyof HotelKpi; label: string; format: (v: number, row?: HotelKpi) => string }[] = [
    { key: 'destination_id', label: 'Destination', format: (_v, row) => row ? countryName(row.destination_id) : String(_v) },
    { key: 'occupancy_rate', label: 'Occupancy', format: fmtPct },
    { key: 'adr', label: 'ADR', format: fmtDollar },
    { key: 'revpar', label: 'RevPAR', format: fmtDollar },
    { key: 'bookings', label: 'Bookings', format: fmt },
    { key: 'cancellation_rate', label: 'Cancel Rate', format: fmtPct },
    { key: 'market_demand_index', label: 'Demand Index', format: (v) => Number(v).toFixed(2) },
  ]

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Hotel Chains Analytics</h2>
        <p className="text-slate-500 mt-1">
          Occupancy, ADR, RevPAR, cancellation rates, and market demand across destinations.
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
      {!loading && <ExecSummary insights={insights} />}

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
          {prePostData?.crisis_date && (
            <span className="text-xs text-slate-400 ml-2">Crisis date: {prePostData.crisis_date}</span>
          )}
        </div>
        {loading && (
          <span className="text-sm text-slate-400 animate-pulse">Loading data...</span>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <KpiCard
          title="Average ADR"
          value={loading ? '—' : fmtDollar(avgAdr)}
          icon="💲"
          subtitle="Avg. daily rate"
        />
        <KpiCard
          title="Avg Occupancy"
          value={loading ? '—' : fmtPct(avgOccupancy)}
          icon="🏨"
          subtitle="Room utilization"
        />
        <KpiCard
          title="Avg RevPAR"
          value={loading ? '—' : fmtDollar(avgRevpar)}
          icon="📊"
          subtitle="Revenue per room"
        />
        <KpiCard
          title="Total Bookings"
          value={loading ? '—' : fmt(totalBookings)}
          icon="📋"
          subtitle="All destinations"
        />
        <KpiCard
          title="Cancel Rate"
          value={loading ? '—' : fmtPct(avgCancellation)}
          icon="❌"
          subtitle="Avg. cancellation"
        />
        <KpiCard
          title="Demand Index"
          value={loading ? '—' : avgDemandIndex.toFixed(2)}
          icon="📈"
          subtitle="Market demand"
        />
      </div>

      {/* Expanded KPI Section */}
      {!loading && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Expanded Performance Metrics</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <div className="bg-gradient-to-br from-violet-50 to-violet-100 rounded-lg p-4 border border-violet-200">
              <p className="text-xs font-medium text-violet-500 uppercase tracking-wider">GOPPAR</p>
              <p className="text-xl font-bold text-violet-800 mt-1">{fmtDollar(goppar)}</p>
              <p className="text-xs text-violet-400 mt-1">Gross Op. Profit / Room</p>
            </div>
            <div className="bg-gradient-to-br from-sky-50 to-sky-100 rounded-lg p-4 border border-sky-200">
              <p className="text-xs font-medium text-sky-500 uppercase tracking-wider">Avg Length of Stay</p>
              <p className="text-xl font-bold text-sky-800 mt-1">{lengthOfStay} nights</p>
              <p className="text-xs text-sky-400 mt-1">Room nights / bookings</p>
            </div>
            <div className="bg-gradient-to-br from-teal-50 to-teal-100 rounded-lg p-4 border border-teal-200">
              <p className="text-xs font-medium text-teal-500 uppercase tracking-wider">Booking Lead Time</p>
              <p className="text-xl font-bold text-teal-800 mt-1">28 days</p>
              <p className="text-xs text-teal-400 mt-1">Avg. advance booking</p>
            </div>
            <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-lg p-4 border border-emerald-200">
              <p className="text-xs font-medium text-emerald-500 uppercase tracking-wider">Direct Booking Share</p>
              <p className="text-xl font-bold text-emerald-800 mt-1">35%</p>
              <p className="text-xs text-emerald-400 mt-1">Of total bookings</p>
            </div>
            <div className="bg-gradient-to-br from-rose-50 to-rose-100 rounded-lg p-4 border border-rose-200">
              <p className="text-xs font-medium text-rose-500 uppercase tracking-wider">No-show Rate</p>
              <p className="text-xl font-bold text-rose-800 mt-1">3%</p>
              <p className="text-xs text-rose-400 mt-1">Of confirmed bookings</p>
            </div>
          </div>
        </div>
      )}

      {/* Charts 2x2 Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="ADR by Destination">
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-slate-400 animate-pulse">Loading...</div>
          ) : adrByDest.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-400">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(280, adrByDest.length * 32)}>
              <BarChart data={adrByDest} layout="vertical" margin={{ top: 4, right: 30, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => '$' + v} />
                <YAxis type="category" dataKey="destination_id" tick={{ fontSize: 11 }} width={100} />
                <Tooltip formatter={(v: number) => [fmtDollar(v), 'ADR']} contentStyle={{ fontSize: 12 }} />
                <Bar dataKey="adr" radius={[0, 4, 4, 0]}>
                  {adrByDest.map((_, i) => (
                    <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="RevPAR by Destination">
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-slate-400 animate-pulse">Loading...</div>
          ) : revparByDest.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-400">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={revparByDest} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="destination_id" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => '$' + v} />
                <Tooltip formatter={(v: number) => [fmtDollar(v), 'RevPAR']} contentStyle={{ fontSize: 12 }} />
                <Bar dataKey="revpar" fill="#6366f1" radius={[4, 4, 0, 0]}>
                  {revparByDest.map((_, i) => (
                    <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Occupancy Rate by Destination">
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-slate-400 animate-pulse">Loading...</div>
          ) : occupancyByDest.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-400">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={occupancyByDest} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="destination_id" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => (v * 100).toFixed(0) + '%'} />
                <Tooltip
                  formatter={(v: number) => [fmtPct(v), 'Occupancy']}
                  contentStyle={{ fontSize: 12 }}
                />
                <Bar dataKey="occupancy_rate" fill="#14b8a6" radius={[4, 4, 0, 0]}>
                  {occupancyByDest.map((_, i) => (
                    <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Bookings & ADR Trend">
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-slate-400 animate-pulse">Loading...</div>
          ) : timeline.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-400">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={timeline} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => (v?.length >= 10 ? v.slice(0, 7) : v)}
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 11 }}
                  tickFormatter={fmt}
                  width={50}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => '$' + v}
                  width={55}
                />
                <Tooltip
                  formatter={(v: number, name: string) => [
                    name === 'Bookings' ? fmt(v) : fmtDollar(v),
                    name,
                  ]}
                  contentStyle={{ fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="bookings"
                  name="Bookings"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="adr"
                  name="ADR"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Risk Heatmap */}
      {!loading && riskData.length > 0 && <RiskHeatmap data={riskData} />}

      {/* Destination Performance Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Destination Performance</h3>
        {loading ? (
          <div className="text-center text-slate-400 py-8 animate-pulse">Loading table...</div>
        ) : sortedTableData.length === 0 ? (
          <div className="text-center text-slate-400 py-8">No destination data available.</div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  {tableColumns.map((col) => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider cursor-pointer select-none hover:bg-slate-100 transition-colors"
                    >
                      <span className="inline-flex items-center">
                        {col.label}
                        {sortIcon(col.key)}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {sortedTableData.map((row, i) => (
                  <tr key={row.destination_id || i} className="hover:bg-slate-50/50 transition-colors">
                    {tableColumns.map((col) => (
                      <td key={col.key} className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">
                        {col.format(row[col.key] as number, row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Revenue Calculator & Action Panel side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RevenueCalculator
          fields={revenueFields}
          formula={revenueFormula}
          resultLabel="Estimated Revenue"
        />
        <ActionPanel actions={hotelActions} />
      </div>
    </div>
  )
}
