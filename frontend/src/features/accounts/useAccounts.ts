import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface Account {
  id: number
  name: string
  type: string
}

export function useAccounts() {
  return useQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: () => api.get<Account[]>('/accounts').then((r) => r.data),
  })
}
