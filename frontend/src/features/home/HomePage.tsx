import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { ArrowLeftRight, TrendingDown, TrendingUp } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useHoldings } from '../holdings/useHoldings'
import { usePortfolioHistory } from '../holdings/usePortfolioHistory'
import { useTransfers } from '../transfers/useTransfers'
import { useTrades } from '../trades/useTrades'
import { useAssets } from '../assets/useAssets'
import { useAccounts } from '../accounts/useAccounts'
import { useAuth } from '../auth/AuthContext'
import { fmtCurrency } from '@/lib/currency'
import { useFireflyAccounts, useFireflyConfig } from '../firefly/useFirefly'

interface AssetType {
  id: number
  name: string
}

function useAssetTypes() {
  return useQuery<AssetType[]>({
    queryKey: ['asset-types'],
    queryFn: () => api.get<AssetType[]>('/asset-types').then((r) => r.data),
  })
}

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

function pnlClass(val: string | null | undefined): string {
  if (val == null) return 'profit-neutral'
  const n = parseFloat(val)
  if (n > 0) return 'profit-positive'
  if (n < 0) return 'profit-negative'
  return 'profit-neutral'
}

// ── Chart palette ─────────────────────────────────────────────────────────────

const DONUT_COLORS = [
  '#6B8CAE',  // accent blue
  '#52b788',  // sage green
  '#e07b54',  // terra orange
  '#9b72cf',  // soft purple
  '#f4a261',  // warm amber
  '#e76f8a',  // dusty rose
  '#44a4a0',  // teal
  '#94a3b8',  // slate (Other)
]

interface DonutTooltipProps {
  active?: boolean
  payload?: { name: string; value: number }[]
  currency: string
}

function DonutTooltip({ active, payload, currency }: DonutTooltipProps) {
  if (!active || !payload?.length) return null
  const { name, value } = payload[0]
  return (
    <div className="rounded-xl bg-card border border-border px-3 py-2 text-sm shadow-md space-y-0.5">
      <p className="text-muted-foreground text-xs">{name}</p>
      <p className="font-mono font-semibold text-foreground">{fmtCurrency(value.toString(), currency)}</p>
    </div>
  )
}

// ── Performance chart ─────────────────────────────────────────────────────────

type DaysOption = 30 | 90 | 180 | 365 | 'max'
type ChartView = 'value' | 'pnl' | 'pnl_pct'

const DAY_OPTIONS: { value: DaysOption; label: string }[] = [
  { value: 30, label: '30d' },
  { value: 90, label: '90d' },
  { value: 180, label: '180d' },
  { value: 365, label: '1y' },
  { value: 'max', label: 'Max' },
]

const CHART_VIEWS: { value: ChartView; label: string }[] = [
  { value: 'value', label: 'Value' },
  { value: 'pnl', label: 'P&L' },
  { value: 'pnl_pct', label: 'P&L %' },
]

