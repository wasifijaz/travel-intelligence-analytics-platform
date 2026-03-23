import { useMemo } from 'react'
import { useFilters } from '../context/FilterContext'
import type { FilterParams } from '../services/api'

export function useFilterParams(): FilterParams {
  const { filters } = useFilters()
  return useMemo(() => {
    const params: FilterParams = {}
    if (filters.dateFrom) params.date_from = filters.dateFrom
    if (filters.dateTo) params.date_to = filters.dateTo
    if (filters.destination) params.destination = filters.destination
    if (filters.crisisEvent?.crisis_id) params.crisis_id = filters.crisisEvent.crisis_id
    if (filters.sourceMarket) params.source_market = filters.sourceMarket
    if (filters.travelType) params.travel_type = filters.travelType
    return params
  }, [filters.dateFrom, filters.dateTo, filters.destination, filters.crisisEvent, filters.sourceMarket, filters.travelType])
}
