import { useEffect, useState } from 'react'
import { fetchMetrics, fetchSummary } from '../services/api'
import { useFilterParams } from '../hooks/useFilteredData'
import DataTable from '../components/DataTable'
import FiltersPanel from '../components/FiltersPanel'

export default function Metrics() {
  const filterParams = useFilterParams()
  const [data, setData] = useState<Record<string, unknown>[]>([])
  const [summary, setSummary] = useState<{ date_min: string | null; date_max: string | null } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [limit, setLimit] = useState(500)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const params = {
      ...filterParams,
      date_from: dateFrom || filterParams.date_from,
      date_to: dateTo || filterParams.date_to,
    }
    Promise.all([
      fetchSummary(params),
      fetchMetrics({ ...params, limit }),
    ])
      .then(([s, m]) => {
        if (cancelled) return
        setSummary(s)
        setData((m.data as Record<string, unknown>[]) || [])
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || 'Failed to load metrics')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [filterParams, dateFrom, dateTo, limit])

  const columns = [
    { key: 'date', label: 'Date' },
    { key: 'destination_id', label: 'Destination' },
    { key: 'bookings', label: 'Bookings', format: (v: unknown) => (v != null ? String(Number(v)) : '—') },
    { key: 'search_demand', label: 'Search demand', format: (v: unknown) => (v != null ? String(Number(v)) : '—') },
    { key: 'adr', label: 'ADR', format: (v: unknown) => (v != null ? Number(v).toFixed(0) : '—') },
    { key: 'room_nights', label: 'Room nights', format: (v: unknown) => (v != null ? String(Number(v)) : '—') },
  ]

  if (error) {
    return (
      <div className="rounded-xl bg-red-50 border border-red-200 p-6 text-red-700">
        <p className="font-medium">Error loading metrics</p>
        <p className="text-sm mt-1">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-800">Metrics</h2>
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
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Limit</label>
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value={100}>100</option>
            <option value={500}>500</option>
            <option value={1000}>1000</option>
            <option value={5000}>5000</option>
          </select>
        </div>
      </FiltersPanel>
      {summary != null && (
        <p className="text-sm text-slate-500">
          Showing up to {data.length} rows. Data range: {summary.date_min ?? '—'} to {summary.date_max ?? '—'}
        </p>
      )}
      <DataTable columns={columns} data={data} loading={loading} emptyMessage="No metrics in this range." />
    </div>
  )
}
