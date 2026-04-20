export interface Asset {
  id: number
  user_id: number
  symbol: string
  name: string
  asset_type_id: number | null
  price_source: 'binance' | 'yfinance' | 'custom' | 'none'
  external_id: string | null
  current_price: string | null
  price_date: string | null
  history_first_date: string | null
  history_last_date: string | null
}

export interface AssetCreate {
  symbol: string
  name: string
  asset_type_id?: number | null
  price_source: 'binance' | 'yfinance' | 'custom' | 'none'
  external_id?: string | null
}

export interface AssetUpdate {
  symbol?: string
  name?: string
  asset_type_id?: number | null
  price_source?: 'binance' | 'yfinance' | 'custom' | 'none'
  external_id?: string | null
}

export const PRICE_SOURCES = [
  { value: 'binance', label: 'Binance (Crypto)' },
  { value: 'yfinance', label: 'Yahoo Finance (Stocks/ETFs)' },
  { value: 'custom', label: 'Custom CSV' },
  { value: 'none', label: 'Manual / None' },
] as const
