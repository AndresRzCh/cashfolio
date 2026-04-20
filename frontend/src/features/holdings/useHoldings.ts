import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { PortfolioSummary } from './types'

export function useHoldings() {
  return useQuery<PortfolioSummary>({
    queryKey: ['holdings'],
    queryFn: () => api.get<PortfolioSummary>('/holdings').then((r) => r.data),
    staleTime: 60_000,
  })
}
