import { useState } from 'react'

interface KpiCardProps {
  title: string
  value: string | number
  change?: number
  subtitle?: string
  icon?: string
  tooltip?: string
}

export default function KpiCard({ title, value, change, subtitle, icon, tooltip }: KpiCardProps) {
  const [showTooltip, setShowTooltip] = useState(false)
  const isPositive = change !== undefined && change >= 0
  const changeColor = isPositive ? 'text-emerald-600' : 'text-red-600'
  const arrow = isPositive ? '\u25B2' : '\u25BC'

  return (
    <div
      className="relative bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex flex-col gap-2 hover:shadow-md transition-shadow"
      onMouseEnter={() => tooltip && setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {showTooltip && tooltip && (
        <div className="absolute z-30 left-1/2 -translate-x-1/2 bottom-full mb-2 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg max-w-xs whitespace-normal pointer-events-none">
          {tooltip}
          <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-gray-900" />
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-500 uppercase tracking-wide">
          {title}
        </span>
        {icon && (
          <span className="text-lg text-gray-400">{icon}</span>
        )}
      </div>

      <div className="text-2xl font-bold text-gray-900">{value}</div>

      {change !== undefined && (
        <div className={`flex items-center gap-1 text-sm font-medium ${changeColor}`}>
          <span>{arrow}</span>
          <span>{Math.abs(change).toFixed(1)}%</span>
        </div>
      )}

      {subtitle && (
        <span className="text-xs text-gray-400">{subtitle}</span>
      )}
    </div>
  )
}
