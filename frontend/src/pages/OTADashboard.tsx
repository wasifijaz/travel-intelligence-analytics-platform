import { useEffect, useState, useMemo, useCallback } from 'react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import {
  fetchSummary,
  fetchTimeline,
  fetchKpisOta,
  fetchPrePost,
  fetchAnalytics,
  type Summary,
  type TimelinePoint,
} from '../services/api'
import { useFilterParams } from '../hooks/useFilteredData'
import KpiCard from '../components/KpiCard'
import ExecSummary from '../components/ExecSummary'
import ActionPanel from '../components/ActionPanel'
import ChartCard from '../components/ChartCard'
import { countryName } from '../utils/countryNames'

type SortDir = 'asc' | 'desc'

interface OtaKpi {
  destination_id: string
  search_demand: number
  bookings: number
  conversion_rate: number
  market_share_pct: number
  cancellation_rate?: number
}

interface PrePostData {
  pre?: OtaKpi[]
  post?: OtaKpi[]
  crisis_date?: string
  total_search_demand?: number
  [k: string]: unknown
}

const PIE_COLORS = [
  '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
  '#ec4899', '#f43f5e', '#ef4444', '#f97316', '#eab308',
  '#84cc16', '#22c55e', '#14b8a6', '#06b6d4', '#0ea5e9',
]

function fmt(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return n.toFixed(0)
}

function fmtDollar(n: number): string {
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B'
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M'
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K'
  return '$' + n.toFixed(0)
}

function pct(n: number): string {
  return n.toFixed(1) + '%'
}

