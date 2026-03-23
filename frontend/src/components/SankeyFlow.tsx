import { useMemo, useState } from 'react'
import { countryName } from '../utils/countryNames'

interface Flow {
  source: string
  target: string
  value: number
}

interface SankeyFlowProps {
  flows: Flow[]
  maxFlows?: number
}

interface LayoutNode {
  id: string
  label: string
  x: number
  y: number
  height: number
  total: number
}

interface LayoutLink {
  source: string
  target: string
  value: number
  sourceY: number
  targetY: number
  thickness: number
  gradientId: string
}

const SVG_WIDTH = 900
const SVG_HEIGHT = 500
const NODE_WIDTH = 18
const NODE_PAD = 8
const MARGIN = { top: 50, right: 160, bottom: 40, left: 160 }

const SOURCE_COLORS = {
  fill: '#ef4444',
  light: '#fca5a5',
  stroke: '#dc2626',
}
const TARGET_COLORS = {
  fill: '#10b981',
  light: '#6ee7b7',
  stroke: '#059669',
}

function buildLayout(flows: Flow[]) {
  const sourceMap = new Map<string, number>()
  const targetMap = new Map<string, number>()

  for (const f of flows) {
    sourceMap.set(f.source, (sourceMap.get(f.source) || 0) + f.value)
    targetMap.set(f.target, (targetMap.get(f.target) || 0) + f.value)
  }

  const sources = [...sourceMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, total]) => ({ id, total }))
  const targets = [...targetMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, total]) => ({ id, total }))

  const usableHeight = SVG_HEIGHT - MARGIN.top - MARGIN.bottom
  const sourceTotal = sources.reduce((s, n) => s + n.total, 0)
  const targetTotal = targets.reduce((s, n) => s + n.total, 0)

  const sourcePadTotal = Math.max(0, (sources.length - 1) * NODE_PAD)
  const targetPadTotal = Math.max(0, (targets.length - 1) * NODE_PAD)
  const sourceScale = (usableHeight - sourcePadTotal) / (sourceTotal || 1)
  const targetScale = (usableHeight - targetPadTotal) / (targetTotal || 1)

  const sourceNodes: LayoutNode[] = []
  let sy = MARGIN.top
  for (const s of sources) {
    const h = Math.max(4, s.total * sourceScale)
    sourceNodes.push({
      id: s.id,
      label: countryName(s.id),
      x: MARGIN.left,
      y: sy,
      height: h,
      total: s.total,
    })
    sy += h + NODE_PAD
  }

  const targetNodes: LayoutNode[] = []
  let ty = MARGIN.top
  for (const t of targets) {
    const h = Math.max(4, t.total * targetScale)
    targetNodes.push({
      id: t.id,
      label: countryName(t.id),
      x: SVG_WIDTH - MARGIN.right,
      y: ty,
      height: h,
      total: t.total,
    })
    ty += h + NODE_PAD
  }

  const sourceOffsets = new Map<string, number>()
  const targetOffsets = new Map<string, number>()
  for (const n of sourceNodes) sourceOffsets.set(n.id, n.y)
  for (const n of targetNodes) targetOffsets.set(n.id, n.y)

  const maxVal = Math.max(...flows.map(f => f.value), 1)

  const links: LayoutLink[] = flows.map((f, i) => {
    const thickness = Math.max(2, (f.value / maxVal) * 40)

    const sY = sourceOffsets.get(f.source)!
    const tY = targetOffsets.get(f.target)!

    sourceOffsets.set(f.source, sY + thickness + 1)
    targetOffsets.set(f.target, tY + thickness + 1)

    return {
      source: f.source,
      target: f.target,
      value: f.value,
      sourceY: sY + thickness / 2,
      targetY: tY + thickness / 2,
      thickness,
      gradientId: `flow-grad-${i}`,
    }
  })

  return { sourceNodes, targetNodes, links }
}

function flowPath(link: LayoutLink): string {
  const x0 = MARGIN.left + NODE_WIDTH
  const x1 = SVG_WIDTH - MARGIN.right
  const mx = (x0 + x1) / 2
  return `M ${x0},${link.sourceY} C ${mx},${link.sourceY} ${mx},${link.targetY} ${x1},${link.targetY}`
}

