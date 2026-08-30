import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface HistoryPoint {
  date: string
  total_value: string
  total_cost: string
  total_pnl: string
  net_deposits: string
}

export function usePortfolioHistory(days = 90, accountId: number | null = null) {
  return useQuery<HistoryPoint[]>({
    queryKey: ['portfolio-history', days, accountId],
    queryFn: () =>
      api
        .get<HistoryPoint[]>('/holdings/history', {
          params: accountId != null ? { days, account_id: accountId } : { days },
        })
        .then((r) => r.data),
    staleTime: 300_000,
  })
}
