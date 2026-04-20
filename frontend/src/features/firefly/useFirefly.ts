import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { FireflyAccount, FireflyConfig, FireflySyncResult } from './types'

export function useFireflyConfig() {
  return useQuery<FireflyConfig | null>({
    queryKey: ['firefly-config'],
    queryFn: async () => {
      try {
        const r = await api.get<FireflyConfig>('/firefly/config')
        return r.data
      } catch (err: unknown) {
        if ((err as { response?: { status?: number } })?.response?.status === 404) return null
        throw err
      }
    },
  })
}

export function useSaveFireflyConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { url: string; api_token: string }) =>
      api.put<FireflyConfig>('/firefly/config', body).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['firefly-config'] })
      toast.success('Firefly III config saved')
    },
    onError: () => toast.error('Failed to save Firefly III config'),
  })
}

export function useDeleteFireflyConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.delete('/firefly/config'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['firefly-config'] })
      qc.invalidateQueries({ queryKey: ['firefly-accounts'] })
      toast.success('Firefly III disconnected')
    },
    onError: () => toast.error('Failed to disconnect Firefly III'),
  })
}

export function useSyncFirefly() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      api.post<FireflySyncResult>('/firefly/sync').then((r) => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['firefly-accounts'] })
      qc.invalidateQueries({ queryKey: ['firefly-config'] })
      toast.success(data.message)
    },
    onError: (err: { response?: { data?: { detail?: string } } }) =>
      toast.error(err?.response?.data?.detail ?? 'Sync failed'),
  })
}

export function useFireflyAccounts() {
  return useQuery<FireflyAccount[]>({
    queryKey: ['firefly-accounts'],
    queryFn: () => api.get<FireflyAccount[]>('/firefly/accounts').then((r) => r.data),
  })
}
