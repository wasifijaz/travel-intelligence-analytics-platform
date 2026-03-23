import { useState, useMemo } from 'react'
import { countryName } from '../utils/countryNames'

interface CorridorRow {
  source: string
  bookings_pre: number
  bookings_post: number
  change_pct: number
  search_pre?: number
  search_post?: number
  adr_pre?: number
  adr_post?: number
}

interface CorridorMatrixProps {
  data: CorridorRow[]
}

type SortKey = 'source' | 'bookings_pre' | 'bookings_post' | 'change_pct' | 'search_pre' | 'search_post' | 'adr_pre' | 'adr_post'

function changeBg(pct: number): string {
  if (pct >= 20) return 'bg-emerald-200/70 text-emerald-900'
  if (pct > 0) return 'bg-emerald-50 text-emerald-800'
  if (pct === 0) return 'bg-gray-50 text-gray-700'
  if (pct > -20) return 'bg-red-50 text-red-800'
  return 'bg-red-200/70 text-red-900'
}

function changeCell(pct: number): string {
  const abs = Math.abs(pct)
  if (pct > 0) {
    const intensity = Math.min(abs / 50, 1)
    return `rgba(16,185,129,${(intensity * 0.25).toFixed(2)})`
  }
  if (pct < 0) {
    const intensity = Math.min(abs / 50, 1)
    return `rgba(239,68,68,${(intensity * 0.25).toFixed(2)})`
  }
  return 'transparent'
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`
  return n.toLocaleString()
}

export default function CorridorMatrix({ data }: CorridorMatrixProps) {
  const [sortKey, setSortKey] = useState<SortKey>('change_pct')
  const [sortAsc, setSortAsc] = useState(false)

  const hasSearch = data.some((r) => r.search_pre !== undefined && r.search_pre !== 0)
  const hasAdr = data.some((r) => r.adr_pre !== undefined && r.adr_pre !== 0)

  const sorted = useMemo(() => {
    const copy = [...data]
    copy.sort((a, b) => {
      let av: number | string = 0
      let bv: number | string = 0

      if (sortKey === 'source') {
        av = countryName(a.source)
        bv = countryName(b.source)
        return sortAsc
          ? (av as string).localeCompare(bv as string)
          : (bv as string).localeCompare(av as string)
      }

      av = (a as unknown as Record<string, number>)[sortKey] ?? 0
      bv = (b as unknown as Record<string, number>)[sortKey] ?? 0
      return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number)
    })
    return copy
  }, [data, sortKey, sortAsc])

  if (!data.length) return null

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc)
    } else {
      setSortKey(key)
      setSortAsc(false)
    }
  }

  const arrow = (key: SortKey) => {
    if (sortKey !== key) return <span className="text-gray-300 ml-1">&#8597;</span>
    return <span className="ml-1">{sortAsc ? '\u25B2' : '\u25BC'}</span>
  }

  const thClass = 'py-2.5 px-3 font-semibold text-gray-500 cursor-pointer hover:text-gray-800 select-none transition-colors text-xs uppercase tracking-wider whitespace-nowrap'

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 overflow-x-auto">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Corridor Performance</h3>
        <span className="text-xs text-gray-400">{data.length} corridors</span>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-gray-200">
            <th className={`${thClass} text-left`} onClick={() => handleSort('source')}>
              Destination {arrow('source')}
            </th>
            <th className={`${thClass} text-right`} onClick={() => handleSort('bookings_pre')}>
              Bookings Pre {arrow('bookings_pre')}
            </th>
            <th className={`${thClass} text-right`} onClick={() => handleSort('bookings_post')}>
              Bookings Post {arrow('bookings_post')}
            </th>
            {hasSearch && (
              <>
                <th className={`${thClass} text-right`} onClick={() => handleSort('search_pre')}>
                  Searches Pre {arrow('search_pre')}
                </th>
                <th className={`${thClass} text-right`} onClick={() => handleSort('search_post')}>
                  Searches Post {arrow('search_post')}
                </th>
              </>
            )}
            {hasAdr && (
              <>
                <th className={`${thClass} text-right`} onClick={() => handleSort('adr_pre')}>
                  ADR Pre {arrow('adr_pre')}
                </th>
                <th className={`${thClass} text-right`} onClick={() => handleSort('adr_post')}>
                  ADR Post {arrow('adr_post')}
                </th>
              </>
            )}
            <th className={`${thClass} text-right`} onClick={() => handleSort('change_pct')}>
              Change {arrow('change_pct')}
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const searchChange =
              hasSearch && row.search_pre && row.search_pre > 0
                ? ((((row.search_post ?? 0) - row.search_pre) / row.search_pre) * 100)
                : null

            return (
              <tr
                key={row.source}
                className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors"
              >
                <td className="py-2.5 px-3 font-medium text-gray-800">
                  {countryName(row.source)}
                  <span className="text-[10px] text-gray-400 ml-1.5">{row.source}</span>
                </td>
                <td className="py-2.5 px-3 text-right text-gray-600 tabular-nums">
                  {fmt(row.bookings_pre)}
                </td>
                <td className="py-2.5 px-3 text-right text-gray-600 tabular-nums">
                  {fmt(row.bookings_post)}
                </td>
                {hasSearch && (
                  <>
                    <td className="py-2.5 px-3 text-right text-gray-600 tabular-nums">
                      {fmt(row.search_pre ?? 0)}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums">
                      <span className="text-gray-600">{fmt(row.search_post ?? 0)}</span>
                      {searchChange !== null && (
                        <span
                          className={`ml-1.5 text-[10px] font-medium ${searchChange >= 0 ? 'text-emerald-600' : 'text-red-500'}`}
                        >
                          {searchChange >= 0 ? '+' : ''}{searchChange.toFixed(0)}%
                        </span>
                      )}
                    </td>
                  </>
                )}
                {hasAdr && (
                  <>
                    <td className="py-2.5 px-3 text-right text-gray-600 tabular-nums">
                      ${(row.adr_pre ?? 0).toFixed(0)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-gray-600 tabular-nums">
                      ${(row.adr_post ?? 0).toFixed(0)}
                    </td>
                  </>
                )}
                <td className="py-2.5 px-3 text-right">
                  <span
                    className={`inline-block px-2.5 py-0.5 rounded-md text-xs font-semibold tabular-nums ${changeBg(row.change_pct)}`}
                    style={{ backgroundColor: changeCell(row.change_pct) }}
                  >
                    {row.change_pct > 0 ? '+' : ''}{row.change_pct.toFixed(1)}%
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
