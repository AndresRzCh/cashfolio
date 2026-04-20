export interface FireflyConfig {
  url: string
  last_synced_at: string | null
}

export interface FireflyAccount {
  firefly_id: string
  name: string
  account_type: string
  balance: string
  currency_code: string
  last_synced_at: string
}

export interface FireflySyncResult {
  synced: number
  message: string
}
