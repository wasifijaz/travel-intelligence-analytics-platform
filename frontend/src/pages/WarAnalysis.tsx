import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { fetchAnalytics, fetchCrisisEvents, type ShockMetric, type CrisisEvent } from '../services/api'
import ChartCard from '../components/ChartCard'
import DataTable from '../components/DataTable'
import FiltersPanel from '../components/FiltersPanel'

export default function WarAnalysis() {
  const [analytics, setAnalytics] = useState<{
    shock_metrics: ShockMetric[]
    top_gaining: ShockMetric[]
    top_losing: ShockMetric[]
    search_booking_corr: { pearson_r?: number; r_squared?: number; n?: number }
  } | null>(null)
  const [crisis, setCrisis] = useState<CrisisEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([
      fetchAnalytics({ date_from: dateFrom || undefined, date_to: dateTo || undefined }),
      fetchCrisisEvents(),
    ])
      .then(([a, c]) => {
        if (cancelled) return
        setAnalytics(a)
        setCrisis(c.data || [])
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || 'Failed to load analytics')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [dateFrom, dateTo])

  if (error) {
    return (
      <div className="rounded-xl bg-red-50 border border-red-200 p-6 text-red-700">
        <p className="font-medium">Error loading war analysis</p>
        <p className="text-sm mt-1">{error}</p>
      </div>
    )
  }

  const topGain = (analytics?.top_gaining || []).slice(0, 12).map((r) => ({
    name: String(r.destination_id).slice(0, 12),
    change: r.booking_change_pct != null ? Number(r.booking_change_pct) : 0,
  }))
  const topLose = (analytics?.top_losing || []).slice(0, 12).map((r) => ({
    name: String(r.destination_id).slice(0, 12),
    change: r.booking_change_pct != null ? Number(r.booking_change_pct) : 0,
  }))

  const shockColumns = [
    { key: 'destination_id', label: 'Destination' },
    { key: 'booking_change_pct', label: 'Booking change %', format: (v: unknown) => (v != null ? Number(v).toFixed(2) + '%' : '—') },
    { key: 'search_change_pct', label: 'Search change %', format: (v: unknown) => (v != null ? Number(v).toFixed(2) + '%' : '—') },
    { key: 'adr_change_pct', label: 'ADR change %', format: (v: unknown) => (v != null ? Number(v).toFixed(2) + '%' : '—') },
  ]

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-800">War & crisis analysis</h2>
      <FiltersPanel>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </FiltersPanel>

      {/* Correlation */}
      {analytics?.search_booking_corr && (analytics.search_booking_corr.pearson_r != null || analytics.search_booking_corr.r_squared != null) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-card p-5">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pearson r</p>
            <p className="mt-1 text-xl font-bold text-slate-800">
              {Number(analytics.search_booking_corr.pearson_r).toFixed(3)}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-card p-5">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">R²</p>
            <p className="mt-1 text-xl font-bold text-slate-800">
              {Number(analytics.search_booking_corr.r_squared).toFixed(3)}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-card p-5">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">N</p>
            <p className="mt-1 text-xl font-bold text-slate-800">{analytics.search_booking_corr.n ?? '—'}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ChartCard title="Top gaining destinations (booking change %)">
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-slate-400">Loading…</div>
          ) : topGain.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-400">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={topGain} layout="vertical" margin={{ top: 8, right: 24, left: 64, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => v + '%'} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={64} />
                <Tooltip formatter={(v: number) => [v.toFixed(2) + '%', 'Change']} contentStyle={{ fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="change" name="Booking change %" fill="#10b981" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Top losing destinations (booking change %)">
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-slate-400">Loading…</div>
          ) : topLose.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-400">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={topLose} layout="vertical" margin={{ top: 8, right: 24, left: 64, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => v + '%'} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={64} />
                <Tooltip formatter={(v: number) => [v.toFixed(2) + '%', 'Change']} contentStyle={{ fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="change" name="Booking change %" fill="#ef4444" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <ChartCard title="Shock metrics by destination">
        <DataTable
          columns={shockColumns}
          data={(analytics?.shock_metrics || []) as unknown as Record<string, unknown>[]}
          loading={loading}
          emptyMessage="No shock metrics in this range."
        />
      </ChartCard>

      <ChartCard title="Crisis events (2022–2026)">
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-slate-400">Loading…</div>
        ) : crisis.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-slate-400">No crisis events</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 font-semibold text-slate-600">Event</th>
                  <th className="text-left py-2 font-semibold text-slate-600">Start</th>
                  <th className="text-left py-2 font-semibold text-slate-600">End</th>
                  <th className="text-left py-2 font-semibold text-slate-600">Regions</th>
                </tr>
              </thead>
              <tbody>
                {crisis.map((e, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="py-2 text-slate-800">{e.crisis_name}</td>
                    <td className="py-2 text-slate-600">{e.crisis_start_date}</td>
                    <td className="py-2 text-slate-600">{e.crisis_end_date ?? '—'}</td>
                    <td className="py-2 text-slate-600 max-w-[200px] truncate">{e.affected_regions ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ChartCard>
    </div>
  )
}
