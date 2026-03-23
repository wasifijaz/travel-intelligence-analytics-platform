import { useState, useMemo } from 'react'
import { countryName } from '../utils/countryNames'

interface RiskEntry {
  destination_id: string
  travel_risk_index: number
  risk_tier: string
  risk_level?: string
}

interface RiskHeatmapProps {
  data: RiskEntry[]
}

function tierBadge(tier: string) {
  const t = String(tier || '').toLowerCase().replace(' risk', '').trim()
  if (t === 'low')
    return { bg: 'bg-emerald-100', text: 'text-emerald-700', ring: 'ring-emerald-200', label: 'Low' }
  if (t === 'medium')
    return { bg: 'bg-amber-100', text: 'text-amber-700', ring: 'ring-amber-200', label: 'Medium' }
  return { bg: 'bg-red-100', text: 'text-red-700', ring: 'ring-red-200', label: 'High' }
}

function riskBarColor(index: number): string {
  const scaled = index * 10
  if (scaled <= 3.3) return 'bg-emerald-500'
  if (scaled <= 6.6) return 'bg-amber-500'
  return 'bg-red-500'
}

function RiskRow({ entry }: { entry: RiskEntry }) {
  const badge = tierBadge(entry.risk_level || entry.risk_tier)
  return (
    <div className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-gray-50 transition-colors group">
      <span className="text-sm font-medium text-gray-800 w-40 truncate" title={countryName(entry.destination_id)}>
        {countryName(entry.destination_id)}
      </span>

      <span
        className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ring-1 ${badge.bg} ${badge.text} ${badge.ring} shrink-0`}
      >
        {badge.label}
      </span>

      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${riskBarColor(entry.travel_risk_index)}`}
          style={{ width: `${Math.min(100, entry.travel_risk_index * 100)}%` }}
        />
      </div>

      <span className="text-xs font-mono text-gray-500 tabular-nums w-12 text-right shrink-0">
        {(entry.travel_risk_index * 10).toFixed(1)}
      </span>
    </div>
  )
}

export default function RiskHeatmap({ data }: RiskHeatmapProps) {
  const [expanded, setExpanded] = useState(false)

  const sorted = useMemo(
    () => [...data].sort((a, b) => a.travel_risk_index - b.travel_risk_index),
    [data],
  )

  if (!data.length) return null

  const lowest10 = sorted.slice(0, 10)
  const highest10 = [...sorted].reverse().slice(0, 10)
  const allSorted = sorted

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-lg font-semibold text-gray-900">Travel Risk Index</h3>
        <span className="text-xs text-gray-400">{data.length} destinations</span>
      </div>

      {!expanded ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Lowest risk */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <h4 className="text-sm font-semibold text-emerald-700">Top 10 Lowest Risk</h4>
            </div>
            <div className="border border-emerald-100 rounded-xl divide-y divide-emerald-50 overflow-hidden">
              {lowest10.map((entry) => (
                <RiskRow key={entry.destination_id} entry={entry} />
              ))}
            </div>
          </div>

          {/* Highest risk */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              <h4 className="text-sm font-semibold text-red-700">Top 10 Highest Risk</h4>
            </div>
            <div className="border border-red-100 rounded-xl divide-y divide-red-50 overflow-hidden">
              {highest10.map((entry) => (
                <RiskRow key={entry.destination_id} entry={entry} />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <h4 className="text-sm font-semibold text-gray-700">All Destinations — Sorted by Risk Index</h4>
          </div>
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="flex items-center gap-3 py-2 px-3 bg-gray-50 border-b border-gray-200 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              <span className="w-40">Destination</span>
              <span className="w-16">Tier</span>
              <span className="flex-1">Risk Level</span>
              <span className="w-12 text-right">Score</span>
            </div>
            <div className="max-h-[480px] overflow-y-auto divide-y divide-gray-50">
              {allSorted.map((entry) => (
                <RiskRow key={entry.destination_id} entry={entry} />
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 flex justify-center">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-4 py-2 rounded-lg transition-colors"
        >
          {expanded ? 'Show Top & Bottom 10' : `Show All ${data.length} Destinations`}
        </button>
      </div>
    </div>
  )
}
