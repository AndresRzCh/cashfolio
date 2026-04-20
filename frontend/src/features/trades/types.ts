export interface Trade {
  id: number
  user_id: number
  account_id: number
  operation: 'BUY' | 'SELL'
  asset_id: number
  quantity: string
  price_per_unit: string
  currency: string
  fee: string | null
  fee_currency: string | null
  date: string
  note: string | null
}

export interface TradeCreate {
  account_id: number
  operation: 'BUY' | 'SELL'
  asset_id: number
  quantity: string
  price_per_unit: string
  currency: string
  fee?: string | null
  fee_currency?: string | null
  date: string
  note?: string | null
}

export type TradeUpdate = Partial<TradeCreate>
