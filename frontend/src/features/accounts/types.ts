export interface AccountSummaryRow {
  account_id: number
  account_name: string
  account_type: string
  num_assets: number
  total_invested: string
  total_value: string
  total_pnl: string
  total_pnl_pct: string | null
  cash_deposited: string
  cash_withdrawn: string
}
