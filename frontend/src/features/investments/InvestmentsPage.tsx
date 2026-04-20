import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { api } from '@/lib/api'
import { useHoldings } from '../holdings/useHoldings'
import { useAssets } from '../assets/useAssets'
import { useAuth } from '../auth/AuthContext'
import { fmtCurrency } from '@/lib/currency'
import { usePortfolioHistory } from '../holdings/usePortfolioHistory'
import type { HoldingRow } from '../holdings/types'
import type { Asset } from '../assets/types'

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

// ── Tooltip ───────────────────────────────────────────────────────────────────

function ChartTooltip({
  active,
  payload,
  label,
  currency,
}: {
  active?: boolean
  payload?: { value: number }[]
  label?: string
  currency?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl bg-card border border-border px-3 py-2 text-sm shadow-md">
      <p className="text-muted-foreground mb-0.5">{label}</p>
      <p className="font-mono font-semibold text-foreground">{fmtCurrency(payload[0].value.toString(), currency ?? 'EUR')}</p>
    </div>
  )
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

function AssetTable({ holdings, currency }: { holdings: AssetGroup['holdings']; currency: string }) {
  return (
    <div className="hidden sm:block rounded-2xl bg-card border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
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
          {holdings.map((h) => (
            <tr
              key={h.asset_id}
              className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors"
            >
              <td className="px-4 py-3">
                <span className="font-semibold text-foreground">{h.asset_symbol}</span>
                <span className="ml-2 text-muted-foreground">{h.asset_name}</span>
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
          ))}
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

// ── Portfolio chart helpers ───────────────────────────────────────────────────

function fmtDateShort(d: string): string {
  const dt = new Date(d)
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtAxisValue(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`
  return v.toFixed(0)
}

interface LineTooltipProps {
  active?: boolean
  payload?: { name: string; value: number; color: string }[]
  label?: string
  currency: string
}

function LineChartTooltip({ active, payload, label, currency }: LineTooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl bg-card border border-border px-3 py-2 text-sm shadow-md space-y-1">
      <p className="text-muted-foreground text-xs mb-1">{label ? fmtDateShort(label) : ''}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
          <span className="text-muted-foreground">{p.name}</span>
          <span className="font-mono font-semibold text-foreground ml-auto pl-3">
            {fmtCurrency(p.value.toString(), currency)}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Portfolio performance chart ───────────────────────────────────────────────

const PERIODS: { days: number; label: string }[] = [
  { days: 90, label: '3M' },
  { days: 180, label: '6M' },
  { days: 365, label: '1Y' },
  { days: 730, label: '2Y' },
  { days: 1825, label: '5Y' },
  { days: 3650, label: 'Max' },
]

function PortfolioChart({ currency }: { currency: string }) {
  const [period, setPeriod] = useState<number>(365)
  const { data: history = [], isLoading } = usePortfolioHistory(period)

  const periodLabel = PERIODS.find((p) => p.days === period)?.label ?? `${period}d`

  const chartData = history.map((pt) => ({
    date: pt.date,
    'Portfolio Value': parseFloat(pt.total_value),
    'Cost Basis': parseFloat(pt.total_cost),
  }))

  return (
    <div className="rounded-2xl bg-card border border-border p-5 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-medium text-muted-foreground">Performance ({periodLabel})</h2>
        <div className="flex gap-1">
          {PERIODS.map(({ days, label }) => (
            <button
              key={days}
              onClick={() => setPeriod(days)}
              className={
                days === period
                  ? 'rounded-lg px-2.5 py-0.5 text-xs font-medium transition-colors bg-accent-500 text-white'
                  : 'rounded-lg px-2.5 py-0.5 text-xs font-medium transition-colors border border-border text-muted-foreground hover:text-foreground'
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="h-[260px] flex items-center justify-center text-muted-foreground text-sm">
          Loading…
        </div>
      )}

      {!isLoading && chartData.length === 0 && (
        <div className="h-[260px] flex items-center justify-center text-center px-8">
          <p className="text-muted-foreground text-sm">
            No price history yet. Prices are cached daily at 00:05 UTC.
          </p>
        </div>
      )}

      {!isLoading && chartData.length > 0 && (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
            <XAxis
              dataKey="date"
              tickFormatter={fmtDateShort}
              tick={{ fontSize: 11, fill: 'currentColor' }}
              axisLine={false}
              tickLine={false}
              minTickGap={40}
            />
            <YAxis
              tickFormatter={(v) => fmtAxisValue(v)}
              tick={{ fontSize: 11, fill: 'currentColor' }}
              axisLine={false}
              tickLine={false}
              width={52}
            />
            <Tooltip
              content={<LineChartTooltip currency={currency} />}
              cursor={{ stroke: 'rgba(107,140,174,0.2)', strokeWidth: 1 }}
            />
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
            />
            <Line
              type="monotone"
              dataKey="Portfolio Value"
              stroke="#6B8CAE"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="Cost Basis"
              stroke="#94a3b8"
              strokeWidth={2}
              dot={false}
              strokeDasharray="4 3"
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function InvestmentsPage() {
  const { data: portfolio, isLoading, isError } = useHoldings()
  const { data: assets = [] } = useAssets()
  const { data: assetTypes = [] } = useAssetTypes()
  const { user } = useAuth()
  const currency = user?.base_currency ?? 'EUR'

  // Build asset lookup by id
  const assetById = new Map<number, Asset>(assets.map((a) => [a.id, a]))

  // Build asset-type lookup by id
  const typeById = new Map<number, AssetType>(assetTypes.map((t) => [t.id, t]))

  // Group holdings by asset_type_id
  const groupMap = new Map<number | null, AssetGroup>()

  if (portfolio) {
    for (const h of portfolio.holdings) {
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
  }

  const groups = Array.from(groupMap.values()).sort((a, b) => b.totalValue - a.totalValue)

  const chartData = groups.map((g) => ({ name: g.label, value: g.totalValue }))

  const hasHoldings = portfolio && portfolio.holdings.length > 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="p-6 max-w-7xl mx-auto space-y-6"
    >
      {/* Header */}
      <h1 className="text-2xl font-semibold text-foreground">Investments</h1>

      {/* Loading / error */}
      {isLoading && (
        <div className="text-center py-16 text-muted-foreground">Loading…</div>
      )}
      {isError && (
        <div className="text-center py-16 text-rose-500">Failed to load investments.</div>
      )}

      {/* Empty state */}
      {portfolio && !hasHoldings && (
        <div className="rounded-2xl bg-card border border-border p-12 text-center">
          <p className="text-muted-foreground">
            No investments yet. Add transfers to get started.
          </p>
        </div>
      )}

      {/* Performance chart — shown regardless of hasHoldings so history persists after sells */}
      {!isLoading && !isError && (
        <PortfolioChart currency={currency} />
      )}

      {hasHoldings && (
        <>
          {/* Bar chart */}
          <div className="rounded-2xl bg-card border border-border p-5 space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground">By Asset Type</h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 12, fill: 'currentColor' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis hide />
                <Tooltip content={<ChartTooltip currency={currency} />} cursor={{ fill: 'rgba(107,140,174,0.08)' }} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill="#6B8CAE" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Per-group sections */}
          {groups.map((group) => (
            <div key={group.label} className="space-y-3">
              <GroupHeader group={group} currency={currency} />
              {/* Desktop table */}
              <AssetTable holdings={group.holdings} currency={currency} />
              {/* Mobile cards */}
              <div className="sm:hidden space-y-3">
                {group.holdings.map((h) => (
                  <AssetCard key={h.asset_id} h={h} currency={currency} />
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </motion.div>
  )
}