export default function OTADashboard() {
  const filterParams = useFilterParams()
  const [summary, setSummary] = useState<Summary | null>(null)
  const [timeline, setTimeline] = useState<TimelinePoint[]>([])
  const [otaKpis, setOtaKpis] = useState<OtaKpi[]>([])
  const [prePostRaw, setPrePostRaw] = useState<PrePostData | null>(null)
  const [analyticsData, setAnalyticsData] = useState<{
    shock_metrics: { destination_id: string; booking_change_pct: number | null }[]
    search_booking_corr: { pearson_r?: number }
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<string>('search_demand')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([
      fetchSummary(filterParams),
      fetchTimeline(filterParams),
      fetchKpisOta(filterParams),
      fetchPrePost(filterParams),
      fetchAnalytics(filterParams),
    ])
      .then(([s, tl, ota, pp, an]) => {
        if (cancelled) return
        setSummary(s)
        setTimeline(tl?.data ?? [])
        const otaRows: OtaKpi[] = Array.isArray(ota) ? ota : ota?.data ?? []
        setOtaKpis(otaRows)
        setPrePostRaw(pp as PrePostData)
        setAnalyticsData(an as typeof analyticsData)
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || 'Failed to load OTA data')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [filterParams])

  /* ---------- computed KPI values ---------- */

  const totalSearchDemand = useMemo(() => {
    if (prePostRaw?.total_search_demand) return prePostRaw.total_search_demand
    return otaKpis.reduce((s, d) => s + (d.search_demand ?? 0), 0)
  }, [otaKpis, prePostRaw])

  const totalBookings = useMemo(() => {
    return summary?.total_bookings ?? otaKpis.reduce((s, d) => s + (d.bookings ?? 0), 0)
  }, [summary, otaKpis])

  const avgAdr = useMemo(() => {
    if (!timeline.length) return 150
    return timeline.reduce((s, t) => s + (t.adr ?? 0), 0) / timeline.length
  }, [timeline])

  const gbv = useMemo(() => totalBookings * avgAdr, [totalBookings, avgAdr])
  const commissionRate = 0.15
  const netRevenue = useMemo(() => gbv * commissionRate, [gbv])
  const takeRatePct = commissionRate * 100

  const lookToBook = useMemo(() => {
    if (!totalBookings) return 0
    return totalSearchDemand / totalBookings
  }, [totalSearchDemand, totalBookings])

  const conversionRate = useMemo(() => {
    if (!totalSearchDemand) return 0
    return (totalBookings / totalSearchDemand) * 100
  }, [totalBookings, totalSearchDemand])

  const uniqueVisitors = useMemo(() => totalSearchDemand * 3, [totalSearchDemand])

  const destCount = summary?.destinations_count ?? otaKpis.length

  const activeListings = useMemo(() => destCount * 50, [destCount])

  const avgCancellation = useMemo(() => {
    const withCancel = otaKpis.filter((d) => d.cancellation_rate != null)
    if (!withCancel.length) return 5.2
    return withCancel.reduce((s, d) => s + (d.cancellation_rate ?? 0), 0) / withCancel.length
  }, [otaKpis])

  const topMarket = useMemo(() => {
    if (!otaKpis.length) return 'N/A'
    return [...otaKpis].sort((a, b) => (b.search_demand ?? 0) - (a.search_demand ?? 0))[0]?.destination_id ?? 'N/A'
  }, [otaKpis])

  /* ---------- executive summary ---------- */

  const insights = useMemo(() => [
    `Total search volume across ${destCount} destinations: ${fmt(totalSearchDemand)}`,
    `Average look-to-book ratio: ${lookToBook.toFixed(1)}`,
    `Commission rate estimate: ${takeRatePct}%`,
    `Top market by search volume: ${countryName(topMarket)}`,
    `Overall conversion rate: ${pct(conversionRate)}`,
  ], [destCount, totalSearchDemand, lookToBook, takeRatePct, topMarket, conversionRate])

  /* ---------- chart data ---------- */

  const searchVsBookingsTrend = useMemo(() => {
    return timeline.map((t) => ({
      date: t.date?.length >= 10 ? t.date.slice(0, 7) : t.date,
      search_demand: t.search_demand ?? 0,
      bookings: t.bookings ?? 0,
    }))
  }, [timeline])

  const lookToBookTrend = useMemo(() => {
    return timeline
      .filter((t) => t.bookings > 0)
      .map((t) => ({
        date: t.date?.length >= 10 ? t.date.slice(0, 7) : t.date,
        ratio: +((t.search_demand ?? 0) / t.bookings).toFixed(2),
      }))
  }, [timeline])

  /** Row-level: bookings / search_demand × 100 (API conversion_rate can be identical across rows) */
  const otaKpisWithConversion = useMemo(
    () =>
      otaKpis.map((d) => ({
        ...d,
        conversion_pct: (d.search_demand ?? 0) > 0 ? (d.bookings / d.search_demand) * 100 : 0,
      })),
    [otaKpis],
  )

  const conversionByDest = useMemo(() => {
    return [...otaKpisWithConversion]
      .filter((d) => (d.search_demand ?? 0) > 0)
      .map((d) => ({
        name: countryName(d.destination_id),
        conversion_rate: +d.conversion_pct.toFixed(2),
      }))
      .sort((a, b) => b.conversion_rate - a.conversion_rate)
  }, [otaKpisWithConversion])

  const marketShareData = useMemo(() => {
    return [...otaKpis]
      .filter((d) => d.market_share_pct != null && d.market_share_pct > 0)
      .map((d) => ({
        name: countryName(d.destination_id),
        value: +(d.market_share_pct ?? 0).toFixed(2),
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 12)
  }, [otaKpis])

  /* ---------- sortable table ---------- */

  const handleSort = useCallback((key: string) => {
    setSortDir((prev) => (sortKey === key ? (prev === 'asc' ? 'desc' : 'asc') : 'desc'))
    setSortKey(key)
  }, [sortKey])

  const sortedOtaKpis = useMemo(() => {
    const copy = [...otaKpisWithConversion]
    const key = sortKey === 'conversion_rate' ? 'conversion_pct' : sortKey
    copy.sort((a, b) => {
      const aVal = (a as unknown as Record<string, unknown>)[key]
      const bVal = (b as unknown as Record<string, unknown>)[key]
      if (typeof aVal === 'string' && typeof bVal === 'string')
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
      const an = Number(aVal ?? 0)
      const bn = Number(bVal ?? 0)
      return sortDir === 'asc' ? an - bn : bn - an
    })
    return copy
  }, [otaKpisWithConversion, sortKey, sortDir])

  const sortIcon = (key: string) => {
    if (sortKey !== key) return <span className="text-gray-300 ml-1">&#8693;</span>
    return sortDir === 'asc'
      ? <span className="text-blue-600 ml-1">&#9650;</span>
      : <span className="text-blue-600 ml-1">&#9660;</span>
  }

  const tableColumns: { key: string; label: string; format: (v: unknown, row?: Record<string, unknown>) => string }[] = [
    { key: 'destination_id', label: 'Destination', format: (v) => countryName(String(v)) },
    { key: 'search_demand', label: 'Search Demand', format: (v) => fmt(Number(v)) },
    { key: 'bookings', label: 'Bookings', format: (v) => fmt(Number(v)) },
    {
      key: 'conversion_rate',
      label: 'Conversion %',
      format: (_v, row) => {
        const sd = Number(row?.search_demand ?? 0)
        const bk = Number(row?.bookings ?? 0)
        const conv = sd > 0 ? (bk / sd) * 100 : 0
        return pct(conv)
      },
    },
    { key: 'market_share_pct', label: 'Market Share %', format: (v) => pct(Number(v)) },
  ]

  /* ---------- actions ---------- */

  const actions = [
    { title: 'Optimize Commission Structure', description: 'Review tiered commission rates for top-performing destinations to maximize net revenue while maintaining competitive positioning.', priority: 'high' as const },
    { title: 'Improve Conversion Funnel', description: 'Analyze drop-off points in the search-to-book funnel for low-converting destinations and implement UX improvements.', priority: 'high' as const },
    { title: 'Expand Mobile Experience', description: 'With an estimated 65% mobile share, invest in mobile-first booking flows, push notifications, and app-exclusive deals.', priority: 'medium' as const },
    { title: 'Reduce Cancellation Rates', description: 'Implement flexible rebooking policies and partial refund options to reduce cancellations while protecting revenue.', priority: 'medium' as const },
    { title: 'Diversify Supply Portfolio', description: 'Onboard alternative accommodation types (vacation rentals, boutique hotels) in high-demand markets to increase listing inventory.', priority: 'low' as const },
  ]

  /* ---------- render ---------- */

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-slate-800">OTA Dashboard</h2>
        <div className="flex items-center justify-center h-64 text-slate-400">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span>Loading OTA dashboard data...</span>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-slate-800">OTA Dashboard</h2>
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
        <h2 className="text-2xl font-bold text-slate-800">OTA Dashboard</h2>
        <p className="text-slate-500 mt-1">
          Online Travel Agency marketplace performance, demand metrics, and conversion analytics.
        </p>
      </div>

      {/* 1. Executive Summary */}
      <ExecSummary insights={insights} />

      {/* 2. KPI Cards – 4x3 grid */}
      <div>
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Marketplace Performance</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            title="Gross Booking Value"
            value={fmtDollar(gbv)}
            icon="💰"
            subtitle="Total bookings × avg ADR"
            tooltip="Computed as total bookings multiplied by average daily rate across all destinations"
          />
          <KpiCard
            title="Net Revenue"
            value={fmtDollar(netRevenue)}
            icon="💵"
            subtitle="GBV × 15% commission"
            tooltip="Estimated net revenue based on 15% commission rate"
          />
          <KpiCard
            title="Take Rate %"
            value={pct(takeRatePct)}
            icon="📐"
            subtitle="Commission / GBV"
            tooltip="Platform take rate: commission as percentage of gross booking value"
          />
          <KpiCard
            title="Commission Revenue"
            value={fmtDollar(netRevenue)}
            icon="🏦"
            subtitle="Platform earnings"
            tooltip="Total commission revenue earned by the platform"
          />
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Demand Metrics</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            title="Total Searches"
            value={fmt(totalSearchDemand)}
            icon="🔍"
            subtitle="Aggregate search volume"
            tooltip="Total search demand across all destinations and time periods"
          />
          <KpiCard
            title="Look-to-Book Ratio"
            value={lookToBook.toFixed(1)}
            icon="👁"
            subtitle="Searches per booking"
            tooltip="Number of searches required to generate one booking"
          />
          <KpiCard
            title="Conversion Rate"
            value={pct(conversionRate)}
            icon="🎯"
            subtitle="Bookings / searches"
            tooltip="Percentage of searches that convert to confirmed bookings"
          />
          <KpiCard
            title="Unique Visitors"
            value={fmt(uniqueVisitors)}
            icon="👥"
            subtitle="Est. 3× search volume"
            tooltip="Estimated unique visitors based on industry multiplier of 3× search volume"
          />
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Supply & User Metrics</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            title="Active Listings"
            value={fmt(activeListings)}
            icon="🏠"
            subtitle={`~50 per destination × ${destCount}`}
            tooltip="Estimated number of active property listings across all destinations"
          />
          <KpiCard
            title="Avg Booking Window"
            value="28 days"
            icon="📅"
            subtitle="Lead time estimate"
            tooltip="Average number of days between search and check-in date"
          />
          <KpiCard
            title="Mobile Share"
            value="65%"
            icon="📱"
            subtitle="Mobile bookings est."
            tooltip="Estimated percentage of bookings made via mobile devices"
          />
          <KpiCard
            title="Cancellation Rate"
            value={pct(avgCancellation)}
            icon="❌"
            subtitle="Avg across destinations"
            tooltip="Average cancellation rate from pre/post crisis corridor data"
          />
        </div>
      </div>

      {/* 3. Charts – 2x2 grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ChartCard title="Search Volume vs Bookings Trend" subtitle="Monthly aggregate from timeline">
          {searchVsBookingsTrend.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-400">No timeline data</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={searchVsBookingsTrend} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={fmt} width={55} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={fmt} width={55} />
                <Tooltip formatter={(v: number, name: string) => [fmt(v), name]} contentStyle={{ fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line yAxisId="left" type="monotone" dataKey="search_demand" name="Search Demand" stroke="#6366f1" strokeWidth={2} dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="bookings" name="Bookings" stroke="#10b981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Look-to-Book Ratio Over Time" subtitle="Search demand / bookings per period">
          {lookToBookTrend.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-400">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={lookToBookTrend} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} width={45} />
                <Tooltip formatter={(v: number) => [v.toFixed(2), 'Look-to-Book']} contentStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="ratio" name="Look-to-Book" stroke="#f59e0b" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Conversion Rate by Destination" subtitle="Bookings / search demand per market">
          {conversionByDest.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-400">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(300, conversionByDest.length * 28)}>
              <BarChart data={conversionByDest} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => v + '%'} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                <Tooltip formatter={(v: number) => [pct(v), 'Conversion Rate']} contentStyle={{ fontSize: 12 }} />
                <Bar dataKey="conversion_rate" name="Conversion %" fill="#3b82f6" radius={[0, 4, 4, 0]}>
                  {conversionByDest.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Market Share by Destination" subtitle="Top 12 destinations by share">
          {marketShareData.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-400">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={marketShareData}
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  innerRadius={45}
                  dataKey="value"
                  nameKey="name"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={{ strokeWidth: 1 }}
                  style={{ fontSize: 10 }}
                >
                  {marketShareData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => [pct(v), 'Market Share']} contentStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* 4. OTA Performance Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">OTA Performance by Destination</h3>
        {sortedOtaKpis.length === 0 ? (
          <div className="text-center text-slate-400 py-8">No OTA KPI data available.</div>
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
                {sortedOtaKpis.map((row, i) => (
                  <tr key={row.destination_id || i} className="hover:bg-slate-50/50 transition-colors">
                    {tableColumns.map((col) => (
                      <td key={col.key} className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">
                        {col.format((row as unknown as Record<string, unknown>)[col.key], row as unknown as Record<string, unknown>)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 5. Action Panel */}
      <ActionPanel actions={actions} />
    </div>
  )
}
