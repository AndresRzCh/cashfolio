import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FxRateRead {
  id: number
  from_currency: string
  to_currency: string
  date: string   // "YYYY-MM-DD"
  rate: string   // Decimal as string
}

interface ImportResult {
  imported: number
  skipped: number
  errors: Array<{ row: number; error: string }>
}

interface FetchResult {
  fetched: number
}

interface FetchFxRatesBody {
  from_currency: string
  to_currency: string
  start_date: string
  end_date: string
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useFxRates(fromCurrency?: string, toCurrency?: string) {
  return useQuery<FxRateRead[]>({
    queryKey: ['fx-rates', fromCurrency ?? '', toCurrency ?? ''],
    queryFn: async () => {
      const params: Record<string, string> = {}
      if (fromCurrency) params.from_currency = fromCurrency
      if (toCurrency) params.to_currency = toCurrency
      const r = await api.get<FxRateRead[]>('/fx-rates', { params })
      return r.data
    },
    enabled: !!(fromCurrency && fromCurrency.length >= 2 && toCurrency && toCurrency.length >= 2),
  })
}

export function useImportFxRates() {
  const qc = useQueryClient()
  return useMutation<ImportResult, Error, File>({
    mutationFn: async (file: File) => {
      const form = new FormData()
      form.append('file', file)
      const r = await api.post<ImportResult>('/fx-rates/import', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return r.data
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['fx-rates'] })
      toast.success(`Imported ${data.imported} rate${data.imported !== 1 ? 's' : ''}, skipped ${data.skipped}`)
    },
    onError: () => toast.error('Import failed'),
  })
}

export function useFetchFxRates() {
  const qc = useQueryClient()
  return useMutation<FetchResult, Error, FetchFxRatesBody>({
    mutationFn: async (body) => {
      const r = await api.post<FetchResult>('/fx-rates/fetch', body)
      return r.data
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['fx-rates'] })
      toast.success(`Fetched ${data.fetched} new rate${data.fetched !== 1 ? 's' : ''}`)
    },
    onError: () => toast.error('Fetch from Frankfurter failed'),
  })
}

export function useDeleteFxRate() {
  const qc = useQueryClient()
  return useMutation<void, Error, number>({
    mutationFn: async (id: number) => {
      await api.delete(`/fx-rates/${id}`)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fx-rates'] })
    },
    onError: () => toast.error('Delete failed'),
  })
}

export async function exportFxRates(): Promise<void> {
  const token = localStorage.getItem('access_token')
  const response = await fetch('/api/v1/fx-rates/export', {
    headers: { Authorization: `Bearer ${token}` },
  })
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'fx_rates.csv'
  a.click()
  URL.revokeObjectURL(url)
}
