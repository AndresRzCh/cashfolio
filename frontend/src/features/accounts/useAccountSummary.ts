import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { AccountSummaryRow } from './types'

export function useAccountSummary() {
  return useQuery<AccountSummaryRow[]>({
    queryKey: ['account-summary'],
    queryFn: () => api.get<AccountSummaryRow[]>('/accounts/summary').then((r) => r.data),
    staleTime: 60_000,
  })
}
