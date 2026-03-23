export default function Header() {
  return (
    <header className="h-14 flex-shrink-0 bg-white border-b border-slate-200 flex items-center justify-between px-6 shadow-sm">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold text-slate-800">Hospitality Intelligence Platform</h1>
        <span className="hidden sm:inline-flex px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700 uppercase tracking-wider">
          Demand Shock Analysis
        </span>
      </div>
      <p className="text-xs text-slate-400">2022 - 2026 Crisis Analytics</p>
    </header>
  )
}
