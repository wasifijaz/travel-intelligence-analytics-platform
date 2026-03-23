import { ReactNode } from 'react'

interface ChartCardProps {
  title: string
  subtitle?: string
  children: ReactNode
  className?: string
}

export default function ChartCard({ title, subtitle, children, className = '' }: ChartCardProps) {
  return (
    <div className={`bg-white rounded-xl border border-slate-200 shadow-card p-5 ${className}`}>
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wider">{title}</h3>
        {subtitle && (
          <p className="text-xs text-slate-400 mt-1">{subtitle}</p>
        )}
      </div>
      <div className="min-h-[280px] flex flex-col">
        {children}
      </div>
    </div>
  )
}
