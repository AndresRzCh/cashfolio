import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface HistoryPoint {
  date: string
  total_value: string
  total_cost: string
  total_pnl: string
}

export function usePortfolioHistory(days = 90) {
  return useQuery<HistoryPoint[]>({
    queryKey: ['portfolio-history', days],
    queryFn: () =>
      api.get<HistoryPoint[]>('/holdings/history', { params: { days } }).then((r) => r.data),
    staleTime: 300_000,
  })
}
