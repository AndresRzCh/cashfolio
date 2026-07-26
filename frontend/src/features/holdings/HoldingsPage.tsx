import { useState, useMemo, Fragment } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useQuery } from '@tanstack/react-query'
import { Download, RefreshCw, History, ChevronRight, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import { api } from '@/lib/api'
import { useHoldings } from './useHoldings'
import { useAssets } from '../assets/useAssets'
import { useAuth } from '@/features/auth/AuthContext'
import { fmtCurrency } from '@/lib/currency'
import type { HoldingRow, AccountHoldingRow } from './types'
import type { Asset } from '../assets/types'

// ── Style constants ───────────────────────────────────────────────────────────

const btnGhost =
  'inline-flex items-center gap-1.5 rounded-xl border border-border text-sm font-medium px-3 py-2 text-slate-600 dark:text-slate-400 hover:bg-muted transition-colors disabled:opacity-50'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AssetType {
  id: number
  name: string
}

interface AssetGroup {
  label: string
  holdings: (HoldingRow & { asset?: Asset })[]
  totalValue: number
  totalCost: number
  totalPnl: number
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useAssetTypes() {
  return useQuery<AssetType[]>({
    queryKey: ['asset-types'],
    queryFn: () => api.get<AssetType[]>('/asset-types').then((r) => r.data),
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtQty(val: string | null | undefined): string {
  if (val == null) return '—'
  const n = parseFloat(val)
  if (isNaN(n)) return '—'
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })
}

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

function sourceLabel(src: Asset['price_source'] | undefined): string {
  if (!src) return '—'
  const map: Record<Asset['price_source'], string> = {
    binance: 'Binance',
    yfinance: 'yFinance',
    custom: 'Custom',
    none: '—',
  }
  return map[src]
}

// ── CSV export ────────────────────────────────────────────────────────────────

function exportHoldingsCSV(holdings: HoldingRow[]) {
  const headers = [
    'asset_symbol', 'asset_name', 'net_quantity', 'cost_basis',
    'avg_cost_per_unit', 'current_price', 'current_value',
    'unrealized_pnl', 'unrealized_pnl_pct',
  ]
  const rows = holdings.map((h) =>
    [
      h.asset_symbol,
      h.asset_name,
      h.net_quantity,
      h.cost_basis,
      h.avg_cost_per_unit,
      h.current_price ?? '',
      h.current_value ?? '',
      h.unrealized_pnl ?? '',
      h.unrealized_pnl_pct ?? '',
    ].join(',')
  )
  const csv = [headers.join(','), ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'holdings.csv'
  a.click()
  URL.revokeObjectURL(url)
}

// ── Source badge ──────────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: Asset['price_source'] | undefined }) {
  const label = sourceLabel(source)
  if (label === '—') return <span className="text-muted-foreground font-mono">—</span>
  return (
    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      {label}
    </span>
  )
}

// ── Group header card ─────────────────────────────────────────────────────────

function GroupHeader({ group, currency }: { group: AssetGroup; currency: string }) {
  return (
    <div className="rounded-2xl bg-card border border-border p-4 flex flex-col sm:flex-row sm:items-center sm:gap-8 gap-3">
      <span className="font-semibold text-foreground text-base">{group.label}</span>
      <div className="flex flex-wrap gap-4 text-sm">
        <div className="flex flex-col">
          <span className="text-muted-foreground text-xs">Total Value</span>
          <span className="font-mono font-medium">{fmtCurrency(group.totalValue.toString(), currency)}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-muted-foreground text-xs">Cost Basis</span>
          <span className="font-mono font-medium">{fmtCurrency(group.totalCost.toString(), currency)}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-muted-foreground text-xs">P&amp;L</span>
          <span className={`font-mono font-medium ${pnlClass(group.totalPnl)}`}>
            {fmtCurrency(group.totalPnl.toString(), currency)}
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Asset table (desktop) ─────────────────────────────────────────────────────

function AssetTable({
  holdings,
  currency,
  expandedAssets,
  onToggle,
}: {
  holdings: AssetGroup['holdings']
  currency: string
  expandedAssets: Set<number | string>
  onToggle: (id: number | string) => void
}) {
  return (
    <div className="hidden sm:block rounded-2xl bg-card border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="w-8 px-2 py-3" />
            <th className="text-left px-4 py-3 font-medium">Asset</th>
            <th className="text-right px-4 py-3 font-medium">Qty</th>
            <th className="text-right px-4 py-3 font-medium">Price</th>
            <th className="text-right px-4 py-3 font-medium">Value</th>
            <th className="text-right px-4 py-3 font-medium">P&amp;L</th>
            <th className="text-right px-4 py-3 font-medium">P&amp;L %</th>
            <th className="text-right px-4 py-3 font-medium">Source</th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((h) => {
            const assetKey = h.asset_id
            const isExpanded = expandedAssets.has(assetKey)
            const hasMultipleAccounts = h.accounts && h.accounts.length > 1
            const singleAccount = !hasMultipleAccounts && h.accounts?.length === 1 ? h.accounts[0] : null
            return (
              <Fragment key={h.asset_id}>
                <tr
                  onClick={() => hasMultipleAccounts && onToggle(assetKey)}
                  className={`border-b border-border last:border-0 transition-colors ${hasMultipleAccounts ? 'cursor-pointer hover:bg-muted/50' : 'hover:bg-muted/30'}`}
                >
                  <td className="px-2 py-3 text-muted-foreground w-8">
                    {hasMultipleAccounts
                      ? isExpanded
                        ? <ChevronDown className="w-4 h-4" />
                        : <ChevronRight className="w-4 h-4" />
                      : null}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-semibold text-foreground">{h.asset_symbol}</span>
                    <span className="ml-2 text-muted-foreground">{h.asset_name}</span>
                    {singleAccount && (
                      <span className="ml-1 text-muted-foreground/60 text-xs">({singleAccount.account_name})</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{fmtQty(h.net_quantity)}</td>
                  <td className="px-4 py-3 text-right font-mono">{fmtCurrency(h.current_price, currency)}</td>
                  <td className="px-4 py-3 text-right font-mono">{fmtCurrency(h.current_value, currency)}</td>
                  <td className={`px-4 py-3 text-right font-mono ${pnlClass(h.unrealized_pnl)}`}>
                    {fmtCurrency(h.unrealized_pnl, currency)}
                  </td>
                  <td className={`px-4 py-3 text-right font-mono ${pnlClass(h.unrealized_pnl_pct)}`}>
                    {fmtPct(h.unrealized_pnl_pct)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <SourceBadge source={h.asset?.price_source} />
                  </td>
                </tr>
                {hasMultipleAccounts && isExpanded && h.accounts?.map((acc: AccountHoldingRow) => (
                  <tr
                    key={`${h.asset_id}-${acc.account_id}`}
                    className="border-b border-border bg-muted/20"
                  >
                    <td className="px-2 py-2" />
                    <td className="px-4 py-2 pl-10 text-muted-foreground text-xs italic">
                      {acc.account_name}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-xs">{fmtQty(acc.net_quantity)}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs">{fmtCurrency(h.current_price, currency)}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs">{fmtCurrency(acc.current_value, currency)}</td>
                    <td className={`px-4 py-2 text-right font-mono text-xs ${pnlClass(acc.unrealized_pnl)}`}>
                      {fmtCurrency(acc.unrealized_pnl, currency)}
                    </td>
                    <td className={`px-4 py-2 text-right font-mono text-xs ${pnlClass(acc.unrealized_pnl_pct)}`}>
                      {fmtPct(acc.unrealized_pnl_pct)}
                    </td>
                    <td className="px-4 py-2" />
                  </tr>
                ))}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Asset card (mobile) ───────────────────────────────────────────────────────

function AssetCard({ h, currency }: { h: AssetGroup['holdings'][number]; currency: string }) {
  return (
    <div className="rounded-2xl bg-card border border-border p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div>
          <span className="font-semibold text-foreground">{h.asset_symbol}</span>
          <span className="ml-2 text-sm text-muted-foreground">{h.asset_name}</span>
        </div>
        <SourceBadge source={h.asset?.price_source} />
      </div>
      <div className="grid grid-cols-2 gap-1 text-sm">
        <span className="text-muted-foreground">Qty</span>
        <span className="font-mono text-right">{fmtQty(h.net_quantity)}</span>
        <span className="text-muted-foreground">Value</span>
        <span className="font-mono text-right">{fmtCurrency(h.current_value, currency)}</span>
        <span className="text-muted-foreground">P&amp;L</span>
        <span className={`font-mono text-right ${pnlClass(h.unrealized_pnl)}`}>
          {fmtCurrency(h.unrealized_pnl, currency)}
        </span>
        <span className="text-muted-foreground">P&amp;L %</span>
        <span className={`font-mono text-right ${pnlClass(h.unrealized_pnl_pct)}`}>
          {fmtPct(h.unrealized_pnl_pct)}
        </span>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function HoldingsPage() {
  const { data, isLoading, isError } = useHoldings()
  const { data: assets = [] } = useAssets()
  const { data: assetTypes = [] } = useAssetTypes()
  const { user } = useAuth()
  const qc = useQueryClient()
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isBackfilling, setIsBackfilling] = useState(false)
  const [expandedAssets, setExpandedAssets] = useState<Set<number | string>>(new Set())
  const currency = user?.base_currency ?? 'EUR'

  function toggleAsset(id: number | string) {
    setExpandedAssets(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // Build lookup maps
  const assetById = useMemo(
    () => new Map<number, Asset>(assets.map((a) => [a.id, a])),
    [assets]
  )
  const typeById = useMemo(
    () => new Map<number, AssetType>(assetTypes.map((t) => [t.id, t])),
    [assetTypes]
  )

  // Group holdings by asset type, then add virtual Cash group from account_fiat
  const groups = useMemo<AssetGroup[]>(() => {
    if (!data) return []
    const groupMap = new Map<number | string | null, AssetGroup>()

    for (const h of data.holdings) {
      const asset = assetById.get(h.asset_id)
      const typeId = asset?.asset_type_id ?? null
      const label = typeId != null ? (typeById.get(typeId)?.name ?? 'Unclassified') : 'Unclassified'

      if (!groupMap.has(typeId)) {
        groupMap.set(typeId, { label, holdings: [], totalValue: 0, totalCost: 0, totalPnl: 0 })
      }

      const group = groupMap.get(typeId)!
      const value = h.current_value != null ? parseFloat(h.current_value) : parseFloat(h.cost_basis)
      const cost = parseFloat(h.cost_basis)
      const pnl = h.unrealized_pnl != null ? parseFloat(h.unrealized_pnl) : 0

      group.holdings.push({ ...h, asset })
      group.totalValue += isNaN(value) ? 0 : value
      group.totalCost += isNaN(cost) ? 0 : cost
      group.totalPnl += isNaN(pnl) ? 0 : pnl
    }

    // Build virtual Cash group from fiat account balances
    if (data.account_fiat && data.account_fiat.length > 0) {
      const fiatByCurrency = new Map<string, {
        totalAmount: number
        totalValue: number
        totalCost: number
        totalPnl: number
        accounts: AccountHoldingRow[]
      }>()

      for (const acc of data.account_fiat) {
        for (const row of acc.rows) {
          if (!fiatByCurrency.has(row.currency)) {
            fiatByCurrency.set(row.currency, { totalAmount: 0, totalValue: 0, totalCost: 0, totalPnl: 0, accounts: [] })
          }
          const agg = fiatByCurrency.get(row.currency)!
          agg.totalAmount += parseFloat(row.amount)
          agg.totalValue += row.current_value ? parseFloat(row.current_value) : parseFloat(row.amount)
          agg.totalCost += parseFloat(row.cost_basis)
          agg.totalPnl += row.unrealized_pnl ? parseFloat(row.unrealized_pnl) : 0
          agg.accounts.push({
            account_id: acc.account_id,
            account_name: acc.account_name,
            net_quantity: row.amount,
            cost_basis: row.cost_basis,
            current_value: row.current_value,
            unrealized_pnl: row.unrealized_pnl,
            unrealized_pnl_pct: null,
          })
        }
      }

      const cashHoldings: AssetGroup['holdings'] = []
      let currencyIndex = 0
      for (const [cur, agg] of fiatByCurrency) {
        const virtualId = cur === 'EUR' ? -17 : cur === 'USD' ? -16 : -(100 + currencyIndex++)
        cashHoldings.push({
          asset_id: virtualId,
          asset_symbol: cur,
          asset_name: cur === 'EUR' ? 'Euro' : cur === 'USD' ? 'US Dollar' : cur,
          net_quantity: agg.totalAmount.toFixed(8),
          cost_basis: agg.totalCost.toFixed(8),
          avg_cost_per_unit: agg.totalAmount > 0 ? (agg.totalCost / agg.totalAmount).toFixed(8) : '0',
          current_price: agg.totalAmount > 0 ? (agg.totalValue / agg.totalAmount).toFixed(8) : null,
          price_date: null,
          current_value: agg.totalValue.toFixed(8),
          unrealized_pnl: agg.totalPnl.toFixed(8),
          unrealized_pnl_pct: agg.totalCost > 0 ? (agg.totalPnl / agg.totalCost * 100).toFixed(4) : null,
          accounts: agg.accounts,
          asset: undefined,
        })
      }

      if (cashHoldings.length > 0) {
        const cashTotalValue = cashHoldings.reduce((s, h) => s + parseFloat(h.current_value ?? '0'), 0)
        const cashTotalCost = cashHoldings.reduce((s, h) => s + parseFloat(h.cost_basis), 0)
        const cashTotalPnl = cashHoldings.reduce((s, h) => s + parseFloat(h.unrealized_pnl ?? '0'), 0)
        groupMap.set('__cash__', {
          label: 'Cash',
          holdings: cashHoldings,
          totalValue: cashTotalValue,
          totalCost: cashTotalCost,
          totalPnl: cashTotalPnl,
        })
      }
    }

    return Array.from(groupMap.values()).sort((a, b) => b.totalValue - a.totalValue)
  }, [data, assetById, typeById])

  const hasHoldings = data && (data.holdings.length > 0 || (data.account_fiat && data.account_fiat.length > 0))

  const latestPriceDate = data?.holdings.reduce<string | undefined>(
    (max, h) => h.price_date && (!max || h.price_date > max) ? h.price_date : max,
    undefined
  )

  async function loadHistory() {
    if (isBackfilling) return
    setIsBackfilling(true)
    try {
      const result = await api.post<{ inserted: number }>('/holdings/backfill-history', null, {
        params: { days: 365 },
      })
      await qc.invalidateQueries({ queryKey: ['portfolio-history'] })
      toast.success(`Loaded ${result.data.inserted} price history rows`)
    } catch {
      toast.error('Failed to load price history')
    } finally {
      setIsBackfilling(false)
    }
  }

  async function refreshPrices() {
    if (!data || isRefreshing) return
    setIsRefreshing(true)
    try {
      await Promise.allSettled(
        data.holdings.map((h) => {
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 60_000)
          return api
            .post(`/assets/${h.asset_id}/refresh-price`, null, { signal: controller.signal })
            .finally(() => clearTimeout(timeout))
            .catch(() => null)
        })
      )
      await qc.invalidateQueries({ queryKey: ['holdings'] })
    } finally {
      setIsRefreshing(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="p-6 max-w-7xl mx-auto space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-foreground">Holdings</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={loadHistory}
            disabled={isBackfilling}
            className={btnGhost}
          >
            <History className={`w-4 h-4 ${isBackfilling ? 'animate-spin' : ''}`} />
            {isBackfilling ? 'Loading…' : 'Load History'}
          </button>
          <button
            onClick={() => data && exportHoldingsCSV(data.holdings)}
            disabled={!data || data.holdings.length === 0}
            className={btnGhost}
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
          <button
            onClick={refreshPrices}
            disabled={isRefreshing || !data}
            className={btnGhost}
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Loading / error */}
      {isLoading && (
        <div className="text-center py-16 text-muted-foreground">Loading holdings…</div>
      )}
      {isError && (
        <div className="text-center py-16 text-rose-500">Failed to load holdings.</div>
      )}

      {/* Empty state */}
      {data && !hasHoldings && (
        <div className="rounded-2xl bg-card border border-border p-12 text-center">
          <p className="text-muted-foreground">
            No holdings yet. Add transfers or trades to see your portfolio.
          </p>
        </div>
      )}

      {/* Per-group sections */}
      {hasHoldings && (
        <>
          {groups.map((group) => (
            <div key={group.label} className="space-y-3">
              <GroupHeader group={group} currency={currency} />
              <AssetTable
                holdings={group.holdings}
                currency={currency}
                expandedAssets={expandedAssets}
                onToggle={toggleAsset}
              />
              <div className="sm:hidden space-y-3">
                {group.holdings.map((h) => (
                  <AssetCard key={h.asset_id} h={h} currency={currency} />
                ))}
              </div>
            </div>
          ))}

          {/* Price date note */}
          {latestPriceDate && (
            <p className="text-xs text-muted-foreground text-right">
              Prices as of {latestPriceDate}
            </p>
          )}
        </>
      )}
    </motion.div>
  )
}
