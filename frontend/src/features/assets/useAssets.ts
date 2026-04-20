import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { Asset, AssetCreate, AssetUpdate } from './types'

export function useAssets() {
  return useQuery<Asset[]>({
    queryKey: ['assets'],
    queryFn: () => api.get<Asset[]>('/assets').then((r) => r.data),
  })
}

export function useCreateAsset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: AssetCreate) =>
      api.post<Asset>('/assets', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assets'] })
      toast.success('Asset added')
    },
  })
}

export function useUpdateAsset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: AssetUpdate }) =>
      api.patch<Asset>(`/assets/${id}`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assets'] })
      toast.success('Asset updated')
    },
  })
}

export function useDeleteAsset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.delete(`/assets/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assets'] })
      toast.success('Asset deleted')
    },
  })
}

export function useRefreshAssetPrice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) =>
      api
        .post<{ price: string | null; date: string | null; inserted: number }>(`/assets/${id}/refresh-price`)
        .then((r) => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['assets'] })
      qc.invalidateQueries({ queryKey: ['portfolio-history'] })
      const msg = data.inserted > 0
        ? `Refreshed — ${data.inserted} historical rows added`
        : 'Price refreshed'
      toast.success(msg)
    },
    onError: () => toast.error('Price refresh failed'),
  })
}

export function useUploadCustomPrices() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, file }: { id: number; file: File }) => {
      const form = new FormData()
      form.append('file', file)
      return api
        .post<{ imported: number; errors: string[] }>(
          `/assets/${id}/custom-prices/upload`,
          form,
          { headers: { 'Content-Type': 'multipart/form-data' } },
        )
        .then((r) => r.data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assets'] }),
  })
}

export function useImportPriceCache() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, file }: { id: number; file: File }) => {
      const form = new FormData()
      form.append('file', file)
      return api
        .post<{ imported: number; errors: string[] }>(
          `/assets/${id}/price-cache/import`,
          form,
          { headers: { 'Content-Type': 'multipart/form-data' } },
        )
        .then((r) => r.data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assets'] })
      qc.invalidateQueries({ queryKey: ['portfolio-history'] })
    },
  })
}

export function exportPriceCache(id: number): void {
  const token = localStorage.getItem('access_token')
  const a = document.createElement('a')
  a.href = `/api/v1/assets/${id}/price-cache/export`
  // Pass auth via a fetch + blob to avoid CORS/header issues with anchor downloads
  fetch(a.href, { headers: { Authorization: `Bearer ${token}` } })
    .then((r) => r.blob())
    .then((blob) => {
      const url = URL.createObjectURL(blob)
      a.href = url
      a.download = `price_history.csv`
      a.click()
      URL.revokeObjectURL(url)
    })
}
