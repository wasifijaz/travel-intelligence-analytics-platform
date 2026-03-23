import { useEffect, useState, useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from 'recharts'
import {
  fetchTravelDemandExecutiveSummary,
  fetchTravelDemandIntel,
  type TravelDemandIntelPayload,
} from '../services/api'
import { useFilterParams } from '../hooks/useFilteredData'
import ChartCard from '../components/ChartCard'
import KpiCard from '../components/KpiCard'
import DemandFunnel from '../components/DemandFunnel'

function fmt(n: number | null | undefined, digits = 0): string {
  if (n == null || Number.isNaN(n)) return '—'
  const v = Number(n)
  if (digits > 0) return v.toFixed(digits)
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M'
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K'
  return v % 1 === 0 ? String(v) : v.toFixed(1)
}

function pctChangeDisplay(v: number | null | undefined): number | undefined {
  if (v == null || Number.isNaN(v)) return undefined
  return v * 100
}

export default function TravelDemandIntelligence() {
  const filterParams = useFilterParams()
  const effectiveParams = useMemo(
    () => ({
      ...filterParams,
      date_from: filterParams.date_from || '2026-01-01',
      date_to: filterParams.date_to || '2026-12-31',
    }),
    [filterParams],
  )
  const [data, setData] = useState<TravelDemandIntelPayload | null>(null)
  const [executiveSummary, setExecutiveSummary] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([
      fetchTravelDemandIntel(effectiveParams),
      fetchTravelDemandExecutiveSummary(effectiveParams).catch(() => ({ summary: '' })),
    ])
      .then(([d, s]) => {
        if (!cancelled) setData(d)
        if (!cancelled) setExecutiveSummary(s?.summary || '')
      })
      .catch((e) => {
        if (!cancelled) {
          const status = e?.response?.status
          if (status === 404) {
            setError(
              'API returned 404 for /api/travel-demand/intelligence. Stop any old process on port 8080, then start a fresh API: python run_api.py (from the project root). If you use uvicorn, restart it so routes reload.'
            )
          } else {
            setError(e?.message || 'Failed to load Travel Demand Intelligence')
          }
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [effectiveParams])

  const m = data?.measures
  const funnelStages = useMemo(() => {
    const f = data?.funnel ?? []
    return f.map((s) => ({ name: s.stage, value: s.value }))
  }, [data?.funnel])

  const seatBarData = useMemo(() => data?.seat_vs_bookings ?? [], [data?.seat_vs_bookings])

  const COLORS = ['#3B82F6', '#2563EB', '#1D4ED8', '#1E40AF', '#312E81']

  if (error) {
    return (
      <div className="rounded-xl bg-red-50 border border-red-200 p-6 text-red-700">
        <p className="font-medium">Error</p>
        <p className="text-sm mt-1">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Travel Demand Intelligence</h2>
        <p className="text-sm text-slate-500 mt-1">
          Intent → accessibility → conversion — flights, visas, and platform demand (uses global filters).
        </p>
      </div>

      {!loading && (
        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wider">Executive summary</h3>
          <ChartCard title="Executive Summary" subtitle="Decision-ready narrative for the selected scope">
            <div className="text-sm text-slate-700 leading-7">
              {executiveSummary || data?.insights?.global_travel_market_pulse || 'Travel demand signals are mixed.'}
            </div>
          </ChartCard>
        </section>
      )}

      {loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse bg-slate-200 rounded-xl" />
          ))}
        </div>
      )}

      {!loading && data && (
        <>
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wider">Demand funnel</h3>
            {funnelStages.length > 0 ? (
              <DemandFunnel stages={funnelStages} />
            ) : (
              <p className="text-sm text-slate-500">No funnel data for the selected filters.</p>
            )}
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wider">Lead indicators</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              <KpiCard
                title="Flights lead (30D)"
                value={fmt(m?.flights_lead_30d)}
                tooltip="Flights total with date window shifted −30 days (lead signal)."
              />
              <KpiCard
                title="Visa lead (15D)"
                value={fmt(m?.visa_lead_15d)}
                tooltip="Visas issued with date window shifted −15 days."
              />
              <KpiCard
                title="Total bookings"
                value={fmt(m?.total_bookings)}
                change={pctChangeDisplay(m?.bookings_growth)}
                tooltip="Bookings from daily_metrics in filter context."
              />
              <KpiCard
                title="Total searches"
                value={fmt(m?.total_searches)}
                tooltip="Search demand from daily_metrics."
              />
              <KpiCard
                title="Visa → booking %"
                value={m?.visa_to_booking_pct != null ? `${m.visa_to_booking_pct.toFixed(1)}%` : '—'}
                tooltip="Bookings / visas issued."
              />
              <KpiCard
                title="Search → visa %"
                value={m?.search_to_visa_pct != null ? `${m.search_to_visa_pct.toFixed(1)}%` : '—'}
                tooltip="Visa applications / searches."
              />
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wider">Supply vs demand</h3>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <ChartCard
                title="Seat capacity vs bookings"
                subtitle="Filtered period — platform bookings vs flight seat capacity"
              >
                {seatBarData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={seatBarData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#64748b" />
                      <YAxis tick={{ fontSize: 11 }} stroke="#64748b" />
                      <Tooltip
                        contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0' }}
                        formatter={(v: number) => [fmt(v), '']}
                      />
                      <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                        {seatBarData.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-slate-400">Set a date range to compare seat capacity and bookings.</p>
                )}
              </ChartCard>

              <ChartCard title="Load factor trend" subtitle="Monthly — passengers / seat capacity">
                {(data.load_factor_trend?.length ?? 0) > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={data.load_factor_trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#64748b" />
                      <YAxis
                        domain={[0, 'auto']}
                        tick={{ fontSize: 11 }}
                        stroke="#64748b"
                        tickFormatter={(v) => `${v}%`}
                      />
                      <Tooltip
                        contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0' }}
                        formatter={(v: number) => [`${v.toFixed(1)}%`, 'Load factor']}
                      />
                      <Line
                        type="monotone"
                        dataKey="load_factor_pct"
                        stroke="#2563EB"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-slate-400">No flight facts in range.</p>
                )}
              </ChartCard>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <KpiCard
                title="Seat capacity"
                value={fmt(m?.seat_capacity)}
                tooltip="Sum of seat_capacity on fact_flights."
              />
              <KpiCard
                title="Load factor %"
                value={m?.load_factor_pct != null ? `${m.load_factor_pct.toFixed(1)}%` : '—'}
                tooltip="Passengers / seat capacity (from load_factor × capacity)."
              />
              <KpiCard
                title="Capacity vs demand gap"
                value={fmt(m?.capacity_vs_demand_gap)}
                tooltip="Seat capacity − total bookings."
              />
              <KpiCard
                title="Airfare index"
                value={m?.airfare_index != null ? m.airfare_index.toFixed(0) : '—'}
                tooltip="Average of avg_airfare on filtered flights."
              />
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wider">Market health</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <KpiCard
                title="Market health index"
                value={m?.market_health_index != null ? (m.market_health_index * 100).toFixed(1) + '%' : '—'}
                subtitle="Avg of flights, visa, booking growth vs prior period"
                tooltip="Composite of period-over-period growth rates."
              />
              <KpiCard
                title="Flights growth"
                value={m?.flights_growth != null ? `${(m.flights_growth * 100).toFixed(1)}%` : '—'}
                tooltip="vs parallel prior window"
              />
              <KpiCard
                title="Visa growth"
                value={m?.visa_growth != null ? `${(m.visa_growth * 100).toFixed(1)}%` : '—'}
              />
              <KpiCard
                title="Booking growth"
                value={m?.bookings_growth != null ? `${(m.bookings_growth * 100).toFixed(1)}%` : '—'}
              />
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wider">Route & origin analysis</h3>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <ChartCard title="Flights by route" subtitle="Top routes by flight count">
                {(data.flights_by_route?.length ?? 0) > 0 ? (
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart
                      data={data.flights_by_route}
                      layout="vertical"
                      margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis
                        type="category"
                        dataKey="route"
                        width={120}
                        tick={{ fontSize: 10 }}
                        interval={0}
                      />
                      <Tooltip
                        contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0' }}
                        formatter={(v: number) => [fmt(v), 'Flights']}
                      />
                      <Bar dataKey="flights_count" fill="#3B82F6" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-slate-400">No route data.</p>
                )}
              </ChartCard>

              <ChartCard title="Visas by origin country" subtitle="Top origins by applications">
                {(data.visas_by_origin?.length ?? 0) > 0 ? (
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart
                      data={data.visas_by_origin}
                      layout="vertical"
                      margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis
                        type="category"
                        dataKey="origin_country"
                        width={100}
                        tick={{ fontSize: 10 }}
                        interval={0}
                      />
                      <Tooltip
                        contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0' }}
                        formatter={(v: number) => [fmt(v), 'Applications']}
                      />
                      <Bar dataKey="visa_applications" fill="#1D4ED8" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-slate-400">No visa data.</p>
                )}
              </ChartCard>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <KpiCard title="Flights total" value={fmt(m?.flights_total)} />
              <KpiCard title="Visa applications" value={fmt(m?.visa_applications)} />
              <KpiCard title="Visa approval %" value={m?.visa_approval_rate_pct != null ? `${m.visa_approval_rate_pct.toFixed(1)}%` : '—'} />
              <KpiCard title="Visa rejection %" value={m?.visa_rejection_rate_pct != null ? `${m.visa_rejection_rate_pct.toFixed(1)}%` : '—'} />
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wider">Global travel market pulse</h3>
            <ChartCard title="Global Travel Market Pulse" subtitle="Executive narrative driven by current filter context">
              <div className="text-sm text-slate-700 leading-7">
                {data.insights?.global_travel_market_pulse ?? 'No pulse insight available for selected filters.'}
              </div>
            </ChartCard>
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wider">Lead & lag indicators (advanced)</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              <KpiCard title="Flights lead (60D)" value={fmt(m?.flights_lead_60d)} />
              <KpiCard title="Visa lead (30D)" value={fmt(m?.visa_lead_30d)} />
              <KpiCard title="Booking lag from visa (days)" value={fmt(m?.booking_lag_from_visa_days)} />
              <KpiCard title="Room nights" value={fmt(m?.room_nights)} />
              <KpiCard title="Visa to arrival lag (days)" value={fmt(m?.visa_to_arrival_lag_days)} />
              <KpiCard title="Policy impact index" value={m?.policy_impact_index != null ? `${(m.policy_impact_index * 100).toFixed(1)}%` : '—'} />
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
              {data.insights?.lead_indicators_insight}
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wider">Visa intelligence KPIs</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              <KpiCard
                title="Visa issued"
                value={fmt(m?.visa_issued)}
                tooltip="Represents confirmed travel intent. Strong leading indicator for inbound demand."
              />
              <KpiCard
                title="Visa approval rate %"
                value={m?.visa_approval_rate_pct != null ? `${m.visa_approval_rate_pct.toFixed(1)}%` : '—'}
                tooltip="Higher approval rates increase conversion into actual travel and hotel bookings."
              />
              <KpiCard
                title="Processing time (days)"
                value={m?.processing_time_days != null ? m.processing_time_days.toFixed(1) : '—'}
                tooltip="Longer processing times delay booking cycles and reduce short-term demand."
              />
              <KpiCard
                title="Visa growth WoW"
                value={m?.visa_growth_wow != null ? `${(m.visa_growth_wow * 100).toFixed(1)}%` : '—'}
                tooltip="Measures acceleration or slowdown in travel intent across markets."
              />
              <KpiCard
                title="Visa growth YoY"
                value={m?.visa_growth_yoy != null ? `${(m.visa_growth_yoy * 100).toFixed(1)}%` : '—'}
                tooltip="Measures acceleration or slowdown in travel intent across markets."
              />
              <KpiCard
                title="Visa to booking conversion %"
                value={m?.visa_to_booking_pct != null ? `${m.visa_to_booking_pct.toFixed(1)}%` : '—'}
              />
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
              {data.insights?.visa_intelligence_insight}
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wider">Elasticity & shock propagation</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <KpiCard
                title="Flights vs bookings elasticity"
                value={m?.flights_vs_bookings_elasticity != null ? m.flights_vs_bookings_elasticity.toFixed(2) : '—'}
                tooltip="Measures how sensitive booking demand is to changes in flight supply."
              />
              <KpiCard title="Visa shock baseline" value={m?.visa_shock_baseline != null ? m.visa_shock_baseline.toFixed(2) : '—'} />
              <KpiCard title="Flight shock baseline" value={m?.flight_shock_baseline != null ? m.flight_shock_baseline.toFixed(2) : '—'} />
              <KpiCard title="Booking shock baseline" value={m?.booking_shock_baseline != null ? m.booking_shock_baseline.toFixed(2) : '—'} />
            </div>
            <ChartCard title="Shock propagation model" subtitle="Indexed trend: visa, flight, and booking shocks over time">
              {(data.shock_trend?.length ?? 0) > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={data.shock_trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#64748b" />
                    <YAxis tick={{ fontSize: 11 }} stroke="#64748b" />
                    <Tooltip
                      contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0' }}
                      formatter={(v: number) => [Number(v).toFixed(2), 'Index']}
                    />
                    <Line type="monotone" dataKey="visa_shock" stroke="#1D4ED8" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="flight_shock" stroke="#3B82F6" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="booking_shock" stroke="#0F766E" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-slate-400">No shock trend available for selected filters.</p>
              )}
            </ChartCard>
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
              {data.insights?.elasticity_insight}
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wider">Action panel</h3>
            <div className="bg-white rounded-xl border border-slate-200 shadow-card p-5">
              <ul className="space-y-2">
                {(data.action_panel ?? []).slice(0, 5).map((item, idx) => (
                  <li key={`${idx}-${item}`} className="text-sm text-slate-700 flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-blue-500" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
