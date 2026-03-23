import { useEffect, useState, useMemo } from 'react'
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
} from 'recharts'
import {
  fetchSummary,
  fetchTimeline,
  fetchPrePost,
  fetchCrisisEvents,
  type Summary,
  type TimelinePoint,
  type CrisisEvent,
} from '../services/api'
import { useFilterParams } from '../hooks/useFilteredData'
import KpiCard from '../components/KpiCard'
import ExecSummary from '../components/ExecSummary'
import ActionPanel from '../components/ActionPanel'
import ChartCard from '../components/ChartCard'
import { countryName } from '../utils/countryNames'

interface PrePostData {
  pre?: PrePostEntry[]
  post?: PrePostEntry[]
  crisis_date?: string
  [k: string]: unknown
}

interface PrePostEntry {
  destination_id: string
  bookings?: number
  search_demand?: number
  adr?: number
  occupancy_rate?: number
  cancellation_rate?: number
  [k: string]: unknown
}

interface IndexPoint {
  date: string
  hotelIndex: number
  otaIndex: number
  techIndex: number
  rawAdr: number
  rawSearch: number
  rawBookings: number
}

function fmtDollar(n: number): string {
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B'
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M'
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K'
  return '$' + n.toFixed(0)
}

function pct(n: number, signed = false): string {
  const prefix = signed && n >= 0 ? '+' : ''
  return prefix + n.toFixed(1) + '%'
}

