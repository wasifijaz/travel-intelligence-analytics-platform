import { useState } from 'react'

interface Stage {
  name: string
  value: number
}

interface DemandFunnelProps {
  stages: Stage[]
}

const STAGE_COLORS = [
  { bar: '#3B82F6', bg: 'rgba(59,130,246,0.08)' },
  { bar: '#2563EB', bg: 'rgba(37,99,235,0.08)' },
  { bar: '#1D4ED8', bg: 'rgba(29,78,216,0.08)' },
  { bar: '#1E40AF', bg: 'rgba(30,64,175,0.08)' },
]

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`
  return n.toLocaleString()
}

const STAGE_TOOLTIPS: Record<string, string> = {
  'Search Volume': 'Total accommodation searches across all channels',
  'Prebooks': 'Pre-booking holds and intent signals before confirmation',
  'Room Night Bookings': 'Confirmed room night bookings',
  'Cancellations': 'Cancelled reservations across all channels',
}

export default function DemandFunnel({ stages }: DemandFunnelProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  if (!stages.length) return null

  const maxWidth = 100
  const minWidth = 28
  const count = stages.length
  const widths = stages.map((_, i) =>
    count === 1 ? maxWidth : maxWidth - ((maxWidth - minWidth) / (count - 1)) * i,
  )

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-6">Demand Funnel</h3>

      <div className="flex flex-col items-center gap-0">
        {stages.map((stage, i) => {
          const widthPct = widths[i]
          const nextWidthPct = i < count - 1 ? widths[i + 1] : widthPct - 6
          const prevValue = i > 0 ? stages[i - 1].value : null
          const conversionRate = prevValue && prevValue > 0
            ? ((stage.value / prevValue) * 100).toFixed(1)
            : null
          const dropOff = prevValue && prevValue > 0
            ? (((prevValue - stage.value) / prevValue) * 100).toFixed(1)
            : null
          const color = STAGE_COLORS[i % STAGE_COLORS.length]

          const topLeft = ((100 - widthPct) / 2)
          const topRight = topLeft + widthPct
          const botLeft = ((100 - nextWidthPct) / 2)
          const botRight = botLeft + nextWidthPct

          const clipPath = `polygon(${topLeft}% 0%, ${topRight}% 0%, ${botRight}% 100%, ${botLeft}% 100%)`

          return (
            <div key={stage.name} className="w-full flex flex-col items-center">
              {conversionRate && (
                <div className="flex items-center gap-3 mb-1 mt-0.5">
                  <span className="text-[11px] font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                    {conversionRate}% conversion
                  </span>
                  {dropOff && (
                    <span className="text-[11px] font-medium text-gray-400">
                      {dropOff}% drop-off
                    </span>
                  )}
                </div>
              )}

              <div
                className="relative w-full max-w-full group px-1"
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
              >
                <div
                  className="relative mx-auto transition-all duration-200 min-h-[56px]"
                  style={{
                    width: '100%',
                    minHeight: '56px',
                    clipPath,
                    background: `linear-gradient(180deg, ${color.bar} 0%, ${color.bar}dd 100%)`,
                    opacity: hoveredIdx !== null && hoveredIdx !== i ? 0.7 : 1,
                  }}
                >
                  <div
                    className="absolute inset-0 flex flex-col items-center justify-center text-center gap-0.5 px-[10%] py-1.5 box-border"
                    style={{ clipPath }}
                  >
                    <span className="text-white text-xs sm:text-sm font-semibold drop-shadow-sm leading-tight break-words max-w-[95%] text-center">
                      {stage.name}
                    </span>
                    <span className="text-white text-xs sm:text-sm font-bold tabular-nums drop-shadow-sm shrink-0">
                      {fmt(stage.value)}
                    </span>
                  </div>
                </div>

                {hoveredIdx === i && (
                  <div className="absolute left-1/2 -translate-x-1/2 -top-12 z-20 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg whitespace-nowrap pointer-events-none">
                    <div className="font-semibold">{stage.name}: {stage.value.toLocaleString()}</div>
                    <div className="text-gray-300">
                      {STAGE_TOOLTIPS[stage.name] || `Stage ${i + 1} of the demand funnel`}
                    </div>
                    <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-gray-900" />
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-4 pt-3 border-t border-gray-100 flex justify-between text-[11px] text-gray-400">
        <span>Top of funnel: {fmt(stages[0]?.value ?? 0)}</span>
        <span>Bottom: {fmt(stages[stages.length - 1]?.value ?? 0)}</span>
        {stages.length >= 2 && (
          <span>
            Overall: {((stages[stages.length - 1].value / stages[0].value) * 100).toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  )
}
