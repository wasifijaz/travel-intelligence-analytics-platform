import { NavLink } from 'react-router-dom'

const sections = [
  {
    title: 'Dashboards',
    items: [
      { to: '/', label: 'Executive Overview' },
      { to: '/global-crisis', label: 'Global Crisis & Forecast' },
      { to: '/hotel-chains', label: 'Hotel Chains' },
      { to: '/ota', label: 'OTA Dashboard' },
      { to: '/tmc-dmc', label: 'DMC & TMC' },
      { to: '/travel-tech', label: 'Travel Tech' },
      { to: '/market-intel', label: 'Market Intelligence' },
      { to: '/travel-demand-intelligence', label: 'Travel Demand Intelligence' },
    ],
  },
  {
    title: 'Analysis',
    items: [
      { to: '/stock-analysis', label: 'Stock Market Analysis' },
    ],
  },
  {
    title: 'Data',
    items: [
      { to: '/metrics', label: 'Raw Metrics' },
    ],
  },
]

export default function Sidebar() {
  return (
    <aside className="w-60 flex-shrink-0 bg-slate-900 border-r border-slate-700/50 flex flex-col">
      <div className="p-5 border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold text-sm">TI</span>
          <div>
            <p className="text-white font-semibold text-sm leading-tight">Travel Intelligence</p>
            <p className="text-slate-500 text-[10px] uppercase tracking-wider">Analytics Platform</p>
          </div>
        </div>
      </div>
      <nav className="p-3 flex-1 overflow-y-auto">
        {sections.map((section) => (
          <div key={section.title} className="mb-4">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-3 py-2">
              {section.title}
            </p>
            <ul className="space-y-0.5">
              {section.items.map(({ to, label }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={to === '/'}
                    className={({ isActive }) =>
                      `flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                        isActive
                          ? 'bg-blue-500/15 text-blue-300 shadow-sm'
                          : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                      }`
                    }
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="p-3 border-t border-slate-700/50">
        <p className="text-[10px] text-slate-600 text-center">v2.0 — Demand Shock Analytics</p>
      </div>
    </aside>
  )
}
