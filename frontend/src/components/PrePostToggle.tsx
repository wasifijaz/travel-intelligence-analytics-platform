type Period = 'all' | 'pre' | 'post'

interface PrePostToggleProps {
  value: Period
  onChange: (v: Period) => void
  crisisDate?: string
}

const options: { key: Period; label: string }[] = [
  { key: 'all', label: 'All Data' },
  { key: 'pre', label: 'Pre-Crisis' },
  { key: 'post', label: 'Post-Crisis' },
]

export default function PrePostToggle({ value, onChange, crisisDate }: PrePostToggleProps) {
  return (
    <div className="inline-flex flex-col gap-1.5">
      <div className="inline-flex rounded-lg bg-gray-100 p-1">
        {options.map((opt) => {
          const active = value === opt.key
          return (
            <button
              key={opt.key}
              onClick={() => onChange(opt.key)}
              className={`
                px-4 py-2 text-sm font-medium rounded-md transition-all
                ${active
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'}
              `}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
      {crisisDate && (
        <span className="text-xs text-gray-400 text-center">
          Crisis date: {crisisDate}
        </span>
      )}
    </div>
  )
}
