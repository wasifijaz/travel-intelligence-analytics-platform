import { useState, useMemo } from 'react'

interface Field {
  name: string
  label: string
  defaultValue: number
  min: number
  max: number
  step: number
}

interface RevenueCalculatorProps {
  fields: Field[]
  formula: (values: Record<string, number>) => number
  resultLabel: string
}

export default function RevenueCalculator({ fields, formula, resultLabel }: RevenueCalculatorProps) {
  const [values, setValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(fields.map((f) => [f.name, f.defaultValue]))
  )

  const result = useMemo(() => formula(values), [values, formula])

  const updateValue = (name: string, val: number) => {
    setValues((prev) => ({ ...prev, [name]: val }))
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-5">Revenue Calculator</h3>

      <div className="space-y-5">
        {fields.map((field) => (
          <div key={field.name}>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium text-gray-700">{field.label}</label>
              <input
                type="number"
                value={values[field.name]}
                min={field.min}
                max={field.max}
                step={field.step}
                onChange={(e) => updateValue(field.name, Number(e.target.value))}
                className="w-24 text-right text-sm font-mono border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <input
              type="range"
              value={values[field.name]}
              min={field.min}
              max={field.max}
              step={field.step}
              onChange={(e) => updateValue(field.name, Number(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-0.5">
              <span>{field.min.toLocaleString()}</span>
              <span>{field.max.toLocaleString()}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 pt-5 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-600">{resultLabel}</span>
          <span className="text-2xl font-bold text-blue-700">
            {result.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </span>
        </div>
      </div>
    </div>
  )
}
