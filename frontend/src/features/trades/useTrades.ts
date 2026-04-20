import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { Trade, TradeCreate, TradeUpdate } from './types'

export function useTrades() {
  return useQuery<Trade[]>({
    queryKey: ['trades'],
    queryFn: () => api.get<Trade[]>('/trades').then((r) => r.data),
  })
}

export function useCreateTrade() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: TradeCreate) =>
      api.post<Trade>('/trades', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trades'] })
      toast.success('Trade added')
    },
  })
}

export function useUpdateTrade() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: TradeUpdate }) =>
      api.patch<Trade>(`/trades/${id}`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trades'] })
      toast.success('Trade updated')
    },
  })
}

export function useDeleteTrade() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.delete(`/trades/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trades'] })
      toast.success('Trade deleted')
    },
    onError: () => toast.error('Failed to delete trade'),
  })
}

export function useImportTrades() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData()
      form.append('file', file)
      return api.post<{ imported: number; errors: string[] }>(
        '/trades/import', form,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      ).then(r => r.data)
    },
    onSuccess: (data) => {
      toast.success(`Imported ${data.imported} trade${data.imported !== 1 ? 's' : ''}`)
      qc.invalidateQueries({ queryKey: ['trades'] })
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail
      if (detail?.errors?.length) {
        toast.error(`Import failed: ${detail.errors[0]}`)
      } else {
        toast.error('Import failed')
      }
    },
  })
}
