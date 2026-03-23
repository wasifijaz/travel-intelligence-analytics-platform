interface Action {
  title: string
  description: string
  priority: 'high' | 'medium' | 'low'
}

interface ActionPanelProps {
  actions: Action[]
}

const priorityStyles: Record<Action['priority'], { badge: string; border: string; label: string }> = {
  high: {
    badge: 'bg-red-100 text-red-700 border-red-200',
    border: 'border-l-red-500',
    label: 'High',
  },
  medium: {
    badge: 'bg-amber-100 text-amber-700 border-amber-200',
    border: 'border-l-amber-500',
    label: 'Medium',
  },
  low: {
    badge: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    border: 'border-l-emerald-500',
    label: 'Low',
  },
}

export default function ActionPanel({ actions }: ActionPanelProps) {
  if (!actions.length) return null

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Recommended Actions</h3>
      <div className="space-y-3">
        {actions.map((action, i) => {
          const style = priorityStyles[action.priority]
          return (
            <div
              key={i}
              className={`border-l-4 ${style.border} bg-gray-50 rounded-r-lg p-4`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium text-gray-900 text-sm">{action.title}</span>
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full border ${style.badge}`}
                >
                  {style.label}
                </span>
              </div>
              <p className="text-sm text-gray-600 leading-relaxed">{action.description}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
