import { Building2 } from 'lucide-react'
import { PageTransition } from '@/components/PageTransition'
import { useAuth } from '@/features/auth/AuthContext'
import { fmtCurrency } from '@/lib/currency'
import { useAccountSummary } from './useAccountSummary'
import type { AccountSummaryRow } from './types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtPct(val: string | null | undefined): string {
  if (val == null) return '—'
  const n = parseFloat(val)
  if (isNaN(n)) return '—'
  return (n >= 0 ? '+' : '') + n.toFixed(2) + '%'
}

function pnlClass(val: string | number | null | undefined): string {
  if (val == null) return 'profit-neutral'
  const n = typeof val === 'number' ? val : parseFloat(val as string)
  if (n > 0) return 'profit-positive'
  if (n < 0) return 'profit-negative'
  return 'profit-neutral'
}

// ── Mobile card ───────────────────────────────────────────────────────────────

function AccountCard({ row, currency }: { row: AccountSummaryRow; currency: string }) {
  return (
    <div className="rounded-2xl bg-card border border-border p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-semibold text-foreground">{row.account_name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{row.account_type}</p>
        </div>
        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
          {row.num_assets} {row.num_assets === 1 ? 'asset' : 'assets'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-y-1.5 text-sm">
        <span className="text-muted-foreground">Invested</span>
        <span className="font-mono text-right">{fmtCurrency(row.total_invested, currency)}</span>
        <span className="text-muted-foreground">Value</span>
        <span className="font-mono text-right">{fmtCurrency(row.total_value, currency)}</span>
        <span className="text-muted-foreground">P&amp;L</span>
        <span className={`font-mono text-right ${pnlClass(row.total_pnl)}`}>
          {fmtCurrency(row.total_pnl, currency)}
        </span>
        <span className="text-muted-foreground">P&amp;L %</span>
        <span className={`font-mono text-right ${pnlClass(row.total_pnl_pct)}`}>
          {fmtPct(row.total_pnl_pct)}
        </span>
        <span className="text-muted-foreground">Deposited</span>
        <span className="font-mono text-right">{fmtCurrency(row.cash_deposited, currency)}</span>
        <span className="text-muted-foreground">Withdrawn</span>
        <span className="font-mono text-right">{fmtCurrency(row.cash_withdrawn, currency)}</span>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AccountsPage() {
  const { data: rows, isLoading, isError } = useAccountSummary()
  const { user } = useAuth()
  const currency = user?.base_currency ?? 'EUR'

  return (
    <PageTransition>
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Building2 size={22} className="text-accent-500 shrink-0" />
          <h1 className="text-2xl font-semibold tracking-tight text-slate-800 dark:text-slate-100">
            Accounts
          </h1>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="text-center py-16 text-muted-foreground">Loading…</div>
        )}

        {/* Error */}
        {isError && (
          <div className="text-center py-16 text-rose-500">Failed to load account summary.</div>
        )}

        {/* Empty state */}
        {!isLoading && !isError && rows && rows.length === 0 && (
          <div className="rounded-2xl bg-card border border-border p-12 text-center">
            <Building2 size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
            <p className="font-medium text-slate-700 dark:text-slate-300 mb-1">No accounts yet</p>
            <p className="text-sm text-muted-foreground">
              Create accounts in Settings to start tracking your portfolio.
            </p>
          </div>
        )}

        {/* Desktop table */}
        {rows && rows.length > 0 && (
          <>
            <div className="hidden sm:block rounded-2xl bg-card border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[780px]">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Account</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Type</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Assets</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Invested</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Value</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">P&amp;L</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">P&amp;L %</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">
                        Deposited
                      </th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">
                        Withdrawn
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr
                        key={row.account_id}
                        className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors"
                      >
                        <td className="px-4 py-3 font-semibold text-foreground">
                          {row.account_name}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {row.account_type}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                          {row.num_assets}
                        </td>
                        <td className="px-4 py-3 text-right font-mono">
                          {fmtCurrency(row.total_invested, currency)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono">
                          {fmtCurrency(row.total_value, currency)}
                        </td>
                        <td className={`px-4 py-3 text-right font-mono ${pnlClass(row.total_pnl)}`}>
                          {fmtCurrency(row.total_pnl, currency)}
                        </td>
                        <td className={`px-4 py-3 text-right font-mono ${pnlClass(row.total_pnl_pct)}`}>
                          {fmtPct(row.total_pnl_pct)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-muted-foreground hidden lg:table-cell">
                          {fmtCurrency(row.cash_deposited, currency)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-muted-foreground hidden lg:table-cell">
                          {fmtCurrency(row.cash_withdrawn, currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile cards */}
            <div className="sm:hidden space-y-3">
              {rows.map((row) => (
                <AccountCard key={row.account_id} row={row} currency={currency} />
              ))}
            </div>
          </>
        )}
      </div>
    </PageTransition>
  )
}
