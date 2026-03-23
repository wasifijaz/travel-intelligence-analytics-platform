import { ReactNode } from 'react'

interface FiltersPanelProps {
  children: ReactNode
  title?: string
}

export default function FiltersPanel({ children, title = 'Filters' }: FiltersPanelProps) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card p-4 mb-6">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">{title}</p>
      <div className="flex flex-wrap gap-4 items-end">{children}</div>
    </div>
  )
}