function fmtDateShort(d: string): string {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtAxisValue(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`
  return v.toFixed(0)
}

function filterBtn(active: boolean) {
  return active
    ? 'inline-flex items-center rounded-lg px-2 py-1 text-xs font-medium bg-accent-500 text-white transition-colors'
    : 'inline-flex items-center rounded-lg px-2 py-1 text-xs font-medium border border-border text-slate-600 dark:text-slate-400 hover:bg-muted transition-colors'
}

interface PerfTooltipProps {
  active?: boolean
  payload?: { name: string; value: number; color: string }[]
  label?: string
  currency: string
  view: ChartView
}

function PerfTooltip({ active, payload, label, currency, view }: PerfTooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl bg-card border border-border px-3 py-2 text-sm shadow-md space-y-1">
      <p className="text-muted-foreground text-xs mb-1">{label ? fmtDateShort(label) : ''}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
          <span className="text-muted-foreground">{p.name}</span>
          <span className="font-mono font-semibold text-foreground ml-auto pl-3">
            {view === 'pnl_pct'
              ? (p.value >= 0 ? '+' : '') + p.value.toFixed(2) + '%'
              : fmtCurrency(p.value.toString(), currency)}
          </span>
        </div>
      ))}
    </div>
  )
}

function PerformanceChart({ currency }: { currency: string }) {
  const [days, setDays] = useState<DaysOption>(90)
  const [view, setView] = useState<ChartView>('value')
  const apiDays = days === 'max' ? 3650 : days
  const { data: history = [], isLoading } = usePortfolioHistory(apiDays)

  const chartData = history.map((pt) => {
    const value = parseFloat(pt.total_value)
    const cost = parseFloat(pt.total_cost)
    const pnl = parseFloat(pt.total_pnl)
    const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0
    return { date: pt.date, 'Portfolio Value': value, 'Cost Basis': cost, 'P&L': pnl, 'P&L %': pnlPct }
  })

  const yFormatter =
    view === 'pnl_pct'
      ? (v: number) => v.toFixed(1) + '%'
      : (v: number) => fmtAxisValue(v)

  const pnlDataKey = view === 'pnl' ? 'P&L' : 'P&L %'
  const pnlMin = view !== 'value' ? Math.min(...chartData.map((d) => d[pnlDataKey as keyof typeof d] as number)) : 0
  const pnlMax = view !== 'value' ? Math.max(...chartData.map((d) => d[pnlDataKey as keyof typeof d] as number)) : 0
  const pnlRange = pnlMax - pnlMin || 1
  const zeroFracPct = view !== 'value' ? `${(Math.min(1, Math.max(0, pnlMax / pnlRange)) * 100).toFixed(2)}%` : '0%'

  return (
    <div className="rounded-2xl bg-card border border-border p-5 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-sm font-medium text-muted-foreground">Performance</h2>
        <div className="flex items-center gap-1">
          {DAY_OPTIONS.map((opt) => (
            <button key={String(opt.value)} onClick={() => setDays(opt.value)} className={filterBtn(days === opt.value)}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-1">
        {CHART_VIEWS.map((v) => (
          <button key={v.value} onClick={() => setView(v.value)} className={filterBtn(view === v.value)}>
            {v.label}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="h-[260px] flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
      )}
      {!isLoading && chartData.length === 0 && (
        <div className="h-[260px] flex items-center justify-center text-center px-8">
          <p className="text-muted-foreground text-sm">No price history yet. Use "Load History" on the Holdings page, or wait for the nightly cache job (00:05 UTC).</p>
        </div>
      )}

      {!isLoading && chartData.length > 0 && view === 'value' && (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
            <XAxis dataKey="date" tickFormatter={fmtDateShort} tick={{ fontSize: 11, fill: 'currentColor' }} axisLine={false} tickLine={false} minTickGap={40} />
            <YAxis tickFormatter={yFormatter} tick={{ fontSize: 11, fill: 'currentColor' }} axisLine={false} tickLine={false} width={52} />
            <Tooltip content={<PerfTooltip currency={currency} view={view} />} cursor={{ stroke: 'rgba(107,140,174,0.2)', strokeWidth: 1 }} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
            <Line type="monotone" dataKey="Portfolio Value" stroke="#6B8CAE" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            <Line type="monotone" dataKey="Cost Basis" stroke="#94a3b8" strokeWidth={2} dot={false} strokeDasharray="4 3" activeDot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      )}

      {!isLoading && chartData.length > 0 && view !== 'value' && (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
            <defs>
              <linearGradient id="pnlStroke" x1="0" y1="0" x2="0" y2="1">
                <stop offset={zeroFracPct} stopColor="#6B8CAE" stopOpacity={1} />
                <stop offset={zeroFracPct} stopColor="#f87171" stopOpacity={1} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tickFormatter={fmtDateShort} tick={{ fontSize: 11, fill: 'currentColor' }} axisLine={false} tickLine={false} minTickGap={40} />
            <YAxis
              tickFormatter={yFormatter}
              tick={{ fontSize: 11, fill: 'currentColor' }}
              axisLine={false}
              tickLine={false}
              width={view === 'pnl_pct' ? 48 : 52}
              domain={[pnlMin, pnlMax]}
            />
            <Tooltip content={<PerfTooltip currency={currency} view={view} />} cursor={{ stroke: 'rgba(107,140,174,0.2)', strokeWidth: 1 }} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
            {pnlMin < 0 && pnlMax > 0 && (
              <ReferenceLine y={0} stroke="rgba(107,140,174,0.35)" strokeWidth={1} strokeDasharray="4 3" />
            )}
            <Line
              type="monotone"
              dataKey={pnlDataKey}
              stroke="url(#pnlStroke)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  colorClass,
}: {
  label: string
  value: string
  colorClass?: string
}) {
  return (
    <div className="rounded-2xl bg-card border border-border p-5 flex flex-col gap-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-2xl font-mono font-semibold ${colorClass ?? ''}`}>{value}</span>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [donutTab, setDonutTab] = useState<'type' | 'asset'>('type')
  const { user } = useAuth()
  const { data: portfolio, isLoading: holdingsLoading } = useHoldings()
  const { data: transfers } = useTransfers()
  const { data: trades } = useTrades()
  const { data: assets } = useAssets()
  const { data: accounts } = useAccounts()
  const { data: assetTypes } = useAssetTypes()
  const { data: fireflyConfig } = useFireflyConfig()
  const { data: fireflyAccounts } = useFireflyAccounts()

  // Greeting
  const hour = new Date().getHours()
  const timeOfDay = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'
  const username = user?.email?.split('@')[0] ?? ''
  const currency = user?.base_currency ?? 'EUR'

  // Asset symbol + type lookup maps
  const assetMap = useMemo(() => {
    const map = new Map<number, string>()
    assets?.forEach((a) => map.set(a.id, a.symbol))
    return map
  }, [assets])

  const accountMap = useMemo(() => {
    const map = new Map<number, string>()
    accounts?.forEach((a) => map.set(a.id, a.name))
    return map
  }, [accounts])

  const assetTypeById = useMemo(() => {
    const map = new Map<number, string>()
    assetTypes?.forEach((t) => map.set(t.id, t.name))
    return map
  }, [assetTypes])

  const assetById = useMemo(() => {
    const map = new Map<number, { asset_type_id: number | null }>()
    assets?.forEach((a) => map.set(a.id, { asset_type_id: a.asset_type_id ?? null }))
    return map
  }, [assets])

  // Allocation donut data — grouped by asset type, top 5 + "Other"
  const donutData = useMemo(() => {
    if (!portfolio?.holdings?.length) return []

    const typeValues = new Map<string, number>()
    for (const h of portfolio.holdings) {
      const value = parseFloat(h.current_value ?? h.cost_basis) || 0
      const asset = assetById.get(h.asset_id)
      const typeId = asset?.asset_type_id
      const typeName = typeId != null ? (assetTypeById.get(typeId) ?? 'Unclassified') : 'Unclassified'
      typeValues.set(typeName, (typeValues.get(typeName) ?? 0) + value)
    }

    const sorted = Array.from(typeValues.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)

    if (sorted.length <= 5) return sorted

    const top5 = sorted.slice(0, 5)
    const otherValue = sorted.slice(5).reduce((sum, s) => sum + s.value, 0)
    return [...top5, { name: 'Other', value: otherValue }]
  }, [portfolio, assetById, assetTypeById])

  const donutByAsset = useMemo(() => {
    if (!portfolio?.holdings?.length) return []
    const sorted = portfolio.holdings
      .map((h) => ({
        name: h.asset_symbol ?? `#${h.asset_id}`,
        value: parseFloat(h.current_value ?? h.cost_basis) || 0,
      }))
      .sort((a, b) => b.value - a.value)
    if (sorted.length <= 5) return sorted
    const top5 = sorted.slice(0, 5)
    const otherValue = sorted.slice(5).reduce((sum, s) => sum + s.value, 0)
    return [...top5, { name: 'Other', value: otherValue }]
  }, [portfolio])

  // Recent activity: merge last 5 transfers + last 5 trades, sort desc, take 8
  const recentActivity = useMemo(() => {
    type ActivityItem =
      | {
          kind: 'transfer'
          id: number
          date: string
          amount: string
          currency: string
          from_account_id: number | null
          to_account_id: number | null
        }
      | {
          kind: 'trade'
          id: number
          date: string
          operation: 'BUY' | 'SELL'
          asset_id: number
          quantity: string
        }

    const items: ActivityItem[] = []

    const recentTransfers = (transfers ?? []).slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5)
    const recentTrades = (trades ?? []).slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5)

    recentTransfers.forEach((t) =>
      items.push({
        kind: 'transfer',
        id: t.id,
        date: t.date,
        amount: t.amount,
        currency: t.currency,
        from_account_id: t.from_account_id,
        to_account_id: t.to_account_id,
      })
    )
    recentTrades.forEach((t) =>
      items.push({
        kind: 'trade',
        id: t.id,
        date: t.date,
        operation: t.operation,
        asset_id: t.asset_id,
        quantity: t.quantity,
      })
    )

    return items.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8)
  }, [transfers, trades])

  // Savings tiles: net deposits and time in market
  const savingsStats = useMemo(() => {
    // Net deposits: transfers into internal accounts (to_account_id set) minus out (from_account_id set)
    // We sum amounts in their own currency — use as approximate for display (no FX on frontend)
    let deposited = 0
    let withdrawn = 0
    ;(transfers ?? []).forEach((t) => {
      const amt = parseFloat(t.amount) || 0
      if (t.to_account_id !== null) deposited += amt
      if (t.from_account_id !== null) withdrawn += amt
    })
    const netDeposits = deposited - withdrawn

    // Time in market: days from first trade to today
    const tradeDates = (trades ?? []).map((t) => t.date).sort()
    let timeInMarket: string = '—'
    if (tradeDates.length > 0) {
      const firstDate = new Date(tradeDates[0])
      const days = Math.floor((Date.now() - firstDate.getTime()) / 86_400_000)
      timeInMarket = days < 30
        ? `${days}d`
        : days < 365
        ? `${Math.floor(days / 30)}mo ${days % 30}d`
        : `${Math.floor(days / 365)}y ${Math.floor((days % 365) / 30)}mo`
    }

    return { netDeposits, timeInMarket }
  }, [transfers, trades])

  // Net worth: portfolio value + Firefly III account balances (raw sum, no FX on frontend)
  const netWorth = useMemo(() => {
    const portfolioValue = parseFloat(portfolio?.total_current_value ?? '0') || 0
    const fireflyTotal = (fireflyAccounts ?? []).reduce((sum, a) => sum + (parseFloat(a.balance) || 0), 0)
    return { portfolioValue, fireflyTotal, total: portfolioValue + fireflyTotal, hasFirefly: (fireflyAccounts?.length ?? 0) > 0 }
  }, [portfolio, fireflyAccounts])

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="p-6 max-w-7xl mx-auto space-y-6"
    >
      {/* 1. Page header */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Good {timeOfDay}{username ? `, ${username}` : ''}.
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Here's your portfolio at a glance.</p>
      </div>

      {/* 2. Summary stat cards */}
      {holdingsLoading && (
        <div className="text-sm text-muted-foreground py-4">Loading summary…</div>
      )}
      {portfolio && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total Value"
            value={fmtCurrency(portfolio.total_current_value, currency)}
          />
          <StatCard
            label="Cost Basis"
            value={fmtCurrency(portfolio.total_cost_basis, currency)}
          />
          <StatCard
            label="Unrealized P&L"
            value={fmtCurrency(portfolio.total_unrealized_pnl, currency)}
            colorClass={pnlClass(portfolio.total_unrealized_pnl)}
          />
          <StatCard
            label="P&L %"
            value={fmtPct(portfolio.total_unrealized_pnl_pct)}
            colorClass={pnlClass(portfolio.total_unrealized_pnl_pct)}
          />
        </div>
      )}

      {/* 2b. Savings tiles */}
      {(transfers || trades) && (
        <div className="grid grid-cols-2 gap-4">
          <StatCard
            label="Net Deposits"
            value={fmtCurrency(savingsStats.netDeposits.toString(), currency)}
          />
          <StatCard
            label="Time in Market"
            value={savingsStats.timeInMarket}
          />
        </div>
      )}

      {/* 2c. Net Worth tile (only shown when Firefly III is configured) */}
      {fireflyConfig && netWorth.hasFirefly && (
        <div className="rounded-2xl bg-card border border-border p-5 space-y-3">
          <h2 className="text-base font-semibold text-foreground">Net Worth</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">Investments</span>
              <span className="text-xl font-mono font-semibold">
                {fmtCurrency(netWorth.portfolioValue.toString(), currency)}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">Firefly III accounts</span>
              <span className="text-xl font-mono font-semibold">
                {fmtCurrency(netWorth.fireflyTotal.toString(), currency)}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-medium text-accent-500">Total Net Worth</span>
              <span className="text-2xl font-mono font-bold text-accent-600 dark:text-accent-400">
                {fmtCurrency(netWorth.total.toString(), currency)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 3. Performance chart */}
      <PerformanceChart currency={currency} />

      {/* 4. Two-column row: Allocation chart + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Allocation donut chart */}
        <div className="rounded-2xl bg-card border border-border p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-foreground">Allocation</h2>
            <div className="flex items-center gap-1">
              <button onClick={() => setDonutTab('type')} className={filterBtn(donutTab === 'type')}>By Type</button>
              <button onClick={() => setDonutTab('asset')} className={filterBtn(donutTab === 'asset')}>By Asset</button>
            </div>
          </div>
          {(donutTab === 'type' ? donutData : donutByAsset).length === 0 ? (
            <div className="flex items-center justify-center h-[260px] text-muted-foreground text-sm">
              No holdings yet.
            </div>
          ) : (() => {
            const data = donutTab === 'type' ? donutData : donutByAsset
            return (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={data}
                    dataKey="value"
                    nameKey="name"
                    outerRadius={90}
                    innerRadius={55}
                    paddingAngle={2}
                  >
                    {data.map((_entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={DONUT_COLORS[index % DONUT_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<DonutTooltip currency={currency} />} />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: '0.75rem', paddingTop: '8px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )
          })()}
        </div>

        {/* Recent Activity */}
        <div className="rounded-2xl bg-card border border-border p-5 flex flex-col gap-3">
          <h2 className="text-base font-semibold text-foreground">Recent Activity</h2>
          {recentActivity.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No activity yet.</p>
          ) : (
            <div className="flex flex-col">
              {recentActivity.map((item) => {
                if (item.kind === 'transfer') {
                  const fromLabel = item.from_account_id !== null ? (accountMap.get(item.from_account_id) ?? 'External') : 'External'
                  const toLabel = item.to_account_id !== null ? (accountMap.get(item.to_account_id) ?? 'External') : 'External'
                  return (
                    <div
                      key={`transfer-${item.id}`}
                      className="flex items-center gap-3 py-2 border-b border-border last:border-0"
                    >
                      <ArrowLeftRight className="w-4 h-4 shrink-0 text-slate-400 dark:text-slate-500" />
                      <span className="text-sm text-foreground flex-1 min-w-0 truncate">
                        {fmtCurrency(item.amount, item.currency)}
                        <span className="text-muted-foreground text-xs ml-1">
                          {fromLabel} → {toLabel}
                        </span>
                      </span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {item.date.slice(0, 10)}
                      </span>
                    </div>
                  )
                } else {
                  const symbol = assetMap.get(item.asset_id) ?? `#${item.asset_id}`
                  const isBuy = item.operation === 'BUY'
                  return (
                    <div
                      key={`trade-${item.id}`}
                      className="flex items-center gap-3 py-2 border-b border-border last:border-0"
                    >
                      {isBuy ? (
                        <TrendingUp className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <TrendingDown className="w-4 h-4 shrink-0 text-rose-500 dark:text-rose-400" />
                      )}
                      <span className="text-sm text-foreground flex-1 min-w-0 truncate">
                        {symbol} — {item.operation} {fmtQty(item.quantity)}
                      </span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {item.date.slice(0, 10)}
                      </span>
                    </div>
                  )
                }
              })}
            </div>
          )}
          <div className="pt-1">
            <Link
              to="/transfers"
              className="text-sm text-[#6B8CAE] hover:text-[#4d6f8f] transition-colors"
            >
              View all transfers →
            </Link>
          </div>
        </div>
      </div>

    </motion.div>
  )
}
