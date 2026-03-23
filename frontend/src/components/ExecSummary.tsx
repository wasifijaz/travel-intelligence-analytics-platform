interface ExecSummaryProps {
  insights: string[]
}

export default function ExecSummary({ insights }: ExecSummaryProps) {
  if (!insights.length) return null

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
      <h3 className="text-lg font-semibold text-blue-900 mb-4">Executive Summary</h3>
      <ul className="space-y-2">
        {insights.map((insight, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-blue-800 leading-relaxed">
            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-blue-500 flex-shrink-0" />
            {insight}
          </li>
        ))}
      </ul>
    </div>
  )
}