export default function SankeyFlow({ flows, maxFlows = 12 }: SankeyFlowProps) {
  const [hovered, setHovered] = useState<number | null>(null)
  const [tooltip, setTooltip] = useState<{
    x: number
    y: number
    text: string
  } | null>(null)

  const trimmedFlows = useMemo(
    () =>
      [...flows]
        .sort((a, b) => b.value - a.value)
        .slice(0, maxFlows),
    [flows, maxFlows],
  )

  const layout = useMemo(() => buildLayout(trimmedFlows), [trimmedFlows])

  if (!flows.length) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
        No demand shift data available
      </div>
    )
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wider">
            Demand Shift Flow
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            How travelers redirected between destinations
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-red-500" />
            Losing destinations
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-emerald-500" />
            Gaining destinations
          </span>
        </div>
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          className="w-full h-auto"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            {layout.links.map((link) => (
              <linearGradient
                key={link.gradientId}
                id={link.gradientId}
                x1="0%"
                y1="0%"
                x2="100%"
                y2="0%"
              >
                <stop offset="0%" stopColor={SOURCE_COLORS.fill} stopOpacity={0.6} />
                <stop offset="100%" stopColor={TARGET_COLORS.fill} stopOpacity={0.6} />
              </linearGradient>
            ))}
          </defs>

          {/* Flow bands */}
          {layout.links.map((link, i) => (
            <path
              key={i}
              d={flowPath(link)}
              fill="none"
              stroke={`url(#${link.gradientId})`}
              strokeWidth={link.thickness}
              strokeLinecap="round"
              opacity={hovered === null ? 0.55 : hovered === i ? 0.9 : 0.15}
              className="transition-opacity duration-200 cursor-pointer"
              onMouseEnter={e => {
                setHovered(i)
                const svgRect = (e.target as SVGPathElement)
                  .ownerSVGElement!.getBoundingClientRect()
                setTooltip({
                  x: e.clientX - svgRect.left,
                  y: e.clientY - svgRect.top - 12,
                  text: `${countryName(link.source)} → ${countryName(link.target)}: ${link.value.toLocaleString()} bookings shifted`,
                })
              }}
              onMouseMove={e => {
                const svgRect = (e.target as SVGPathElement)
                  .ownerSVGElement!.getBoundingClientRect()
                setTooltip(prev =>
                  prev
                    ? {
                        ...prev,
                        x: e.clientX - svgRect.left,
                        y: e.clientY - svgRect.top - 12,
                      }
                    : null,
                )
              }}
              onMouseLeave={() => {
                setHovered(null)
                setTooltip(null)
              }}
            />
          ))}

          {/* Source nodes */}
          {layout.sourceNodes.map(node => (
            <g key={`s-${node.id}`}>
              <rect
                x={node.x}
                y={node.y}
                width={NODE_WIDTH}
                height={node.height}
                rx={3}
                fill={SOURCE_COLORS.fill}
                stroke={SOURCE_COLORS.stroke}
                strokeWidth={1}
                opacity={0.85}
              />
              <text
                x={node.x - 6}
                y={node.y + node.height / 2}
                textAnchor="end"
                dominantBaseline="central"
                className="text-[11px] fill-slate-600 font-medium"
              >
                {node.label}
              </text>
              <text
                x={node.x - 6}
                y={node.y + node.height / 2 + 13}
                textAnchor="end"
                dominantBaseline="central"
                className="text-[9px] fill-slate-400"
              >
                {node.total.toLocaleString()}
              </text>
            </g>
          ))}

          {/* Target nodes */}
          {layout.targetNodes.map(node => (
            <g key={`t-${node.id}`}>
              <rect
                x={node.x}
                y={node.y}
                width={NODE_WIDTH}
                height={node.height}
                rx={3}
                fill={TARGET_COLORS.fill}
                stroke={TARGET_COLORS.stroke}
                strokeWidth={1}
                opacity={0.85}
              />
              <text
                x={node.x + NODE_WIDTH + 6}
                y={node.y + node.height / 2}
                textAnchor="start"
                dominantBaseline="central"
                className="text-[11px] fill-slate-600 font-medium"
              >
                {node.label}
              </text>
              <text
                x={node.x + NODE_WIDTH + 6}
                y={node.y + node.height / 2 + 13}
                textAnchor="start"
                dominantBaseline="central"
                className="text-[9px] fill-slate-400"
              >
                {node.total.toLocaleString()}
              </text>
            </g>
          ))}

          {/* Column headers */}
          <text
            x={MARGIN.left + NODE_WIDTH / 2}
            y={MARGIN.top - 18}
            textAnchor="middle"
            className="text-[12px] fill-red-600 font-semibold uppercase tracking-wide"
          >
            Sources (losing)
          </text>
          <text
            x={SVG_WIDTH - MARGIN.right + NODE_WIDTH / 2}
            y={MARGIN.top - 18}
            textAnchor="middle"
            className="text-[12px] fill-emerald-600 font-semibold uppercase tracking-wide"
          >
            Targets (gaining)
          </text>
        </svg>

        {/* Tooltip overlay */}
        {tooltip && (
          <div
            className="absolute pointer-events-none z-20 bg-slate-800 text-white text-xs rounded-md px-3 py-1.5 shadow-lg whitespace-nowrap -translate-x-1/2 -translate-y-full"
            style={{ left: tooltip.x, top: tooltip.y }}
          >
            {tooltip.text}
          </div>
        )}
      </div>
    </div>
  )
}
