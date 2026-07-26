export interface AccountHoldingRow {
  account_id: number
  account_name: string
  net_quantity: string
  cost_basis: string
  current_value: string | null
  unrealized_pnl: string | null
  unrealized_pnl_pct: string | null
}

export interface HoldingRow {
  asset_id: number
  asset_symbol: string
  asset_name: string
  net_quantity: string
  cost_basis: string
  avg_cost_per_unit: string
  current_price: string | null
  price_date: string | null
  current_value: string | null
  unrealized_pnl: string | null
  unrealized_pnl_pct: string | null
  accounts: AccountHoldingRow[]
}

export interface FiatAccountRow {
  currency: string
  amount: string
  cost_basis: string
  current_value: string | null
  unrealized_pnl: string | null
}

export interface AccountFiatSummary {
  account_id: number
  account_name: string
  rows: FiatAccountRow[]
}

export interface PortfolioSummary {
  total_cost_basis: string
  total_current_value: string | null
  total_unrealized_pnl: string | null
  total_unrealized_pnl_pct: string | null
  holdings: HoldingRow[]
  account_fiat: AccountFiatSummary[]
}