export default function StockAnalysis() {
  const filterParams = useFilterParams()
  const [summary, setSummary] = useState<Summary | null>(null)
  const [timeline, setTimeline] = useState<TimelinePoint[]>([])
  const [prePostRaw, setPrePostRaw] = useState<PrePostData | null>(null)
  const [crisisEvents, setCrisisEvents] = useState<CrisisEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([
      fetchSummary(filterParams),
      fetchTimeline(filterParams),
      fetchPrePost(filterParams),
      fetchCrisisEvents(),
    ])
      .then(([s, tl, pp, ce]) => {
        if (cancelled) return
        setSummary(s)
        setTimeline(tl?.data ?? [])
        setPrePostRaw(pp as PrePostData)
        setCrisisEvents(ce?.data ?? (Array.isArray(ce) ? ce : []))
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || 'Failed to load stock analysis data')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [filterParams])

  /* ---------- pre/post aggregates (API returns objects with total_bookings, not arrays) ---------- */

  const extractPrePostStats = (raw: unknown): { bookings: number; search: number; adr: number; occupancy: number } => {
    if (raw == null || typeof raw !== 'object') return { bookings: 0, search: 0, adr: 0, occupancy: 0 }
    const o = raw as Record<string, unknown>
    if (Array.isArray(o)) {
      if (!o.length) return { bookings: 0, search: 0, adr: 0, occupancy: 0 }
      const rows = o as PrePostEntry[]
      return {
        bookings: rows.reduce((s, d) => s + (d.bookings ?? 0), 0),
        search: rows.reduce((s, d) => s + (d.search_demand ?? 0), 0),
        adr: rows.reduce((s, d) => s + (d.adr ?? 0), 0) / rows.length,
        occupancy: rows.reduce((s, d) => s + (d.occupancy_rate ?? 0), 0) / rows.length,
      }
    }
    return {
      bookings: Number(o.total_bookings ?? o.bookings ?? 0),
      search: Number(o.total_search_demand ?? o.search_demand ?? 0),
      adr: Number(o.avg_adr ?? o.adr ?? 0),
      occupancy: Number(o.avg_occupancy_rate ?? o.occupancy_rate ?? 0),
    }
  }

  const preAgg = useMemo(() => extractPrePostStats(prePostRaw?.pre), [prePostRaw])

  const postAgg = useMemo(() => extractPrePostStats(prePostRaw?.post), [prePostRaw])

  const volatilityIndex = useMemo(() => {
    if (!timeline.length) return 0
    const ratios = timeline
      .filter((t) => t.bookings > 0)
      .map((t) => (t.search_demand ?? 0) / t.bookings)
    if (ratios.length < 2) return 0
    const mean = ratios.reduce((s, r) => s + r, 0) / ratios.length
    const variance = ratios.reduce((s, r) => s + (r - mean) ** 2, 0) / ratios.length
    return Math.sqrt(variance)
  }, [timeline])

  const marketCapProxy = useMemo(() => {
    const bookings = summary?.total_bookings ?? 0
    const avgAdr = timeline.length
      ? timeline.reduce((s, t) => s + (t.adr ?? 0), 0) / timeline.length
      : 150
    return bookings * avgAdr
  }, [summary, timeline])

  const topGainingSector = useMemo(() => {
    const postRaw = prePostRaw?.post
    const preRaw = prePostRaw?.pre
    const post = Array.isArray(postRaw) ? postRaw : []
    const pre = Array.isArray(preRaw) ? preRaw : []
    if (!post.length || !pre.length) return 'N/A'
    const preMap = new Map(pre.map((d) => [d.destination_id, d.bookings ?? 0]))
    let best = { id: 'N/A', change: -Infinity }
    for (const d of post) {
      const preBk = preMap.get(d.destination_id) ?? 0
      const postBk = d.bookings ?? 0
      const change = preBk > 0 ? ((postBk - preBk) / preBk) * 100 : 0
      if (change > best.change) best = { id: d.destination_id, change }
    }
    return countryName(best.id)
  }, [prePostRaw])

  /* ---------- crisis date for reference lines ---------- */

  const crisisDate = useMemo(() => {
    if (prePostRaw?.crisis_date) return String(prePostRaw.crisis_date)
    if (crisisEvents.length) return crisisEvents[0].crisis_start_date
    return undefined
  }, [prePostRaw, crisisEvents])

  const crisisDateShort = crisisDate?.slice(0, 7)

  /* ---------- normalized index data ---------- */

  const indexData = useMemo<IndexPoint[]>(() => {
    if (!timeline.length) return []
    const first = timeline[0]
    const baseAdr = first.adr || 1
    const baseSearch = first.search_demand || 1
    const baseBookings = first.bookings || 1

    return timeline.map((t) => {
      const adrVal = t.adr ?? 0
      const searchVal = t.search_demand ?? 0
      const bookingsVal = t.bookings ?? 0
      return {
        date: t.date?.length >= 10 ? t.date.slice(0, 7) : t.date,
        hotelIndex: +((adrVal / baseAdr) * 100).toFixed(1),
        otaIndex: +((searchVal / baseSearch) * 100).toFixed(1),
        techIndex: +((bookingsVal / baseBookings) * 100).toFixed(1),
        rawAdr: adrVal,
        rawSearch: searchVal,
        rawBookings: bookingsVal,
      }
    })
  }, [timeline])

  const compositeAvg = (d: IndexPoint) => (d.hotelIndex + d.otaIndex + d.techIndex) / 3

  const preIndex = useMemo(() => {
    if (!indexData.length || !crisisDateShort) return 0
    const pre = indexData.filter((d) => d.date < crisisDateShort)
    if (!pre.length) return 0
    return pre.reduce((s, d) => s + compositeAvg(d), 0) / pre.length
  }, [indexData, crisisDateShort])

  const postIndex = useMemo(() => {
    if (!indexData.length || !crisisDateShort) return 0
    const post = indexData.filter((d) => d.date >= crisisDateShort)
    if (!post.length) return 0
    return post.reduce((s, d) => s + compositeAvg(d), 0) / post.length
  }, [indexData, crisisDateShort])

  const recoveryPct = useMemo(() => {
    if (!indexData.length || !crisisDateShort) return 0
    const post = indexData.filter((d) => d.date >= crisisDateShort)
    if (!post.length) return 0
    const trough = Math.min(...post.map((d) => compositeAvg(d)))
    const last = compositeAvg(indexData[indexData.length - 1])
    if (trough <= 0) return 0
    return ((last - trough) / trough) * 100
  }, [indexData, crisisDateShort])

  const preCrisisDates = useMemo(() => {
    if (!crisisDateShort || !indexData.length) return { start: undefined, end: undefined }
    return { start: indexData[0]?.date, end: crisisDateShort }
  }, [crisisDateShort, indexData])

  const postCrisisDates = useMemo(() => {
    if (!crisisDateShort || !indexData.length) return { start: undefined, end: undefined }
    return { start: crisisDateShort, end: indexData[indexData.length - 1]?.date }
  }, [crisisDateShort, indexData])

  /* ---------- trough & recovery calc ---------- */

  const troughAndRecovery = useMemo(() => {
    if (indexData.length < 3) return { hotelTrough: 100, otaTrough: 100, techTrough: 100, avgRecovery: 0 }
    const hotelTrough = Math.min(...indexData.map((d) => d.hotelIndex))
    const otaTrough = Math.min(...indexData.map((d) => d.otaIndex))
    const techTrough = Math.min(...indexData.map((d) => d.techIndex))
    const lastHotel = indexData[indexData.length - 1].hotelIndex
    const lastOta = indexData[indexData.length - 1].otaIndex
    const lastTech = indexData[indexData.length - 1].techIndex
    const hotelRec = hotelTrough > 0 ? ((lastHotel - hotelTrough) / hotelTrough) * 100 : 0
    const otaRec = otaTrough > 0 ? ((lastOta - otaTrough) / otaTrough) * 100 : 0
    const techRec = techTrough > 0 ? ((lastTech - techTrough) / techTrough) * 100 : 0
    return { hotelTrough, otaTrough, techTrough, avgRecovery: (hotelRec + otaRec + techRec) / 3 }
  }, [indexData])

  /* ---------- sector comparison table ---------- */

  const sectorTable = useMemo(() => {
    if (!indexData.length) return []
    const last = indexData[indexData.length - 1]
    return [
      {
        sector: 'Hotels (ADR-based)',
        pre: 100,
        post: last.hotelIndex,
        change: last.hotelIndex - 100,
        recovery: troughAndRecovery.hotelTrough > 0
          ? ((last.hotelIndex - troughAndRecovery.hotelTrough) / troughAndRecovery.hotelTrough) * 100
          : 0,
      },
      {
        sector: 'OTAs (Search Demand)',
        pre: 100,
        post: last.otaIndex,
        change: last.otaIndex - 100,
        recovery: troughAndRecovery.otaTrough > 0
          ? ((last.otaIndex - troughAndRecovery.otaTrough) / troughAndRecovery.otaTrough) * 100
          : 0,
      },
      {
        sector: 'Travel Tech (Bookings)',
        pre: 100,
        post: last.techIndex,
        change: last.techIndex - 100,
        recovery: troughAndRecovery.techTrough > 0
          ? ((last.techIndex - troughAndRecovery.techTrough) / troughAndRecovery.techTrough) * 100
          : 0,
      },
    ]
  }, [indexData, troughAndRecovery])

  /* ---------- executive summary ---------- */

  const insights = useMemo(() => {
    const lines: string[] = [
      'Travel industry stocks tracked across 3 sectors: Hotels, OTAs, Travel Tech',
      `Average post-crisis recovery: ${pct(troughAndRecovery.avgRecovery, true)} from trough`,
    ]
    if (preAgg.bookings && postAgg.bookings) {
      const change = ((postAgg.bookings - preAgg.bookings) / preAgg.bookings) * 100
      lines.push(`Aggregate booking volume ${change >= 0 ? 'increased' : 'decreased'} ${pct(Math.abs(change))} post-crisis`)
    }
    if (volatilityIndex > 0)
      lines.push(`Market volatility index (search-to-book variance): ${volatilityIndex.toFixed(2)}`)
    lines.push(`Estimated market cap proxy: ${fmtDollar(marketCapProxy)}`)
    return lines
  }, [troughAndRecovery, preAgg, postAgg, volatilityIndex, marketCapProxy])

  /* ---------- actions ---------- */

  const actions = [
    { title: 'Overweight Hotel Sector', description: 'ADR recovery signals pricing power returning; hotels with strong brand portfolios in resilient destinations present the best risk-adjusted opportunity.', priority: 'high' as const },
    { title: 'Monitor OTA Recovery Momentum', description: 'Search demand indices suggest early recovery; track conversion rate improvements as a leading indicator for OTA revenue inflection.', priority: 'high' as const },
    { title: 'Hedge Volatility Exposure', description: 'Elevated search-to-book variance indicates demand uncertainty; consider options strategies or diversified sector ETFs to manage downside risk.', priority: 'medium' as const },
    { title: 'Accumulate Travel Tech on Dips', description: 'Booking technology platforms benefit from structural secular trends; post-crisis pullbacks create attractive entry points for long-term positions.', priority: 'medium' as const },
    { title: 'Rebalance Geographic Allocation', description: 'Shift allocation toward destinations showing fastest recovery trajectories and away from structurally impaired markets.', priority: 'low' as const },
  ]

  /* ---------- shared chart background regions ---------- */

  const renderCrisisRegions = () => {
    if (!preCrisisDates.start || !postCrisisDates.end || !crisisDateShort) return null
    return (
      <>
        <ReferenceArea
          x1={preCrisisDates.start}
          x2={crisisDateShort}
          fill="#dcfce7"
          fillOpacity={0.3}
          label={{ value: 'Pre-Crisis', position: 'insideTopLeft', fontSize: 10, fill: '#16a34a' }}
        />
        <ReferenceArea
          x1={crisisDateShort}
          x2={postCrisisDates.end}
          fill="#fef2f2"
          fillOpacity={0.3}
          label={{ value: 'Post-Crisis', position: 'insideTopRight', fontSize: 10, fill: '#dc2626' }}
        />
        <ReferenceLine x={crisisDateShort} stroke="#ef4444" strokeDasharray="4 4" label={{ value: 'Crisis', position: 'top', fontSize: 10, fill: '#ef4444' }} />
      </>
    )
  }

  /* ---------- render ---------- */

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-slate-800">Travel Industry Stock Analysis</h2>
        <div className="flex items-center justify-center h-64 text-slate-400">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span>Loading stock analysis data...</span>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-slate-800">Travel Industry Stock Analysis</h2>
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
        <h2 className="text-2xl font-bold text-slate-800">Travel Industry Stock Analysis</h2>
        <p className="text-slate-500 mt-1">
          Proxy stock indices derived from hospitality data: ADR, search demand, and booking trends across sectors.
        </p>
      </div>

      {/* 1. Executive Summary */}
      <ExecSummary insights={insights} />

      {/* 2. KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <KpiCard
          title="Pre-Crisis Index"
          value={preIndex.toFixed(1)}
          icon="📊"
          subtitle="Bookings / 1000"
          tooltip="Normalized pre-crisis market index based on total booking volume"
        />
        <KpiCard
          title="Post-Crisis Index"
          value={postIndex.toFixed(1)}
          icon="📉"
          subtitle="Bookings / 1000"
          tooltip="Normalized post-crisis market index based on total booking volume"
        />
        <KpiCard
          title="Market Recovery"
          value={pct(recoveryPct, true)}
          change={recoveryPct}
          icon="🔄"
          subtitle="Pre to post change"
          tooltip="Percentage change in market index from pre-crisis to post-crisis"
        />
        <KpiCard
          title="Volatility Index"
          value={volatilityIndex.toFixed(2)}
          icon="📈"
          subtitle="Search/book variance"
          tooltip="Standard deviation of search-to-booking ratio, measuring demand uncertainty"
        />
        <KpiCard
          title="Market Cap Proxy"
          value={fmtDollar(marketCapProxy)}
          icon="💰"
          subtitle="Bookings × avg ADR"
          tooltip="Market capitalization proxy computed as total bookings × average daily rate"
        />
        <KpiCard
          title="Best Sector Proxy"
          value={topGainingSector}
          icon="🏆"
          subtitle="Top gaining destination"
          tooltip="Destination with the highest post-crisis booking growth as sector proxy"
        />
      </div>

      {/* 3. Stock Performance Charts – 2x2 */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ChartCard title="Hotel Index" subtitle="ADR normalized trend (base 100)">
          {indexData.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-400">No timeline data</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={indexData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                {renderCrisisRegions()}
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} width={45} />
                <Tooltip
                  formatter={(v: number) => [v.toFixed(1), 'Hotel Index']}
                  contentStyle={{ fontSize: 12 }}
                />
                <ReferenceLine y={100} stroke="#94a3b8" strokeDasharray="3 3" label={{ value: 'Base 100', position: 'right', fontSize: 10, fill: '#94a3b8' }} />
                <Line type="monotone" dataKey="hotelIndex" name="Hotel Index" stroke="#f59e0b" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="OTA Index" subtitle="Search demand normalized trend (base 100)">
          {indexData.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-400">No timeline data</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={indexData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <defs>
                  <linearGradient id="otaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                {renderCrisisRegions()}
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} width={45} />
                <Tooltip
                  formatter={(v: number) => [v.toFixed(1), 'OTA Index']}
                  contentStyle={{ fontSize: 12 }}
                />
                <ReferenceLine y={100} stroke="#94a3b8" strokeDasharray="3 3" label={{ value: 'Base 100', position: 'right', fontSize: 10, fill: '#94a3b8' }} />
                <Area type="monotone" dataKey="otaIndex" name="OTA Index" stroke="#6366f1" strokeWidth={2} fill="url(#otaGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Travel Tech Index" subtitle="Bookings normalized trend (base 100)">
          {indexData.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-400">No timeline data</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={indexData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                {renderCrisisRegions()}
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} width={45} />
                <Tooltip
                  formatter={(v: number) => [v.toFixed(1), 'Tech Index']}
                  contentStyle={{ fontSize: 12 }}
                />
                <ReferenceLine y={100} stroke="#94a3b8" strokeDasharray="3 3" label={{ value: 'Base 100', position: 'right', fontSize: 10, fill: '#94a3b8' }} />
                <Line type="monotone" dataKey="techIndex" name="Travel Tech Index" stroke="#10b981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="All Sectors Combined" subtitle="Hotel, OTA & Travel Tech indices overlaid">
          {indexData.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-400">No timeline data</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={indexData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                {renderCrisisRegions()}
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} width={45} />
                <Tooltip
                  formatter={(v: number, name: string) => [v.toFixed(1), name]}
                  contentStyle={{ fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <ReferenceLine y={100} stroke="#94a3b8" strokeDasharray="3 3" />
                <Line type="monotone" dataKey="hotelIndex" name="Hotel Index" stroke="#f59e0b" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="otaIndex" name="OTA Index" stroke="#6366f1" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="techIndex" name="Travel Tech Index" stroke="#10b981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* 4. Sector Comparison Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Sector Comparison</h3>
        {sectorTable.length === 0 ? (
          <div className="text-center text-slate-400 py-8">No sector data available.</div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Sector</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Pre-Crisis Level</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Post-Crisis Level</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Change %</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Recovery %</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {sectorTable.map((row) => (
                  <tr key={row.sector} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-slate-800">{row.sector}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 text-right tabular-nums">{row.pre.toFixed(1)}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 text-right tabular-nums">{row.post.toFixed(1)}</td>
                    <td className={`px-4 py-3 text-sm text-right tabular-nums font-medium ${row.change >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {pct(row.change, true)}
                    </td>
                    <td className={`px-4 py-3 text-sm text-right tabular-nums font-medium ${row.recovery >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {pct(row.recovery, true)}
                    </td>
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
