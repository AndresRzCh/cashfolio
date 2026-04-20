export interface Transfer {
  id: number
  user_id: number
  from_account_id: number | null
  to_account_id: number | null
  amount: string
  currency: string
  fee: string | null
  date: string
  note: string | null
}

export interface TransferCreate {
  from_account_id?: number | null
  to_account_id?: number | null
  amount: string
  currency: string
  fee?: string | null
  date: string
  note?: string | null
}

export type TransferUpdate = Partial<TransferCreate>
