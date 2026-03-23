import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { fetchCrisisEvents, type CrisisEvent } from '../services/api'

interface Filters {
  dateFrom: string
  dateTo: string
  crisisEvent: CrisisEvent | null
  destination: string
  sourceMarket: string
  travelType: string
  period: 'all' | 'pre' | 'post'
}

interface FilterContextType {
  filters: Filters
  setFilters: React.Dispatch<React.SetStateAction<Filters>>
  crisisEvents: CrisisEvent[]
  latestMiddleEastCrisis: CrisisEvent | null
}

const defaultFilters: Filters = {
  dateFrom: '',
  dateTo: '',
  crisisEvent: null,
  destination: '',
  sourceMarket: '',
  travelType: '',
  period: 'all',
}

const FilterContext = createContext<FilterContextType>({
  filters: defaultFilters,
  setFilters: () => {},
  crisisEvents: [],
  latestMiddleEastCrisis: null,
})

export function FilterProvider({ children }: { children: ReactNode }) {
  const [crisisEvents, setCrisisEvents] = useState<CrisisEvent[]>([])
  const [filters, setFilters] = useState<Filters>(defaultFilters)

  const latestMiddleEastCrisis = crisisEvents
    .filter(e => {
      const name = (e.crisis_name || '').toLowerCase()
      const regions = (e.affected_regions || '').toLowerCase()
      return name.includes('middle east') || name.includes('israel') || name.includes('iran')
        || regions.includes('middle east') || regions.includes('israel')
    })
    .sort((a, b) => (b.crisis_start_date || '').localeCompare(a.crisis_start_date || ''))
    [0] || null

  useEffect(() => {
    fetchCrisisEvents().then(r => setCrisisEvents(r.data || [])).catch(() => {})
  }, [])

  return (
    <FilterContext.Provider value={{ filters, setFilters, crisisEvents, latestMiddleEastCrisis }}>
      {children}
    </FilterContext.Provider>
  )
}

export function useFilters() { return useContext(FilterContext) }
export default FilterContext
