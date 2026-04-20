import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { Transfer, TransferCreate, TransferUpdate } from './types'

export function useTransfers() {
  return useQuery<Transfer[]>({
    queryKey: ['transfers'],
    queryFn: () => api.get<Transfer[]>('/transfers').then((r) => r.data),
  })
}

export function useCreateTransfer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: TransferCreate) =>
      api.post<Transfer>('/transfers', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transfers'] })
      toast.success('Transfer added')
    },
  })
}

export function useUpdateTransfer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: TransferUpdate }) =>
      api.patch<Transfer>(`/transfers/${id}`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transfers'] })
      toast.success('Transfer updated')
    },
  })
}

export function useDeleteTransfer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.delete(`/transfers/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transfers'] })
      toast.success('Transfer deleted')
    },
    onError: () => toast.error('Failed to delete transfer'),
  })
}

export function useImportTransfers() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData()
      form.append('file', file)
      return api.post<{ imported: number; errors: string[] }>(
        '/transfers/import', form,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      ).then(r => r.data)
    },
    onSuccess: (data) => {
      toast.success(`Imported ${data.imported} transfer${data.imported !== 1 ? 's' : ''}`)
      qc.invalidateQueries({ queryKey: ['transfers'] })
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
