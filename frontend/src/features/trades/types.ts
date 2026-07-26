export interface Trade {
  id: number
  user_id: number
  account_id: number
  from_asset_id: number
  from_amount: string
  to_asset_id: number
  to_amount: string
  fee_asset_id: number | null
  fee_amount: string | null
  date: string
  note: string | null
}

export interface TradeCreate {
  account_id: number
  from_asset_id: number
  from_amount: string
  to_asset_id: number
  to_amount: string
  fee_asset_id?: number | null
  fee_amount?: string | null
  date: string
  note?: string | null
}

export type TradeUpdate = Partial<TradeCreate>
