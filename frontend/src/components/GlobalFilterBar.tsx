import { useEffect, useState } from 'react'
import { useFilters } from '../context/FilterContext'
import { fetchDestinations, fetchSourceMarkets } from '../services/api'
import { countryName } from '../utils/countryNames'

function offsetDate(dateStr: string, months: number): string {
  const d = new Date(dateStr)
  d.setMonth(d.getMonth() + months)
  return d.toISOString().slice(0, 10)
}

interface Destination {
  destination_id: string
  destination_name: string
  region: string
}

const TRAVEL_TYPES = [
  { value: 'international', label: 'International' },
  { value: 'domestic', label: 'Domestic' },
]

export default function GlobalFilterBar() {
  const { filters, setFilters, crisisEvents, latestMiddleEastCrisis } = useFilters()
  const [destinations, setDestinations] = useState<Destination[]>([])
  const [sourceMarkets, setSourceMarkets] = useState<string[]>([])

  useEffect(() => {
    fetchDestinations()
      .then(r => setDestinations(r.data || []))
      .catch(() => {})
    fetchSourceMarkets()
      .then(r => setSourceMarkets((r.data || []).map((m: { id: string }) => m.id)))
      .catch(() => {})
  }, [])

  function handleCrisisChange(crisisId: string) {
    if (!crisisId) {
      setFilters(f => ({ ...f, crisisEvent: null, dateFrom: '', dateTo: '' }))
      return
    }
    const event = crisisEvents.find(e => String(e.crisis_id) === crisisId) || null
    if (event) {
      setFilters(f => ({
        ...f,
        crisisEvent: event,
        dateFrom: offsetDate(event.crisis_start_date, -3),
        dateTo: offsetDate(event.crisis_start_date, 3),
      }))
    }
  }

  function handlePeriod(p: 'all' | 'pre' | 'post') {
    setFilters(f => ({ ...f, period: p }))
  }

  function handleReset() {
    setFilters({
      dateFrom: '',
      dateTo: '',
      crisisEvent: null,
      destination: '',
      sourceMarket: '',
      travelType: '',
      period: 'all',
    })
  }

  const destinationLabel = (d: Destination) => {
    const friendly = countryName(d.destination_id)
    return friendly !== d.destination_id
      ? `${friendly} (${d.destination_id})`
      : d.destination_name || d.destination_id
  }

  const hasActiveFilters = filters.dateFrom || filters.dateTo || filters.crisisEvent
    || filters.destination || filters.sourceMarket || filters.travelType || filters.period !== 'all'

  return (
    <div className="w-full">
      {latestMiddleEastCrisis && (
        <div className="bg-amber-600/90 text-white text-sm text-center py-1.5 px-4">
          <span className="font-semibold">Latest Middle East Crisis:</span>{' '}
          {latestMiddleEastCrisis.crisis_name} &mdash; {latestMiddleEastCrisis.crisis_start_date}
        </div>
      )}

      {filters.crisisEvent && (
        <div className="bg-sky-700/90 text-white text-sm text-center py-1.5 px-4">
          <span className="font-semibold">{filters.crisisEvent.crisis_name}</span>
          {' '}&mdash; started {filters.crisisEvent.crisis_start_date}
          {' | Showing 3 months before and after'}
        </div>
      )}

      <div className="bg-slate-800 text-white px-4 py-3 flex flex-wrap items-center gap-3">
        <label className="flex flex-col text-xs gap-0.5">
          <span className="text-slate-400">From</span>
          <input
            type="date"
            className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-sky-500"
            value={filters.dateFrom}
            onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))}
          />
        </label>

        <label className="flex flex-col text-xs gap-0.5">
          <span className="text-slate-400">To</span>
          <input
            type="date"
            className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-sky-500"
            value={filters.dateTo}
            onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))}
          />
        </label>

        <label className="flex flex-col text-xs gap-0.5">
          <span className="text-slate-400">Crisis Event</span>
          <select
            className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-sky-500"
            value={filters.crisisEvent ? String(filters.crisisEvent.crisis_id) : ''}
            onChange={e => handleCrisisChange(e.target.value)}
          >
            <option value="">All Events</option>
            {crisisEvents.map(ev => (
              <option key={ev.crisis_id} value={String(ev.crisis_id)}>
                {ev.crisis_name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col text-xs gap-0.5">
          <span className="text-slate-400">Source Market</span>
          <select
            className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-sky-500 max-w-[180px]"
            value={filters.sourceMarket}
            onChange={e => setFilters(f => ({ ...f, sourceMarket: e.target.value }))}
          >
            <option value="">All Markets</option>
            {sourceMarkets
              .sort((a, b) => countryName(a).localeCompare(countryName(b)))
              .map(m => (
                <option key={m} value={m}>
                  {countryName(m)} ({m})
                </option>
              ))}
          </select>
        </label>

        <label className="flex flex-col text-xs gap-0.5">
          <span className="text-slate-400">Destination</span>
          <select
            className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-sky-500 max-w-[180px]"
            value={filters.destination}
            onChange={e => setFilters(f => ({ ...f, destination: e.target.value }))}
          >
            <option value="">All Destinations</option>
            {destinations
              .sort((a, b) => destinationLabel(a).localeCompare(destinationLabel(b)))
              .map(d => (
                <option key={d.destination_id} value={d.destination_id}>
                  {destinationLabel(d)}
                </option>
              ))}
          </select>
        </label>

        <label className="flex flex-col text-xs gap-0.5">
          <span className="text-slate-400">Travel Type</span>
          <select
            className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-sky-500"
            value={filters.travelType}
            onChange={e => setFilters(f => ({ ...f, travelType: e.target.value }))}
          >
            <option value="">All Types</option>
            {TRAVEL_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </label>

        <div className="flex flex-col text-xs gap-0.5">
          <span className="text-slate-400">Period</span>
          <div className="flex rounded overflow-hidden border border-slate-600">
            {(['all', 'pre', 'post'] as const).map(p => (
              <button
                key={p}
                onClick={() => handlePeriod(p)}
                className={`px-3 py-1 text-sm capitalize transition-colors ${
                  filters.period === p
                    ? 'bg-sky-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {hasActiveFilters && (
          <button
            onClick={handleReset}
            className="ml-auto flex items-center gap-1 px-3 py-1.5 bg-red-600/80 hover:bg-red-600 text-white text-xs rounded transition-colors"
          >
            <span>Clear Filters</span>
          </button>
        )}
      </div>
    </div>
  )
}
