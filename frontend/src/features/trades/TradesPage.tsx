import { Fragment, useMemo, useRef, useState } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type PaginationState,
} from '@tanstack/react-table'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronsUpDown,
  Download,
  MessageSquare,
  Pencil,
  Plus,
  ShoppingCart,
  SlidersHorizontal,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { PageTransition } from '@/components/PageTransition'
import { useAccounts } from '@/features/accounts/useAccounts'
import { useAssets } from '@/features/assets/useAssets'
import { useAuth } from '@/features/auth/AuthContext'
import {
  useTrades,
  useCreateTrade,
  useUpdateTrade,
  useDeleteTrade,
  useImportTrades,
} from './useTrades'
import type { Trade, TradeCreate, TradeUpdate } from './types'

// ---------------------------------------------------------------------------
// Style helpers
// ---------------------------------------------------------------------------

const inputCls =
  'w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 ' +
  'px-3 py-2 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 ' +
  'outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-400/20 dark:focus:border-accent-400'

const btnPrimary =
  'inline-flex items-center gap-1.5 rounded-xl bg-accent-500 hover:bg-accent-600 disabled:bg-accent-300 ' +
  'dark:disabled:bg-accent-700 text-white text-sm font-medium px-4 py-2 transition-colors duration-150 ' +
  'focus:outline-none focus:ring-2 focus:ring-accent-400 focus:ring-offset-2 dark:focus:ring-offset-slate-900'

const btnGhost =
  'inline-flex items-center gap-1.5 rounded-xl border border-border text-sm font-medium px-3 py-2 ' +
  'text-slate-600 dark:text-slate-400 hover:bg-muted transition-colors duration-150 ' +
  'focus:outline-none focus:ring-2 focus:ring-accent-400 focus:ring-offset-2 dark:focus:ring-offset-slate-900'

const iconBtn =
  'p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-muted transition-colors duration-150'

// ---------------------------------------------------------------------------
// Operation badge
// ---------------------------------------------------------------------------

function fmtDecimal(val: string | null | undefined): string {
  if (val == null || val === '') return '—'
  const n = parseFloat(val)
  if (isNaN(n)) return val
  return n.toFixed(10).replace(/\.?0+$/, '') || '0'
}

function OperationBadge({ operation }: { operation: 'BUY' | 'SELL' }) {
  return (
    <span
      className={[
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold tracking-wide',
        operation === 'BUY'
          ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
          : 'bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400',
      ].join(' ')}
    >
      {operation}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Sort icon
// ---------------------------------------------------------------------------

function SortIcon({ sorted }: { sorted: false | 'asc' | 'desc' }) {
  if (sorted === 'asc') return <ChevronUp size={13} className="inline-block ml-1 text-accent-500" />
  if (sorted === 'desc') return <ChevronDown size={13} className="inline-block ml-1 text-accent-500" />
  return <ChevronsUpDown size={13} className="inline-block ml-1 text-slate-300 dark:text-slate-600" />
}

// ---------------------------------------------------------------------------
// Form state
// ---------------------------------------------------------------------------

interface FormState {
  date: string
  operation: 'BUY' | 'SELL'
  account_id: string
  asset_id: string
  quantity: string
  price_per_unit: string
  currency: string
  fee: string
  fee_currency: string
  note: string
}

function blankForm(defaultCurrency: string): FormState {
  return {
    date: new Date().toISOString().slice(0, 10),
    operation: 'BUY',
    account_id: '',
    asset_id: '',
    quantity: '',
    price_per_unit: '',
    currency: defaultCurrency,
    fee: '',
    fee_currency: '',
    note: '',
  }
}

function tradeToForm(t: Trade): FormState {
  return {
    date: t.date.slice(0, 10),
    operation: t.operation,
    account_id: String(t.account_id),
    asset_id: String(t.asset_id),
    quantity: t.quantity,
    price_per_unit: t.price_per_unit,
    currency: t.currency,
    fee: t.fee ?? '',
    fee_currency: t.fee_currency ?? '',
    note: t.note ?? '',
  }
}

function formToCreate(f: FormState): TradeCreate {
  return {
    date: f.date,
    operation: f.operation,
    account_id: Number(f.account_id),
    asset_id: Number(f.asset_id),
    quantity: f.quantity.trim(),
    price_per_unit: f.price_per_unit.trim(),
    currency: f.currency.trim().toUpperCase(),
    fee: f.fee.trim() || null,
    fee_currency: f.fee_currency.trim().toUpperCase() || null,
    note: f.note.trim() || null,
  }
}

function formToUpdate(f: FormState): TradeUpdate {
  return {
    date: f.date,
    operation: f.operation,
    account_id: Number(f.account_id),
    asset_id: Number(f.asset_id),
    quantity: f.quantity.trim(),
    price_per_unit: f.price_per_unit.trim(),
    currency: f.currency.trim().toUpperCase(),
    fee: f.fee.trim() || null,
    fee_currency: f.fee_currency.trim().toUpperCase() || null,
    note: f.note.trim() || null,
  }
}

// ---------------------------------------------------------------------------
// Inline trade form
// ---------------------------------------------------------------------------

interface TradeFormProps {
  initial: FormState
  isPending: boolean
  onSubmit: (f: FormState) => void
  onCancel: () => void
  submitLabel: string
}

function TradeForm({ initial, isPending, onSubmit, onCancel, submitLabel }: TradeFormProps) {
  const [form, setForm] = useState<FormState>(initial)
  const { data: accounts = [] } = useAccounts()
  const { data: assets = [] } = useAssets()

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const canSubmit =
    form.account_id !== '' &&
    form.asset_id !== '' &&
    form.quantity.trim() !== '' &&
    form.price_per_unit.trim() !== '' &&
    form.currency.trim() !== '' &&
    form.date !== '' &&
    !isPending

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.18 }}
      className="rounded-2xl border border-accent-200 dark:border-accent-700/40 bg-accent-50/40 dark:bg-accent-900/10 p-4 space-y-4"
    >
      {/* Row 1: Date + Operation toggle */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
            Date <span className="text-rose-500">*</span>
          </label>
          <input
            type="date"
            value={form.date}
            onChange={(e) => set('date', e.target.value)}
            className={inputCls}
            autoFocus
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
            Operation <span className="text-rose-500">*</span>
          </label>
          <div className="flex rounded-xl overflow-hidden border border-slate-200 dark:border-slate-600 h-[38px]">
            <button
              type="button"
              onClick={() => set('operation', 'BUY')}
              className={[
                'flex-1 text-sm font-semibold transition-colors duration-150',
                form.operation === 'BUY'
                  ? 'bg-emerald-500 text-white'
                  : 'bg-slate-50 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-600',
              ].join(' ')}
            >
              BUY
            </button>
            <button
              type="button"
              onClick={() => set('operation', 'SELL')}
              className={[
                'flex-1 text-sm font-semibold transition-colors duration-150',
                form.operation === 'SELL'
                  ? 'bg-rose-500 text-white'
                  : 'bg-slate-50 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-600',
              ].join(' ')}
            >
              SELL
            </button>
          </div>
        </div>
      </div>

      {/* Row 2: Account + Asset */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
            Account <span className="text-rose-500">*</span>
          </label>
          <select
            value={form.account_id}
            onChange={(e) => set('account_id', e.target.value)}
            className={inputCls}
          >
            <option value="">— Select account —</option>
            {accounts.map((a) => (
              <option key={a.id} value={String(a.id)}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
            Asset <span className="text-rose-500">*</span>
          </label>
          <select
            value={form.asset_id}
            onChange={(e) => set('asset_id', e.target.value)}
            className={inputCls}
          >
            <option value="">— Select asset —</option>
            {assets.map((a) => (
              <option key={a.id} value={String(a.id)}>
                {a.symbol} — {a.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Row 3: Quantity + Price per unit + Currency */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
            {form.operation === 'BUY' ? 'Qty to buy' : 'Qty to sell'}{' '}
            <span className="text-rose-500">*</span>
          </label>
          <input
            value={form.quantity}
            onChange={(e) => set('quantity', e.target.value)}
            placeholder="0.00"
            className={inputCls + ' font-mono'}
            inputMode="decimal"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
            Price per unit <span className="text-rose-500">*</span>
          </label>
          <input
            value={form.price_per_unit}
            onChange={(e) => set('price_per_unit', e.target.value)}
            placeholder="0.00"
            className={inputCls + ' font-mono'}
            inputMode="decimal"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
            Currency <span className="text-rose-500">*</span>
          </label>
          <input
            value={form.currency}
            onChange={(e) => set('currency', e.target.value.toUpperCase())}
            placeholder="EUR"
            maxLength={10}
            className={inputCls + ' font-mono uppercase'}
          />
        </div>
      </div>

      {/* Row 4: Fee + Fee Currency */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
            Fee <span className="text-slate-400 font-normal">(optional)</span>
          </label>
          <input
            value={form.fee}
            onChange={(e) => set('fee', e.target.value)}
            placeholder="0.00"
            className={inputCls + ' font-mono'}
            inputMode="decimal"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
            Fee Currency <span className="text-slate-400 font-normal">(optional)</span>
          </label>
          <input
            value={form.fee_currency}
            onChange={(e) => set('fee_currency', e.target.value.toUpperCase())}
            placeholder="EUR"
            maxLength={10}
            className={inputCls + ' font-mono uppercase'}
          />
        </div>
      </div>

      {/* Row 5: Note */}
      <div className="space-y-1">
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
          Note <span className="text-slate-400 font-normal">(optional)</span>
        </label>
        <input
          value={form.note}
          onChange={(e) => set('note', e.target.value)}
          placeholder="Optional note"
          className={inputCls}
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button onClick={() => onSubmit(form)} disabled={!canSubmit} className={btnPrimary}>
          <Check size={14} />
          {isPending ? 'Saving…' : submitLabel}
        </button>
        <button onClick={onCancel} className={btnGhost}>
          <X size={14} />
          Cancel
        </button>
      </div>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

function exportTradesCSV(
  trades: Trade[],
  accountName: (id: number) => string,
  assetSymbol: (id: number) => string,
) {
  const headers = [
    'id', 'date', 'account', 'operation', 'asset',
    'quantity', 'price_per_unit', 'currency', 'fee', 'fee_currency', 'note',
  ]
  const rows = trades.map((t) =>
    [
      t.id, t.date.slice(0, 10), accountName(t.account_id), t.operation, assetSymbol(t.asset_id),
      t.quantity, t.price_per_unit, t.currency, t.fee ?? '', t.fee_currency ?? '', t.note ?? '',
    ].join(',')
  )
  const csv = [headers.join(','), ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'trades.csv'
  a.click()
  URL.revokeObjectURL(url)
}

// ---------------------------------------------------------------------------
// TradesPage
// ---------------------------------------------------------------------------

export function TradesPage() {
  const { user } = useAuth()
  const defaultCurrency = user?.base_currency ?? 'EUR'

  const { data: trades = [], isLoading } = useTrades()
  const { data: accounts = [] } = useAccounts()
  const { data: assets = [] } = useAssets()
  const createTrade = useCreateTrade()
  const updateTrade = useUpdateTrade()
  const deleteTrade = useDeleteTrade()
  const importTrades = useImportTrades()

  const [mode, setMode] = useState<'idle' | 'adding' | { editing: number }>('idle')
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Filters
  const [filterOpen, setFilterOpen] = useState(false)
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [filterOperation, setFilterOperation] = useState<'' | 'BUY' | 'SELL'>('')
  const [filterAccountId, setFilterAccountId] = useState('')
  const [filterAssetId, setFilterAssetId] = useState('')

  // TanStack Table state
  const [sorting, setSorting] = useState<SortingState>([{ id: 'date', desc: true }])
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 25 })

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) { importTrades.mutate(file); e.target.value = '' }
  }

  const isAdding = mode === 'adding'
  const editingId = typeof mode === 'object' ? mode.editing : null

  function accountName(id: number): string {
    return accounts.find((a) => a.id === id)?.name ?? `#${id}`
  }

  function assetSymbol(id: number): string {
    return assets.find((a) => a.id === id)?.symbol ?? `#${id}`
  }

  function handleCreate(form: FormState) {
    createTrade.mutate(formToCreate(form), { onSuccess: () => setMode('idle') })
  }
  function handleUpdate(id: number, form: FormState) {
    updateTrade.mutate({ id, data: formToUpdate(form) }, { onSuccess: () => setMode('idle') })
  }
  function handleDelete() {
    if (deleteId === null) return
    deleteTrade.mutate(deleteId, { onSuccess: () => setDeleteId(null) })
  }

  const hasFilters = filterDateFrom || filterDateTo || filterOperation || filterAccountId || filterAssetId
  const filtered = useMemo(
    () => trades.filter((t) => {
      if (filterDateFrom && t.date.slice(0, 10) < filterDateFrom) return false
      if (filterDateTo && t.date.slice(0, 10) > filterDateTo) return false
      if (filterOperation && t.operation !== filterOperation) return false
      if (filterAccountId && t.account_id !== Number(filterAccountId)) return false
      if (filterAssetId && t.asset_id !== Number(filterAssetId)) return false
      return true
    }),
    [trades, filterDateFrom, filterDateTo, filterOperation, filterAccountId, filterAssetId],
  )

  // Column definitions
  const columns = useMemo<ColumnDef<Trade>[]>(
    () => [
      {
        accessorKey: 'date',
        header: 'Date',
        cell: ({ getValue }) => (getValue<string>()).slice(0, 10),
      },
      {
        accessorKey: 'operation',
        header: 'Operation',
        cell: ({ getValue }) => <OperationBadge operation={getValue<'BUY' | 'SELL'>()} />,
        sortingFn: (a, b) => a.original.operation.localeCompare(b.original.operation),
      },
      {
        id: 'asset',
        header: 'Asset',
        accessorFn: (row) => assetSymbol(row.asset_id),
        cell: ({ row }) => assetSymbol(row.original.asset_id),
      },
      {
        id: 'account',
        header: 'Account',
        accessorFn: (row) => accountName(row.account_id),
      },
      {
        accessorKey: 'quantity',
        header: 'Qty',
        sortingFn: (a, b) => parseFloat(a.original.quantity) - parseFloat(b.original.quantity),
        cell: ({ getValue }) => fmtDecimal(getValue<string>()),
      },
      {
        accessorKey: 'price_per_unit',
        header: 'Price/unit',
        sortingFn: (a, b) => parseFloat(a.original.price_per_unit) - parseFloat(b.original.price_per_unit),
        cell: ({ getValue }) => fmtDecimal(getValue<string>()),
      },
      {
        accessorKey: 'currency',
        header: 'Ccy',
        enableSorting: false,
        cell: ({ getValue }) => {
          const ccy = getValue<string>()
          const isForeign = ccy !== defaultCurrency
          return (
            <span
              className={
                isForeign
                  ? 'inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-mono font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                  : 'inline-flex items-center px-1.5 py-0.5 text-xs font-mono text-slate-500 dark:text-slate-400'
              }
            >
              {ccy}
            </span>
          )
        },
      },
      {
        accessorKey: 'fee',
        header: 'Fee',
        cell: ({ row }) =>
          row.original.fee != null
            ? `${fmtDecimal(row.original.fee)}${row.original.fee_currency ? ' ' + row.original.fee_currency : ''}`
            : '—',
        enableSorting: false,
      },
      {
        accessorKey: 'note',
        header: '',
        cell: ({ getValue }) => {
          const note = getValue<string | null>()
          if (!note) return null
          return (
            <span title={note} className="flex justify-center cursor-default">
              <MessageSquare className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
            </span>
          )
        },
        enableSorting: false,
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <button
              onClick={() => setMode({ editing: row.original.id })}
              disabled={isAdding}
              className={iconBtn}
              aria-label="Edit trade"
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={() => setDeleteId(row.original.id)}
              className={iconBtn + ' hover:text-rose-500 dark:hover:text-rose-400'}
              aria-label="Delete trade"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accounts, assets, isAdding, defaultCurrency],
  )

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    autoResetPageIndex: false,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })

  const colCount = columns.length

  return (
    <PageTransition>
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <ShoppingCart size={22} className="text-accent-500" />
              Trades
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Record asset purchases and sales.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
            <button onClick={() => fileInputRef.current?.click()} disabled={importTrades.isPending} className={btnGhost}>
              <Upload size={15} />
              {importTrades.isPending ? 'Importing…' : 'Import CSV'}
            </button>
            <button onClick={() => exportTradesCSV(trades, accountName, assetSymbol)} disabled={trades.length === 0} className={btnGhost}>
              <Download size={15} />
              Export CSV
            </button>
            <button onClick={() => setMode('adding')} disabled={isAdding || editingId !== null} className={btnPrimary}>
              <Plus size={15} />
              Add Trade
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilterOpen((o) => !o)}
            className={[btnGhost, hasFilters ? 'border-accent-400 text-accent-600 dark:text-accent-300' : ''].join(' ')}
          >
            <SlidersHorizontal size={15} />
            Filters{hasFilters ? ` (${[filterDateFrom, filterDateTo, filterOperation, filterAccountId, filterAssetId].filter(Boolean).length})` : ''}
          </button>
          {hasFilters && (
            <button
              onClick={() => { setFilterDateFrom(''); setFilterDateTo(''); setFilterOperation(''); setFilterAccountId(''); setFilterAssetId('') }}
              className="text-xs text-muted-foreground hover:text-slate-700 dark:hover:text-slate-200 flex items-center gap-1"
            >
              <X size={12} /> Clear
            </button>
          )}
        </div>

        <AnimatePresence>
          {filterOpen && (
            <motion.div
              initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
              className="rounded-2xl border border-border bg-muted/30 p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3"
            >
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">From date</label>
                <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} className={inputCls} />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">To date</label>
                <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} className={inputCls} />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Operation</label>
                <select value={filterOperation} onChange={(e) => setFilterOperation(e.target.value as '' | 'BUY' | 'SELL')} className={inputCls}>
                  <option value="">All</option>
                  <option value="BUY">BUY</option>
                  <option value="SELL">SELL</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Account</label>
                <select value={filterAccountId} onChange={(e) => setFilterAccountId(e.target.value)} className={inputCls}>
                  <option value="">All accounts</option>
                  {accounts.map((a) => <option key={a.id} value={String(a.id)}>{a.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Asset</label>
                <select value={filterAssetId} onChange={(e) => setFilterAssetId(e.target.value)} className={inputCls}>
                  <option value="">All assets</option>
                  {assets.map((a) => <option key={a.id} value={String(a.id)}>{a.symbol}</option>)}
                </select>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Add form */}
        <AnimatePresence>
          {isAdding && (
            <TradeForm
              key="form-add"
              initial={blankForm(defaultCurrency)}
              isPending={createTrade.isPending}
              onSubmit={handleCreate}
              onCancel={() => setMode('idle')}
              submitLabel="Add trade"
            />
          )}
        </AnimatePresence>

        {/* Delete confirmation */}
        <AnimatePresence>
          {deleteId !== null && (
            <motion.div
              initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="flex items-center gap-3 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 px-4 py-3"
            >
              <p className="flex-1 text-sm text-rose-700 dark:text-rose-400">
                Delete this trade? This cannot be undone.
              </p>
              <button onClick={handleDelete} disabled={deleteTrade.isPending} className="rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-xs font-medium px-3 py-1.5 transition-colors">
                {deleteTrade.isPending ? 'Deleting…' : 'Delete'}
              </button>
              <button onClick={() => setDeleteId(null)} className="rounded-lg border border-border text-xs font-medium px-3 py-1.5 text-slate-600 dark:text-slate-400 hover:bg-muted transition-colors">
                Cancel
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Table — desktop (TanStack Table) */}
        <div className="hidden sm:block rounded-2xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead>
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id} className="border-b border-border bg-muted/50">
                    {hg.headers.map((header, i) => {
                      const canSort = header.column.getCanSort()
                      const sorted = header.column.getIsSorted()
                      const col = header.column.id
                      const isNumeric = col === 'quantity' || col === 'price_per_unit' || col === 'fee'
                      const isHiddenLg = col === 'fee'
                      const isHiddenXl = col === 'note'
                      return (
                        <th
                          key={header.id}
                          onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                          className={[
                            'px-4 py-2.5 font-medium text-muted-foreground text-sm whitespace-nowrap',
                            isNumeric ? 'text-right' : 'text-left',
                            canSort ? 'cursor-pointer select-none hover:text-foreground transition-colors' : '',
                            isHiddenLg ? 'hidden lg:table-cell' : '',
                            isHiddenXl ? 'hidden xl:table-cell' : '',
                            i === colCount - 1 ? 'w-20' : '',
                          ].join(' ')}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {canSort && <SortIcon sorted={sorted} />}
                        </th>
                      )
                    })}
                  </tr>
                ))}
              </thead>
              <tbody>
                {isLoading && (
                  <tr><td colSpan={colCount} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
                )}
                {!isLoading && table.getRowModel().rows.length === 0 && !isAdding && (
                  <tr>
                    <td colSpan={colCount} className="px-4 py-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <ShoppingCart size={40} className="text-slate-300 dark:text-slate-600" />
                        <p className="font-medium text-slate-700 dark:text-slate-300">
                          {hasFilters ? 'No trades match the current filters.' : 'No trades yet'}
                        </p>
                        {!hasFilters && (
                          <p className="text-sm text-muted-foreground">Add your first trade or import a CSV file.</p>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
                {table.getRowModel().rows.map((row) => (
                  <Fragment key={row.id}>
                    {editingId === row.original.id ? (
                      <tr className="border-b border-border last:border-0">
                        <td colSpan={colCount} className="px-4 py-3">
                          <TradeForm
                            initial={tradeToForm(row.original)}
                            isPending={updateTrade.isPending}
                            onSubmit={(f) => handleUpdate(row.original.id, f)}
                            onCancel={() => setMode('idle')}
                            submitLabel="Save changes"
                          />
                        </td>
                      </tr>
                    ) : (
                      <tr className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors">
                        {row.getVisibleCells().map((cell) => {
                          const col = cell.column.id
                          const isNumeric = col === 'quantity' || col === 'price_per_unit' || col === 'fee'
                          const isHiddenLg = col === 'fee'
                          const isHiddenXl = col === 'note'
                          return (
                            <td
                              key={cell.id}
                              className={[
                                'px-4 py-3',
                                isNumeric ? 'text-right font-mono text-slate-800 dark:text-slate-100' : '',
                                col === 'fee' ? 'text-right font-mono text-slate-500 dark:text-slate-400 text-xs' : '',
                                col === 'currency' ? '' : '',
                                col === 'note' ? 'text-slate-500 dark:text-slate-400 text-xs max-w-[160px] truncate' : '',
                                col === 'date' ? 'text-slate-700 dark:text-slate-300 whitespace-nowrap' : '',
                                col === 'asset' ? 'font-mono font-medium text-slate-800 dark:text-slate-100' : '',
                                col === 'account' ? 'text-slate-700 dark:text-slate-300 text-xs' : '',
                                isHiddenLg ? 'hidden lg:table-cell' : '',
                                isHiddenXl ? 'hidden xl:table-cell' : '',
                              ].join(' ')}
                            >
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </td>
                          )
                        })}
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {filtered.length > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/30 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <span>Rows per page</span>
                <select
                  value={pagination.pageSize}
                  onChange={(e) => setPagination({ pageIndex: 0, pageSize: Number(e.target.value) })}
                  className="rounded-lg border border-border bg-background px-2 py-1 text-xs"
                >
                  {[25, 50, 100].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-3">
                <span>
                  {pagination.pageIndex * pagination.pageSize + 1}–
                  {Math.min((pagination.pageIndex + 1) * pagination.pageSize, filtered.length)} of {filtered.length}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => table.previousPage()}
                    disabled={!table.getCanPreviousPage()}
                    className="p-1 rounded-lg hover:bg-muted disabled:opacity-40 transition-colors"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    onClick={() => table.nextPage()}
                    disabled={!table.getCanNextPage()}
                    className="p-1 rounded-lg hover:bg-muted disabled:opacity-40 transition-colors"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Mobile card list (≤640px) */}
        <div className="sm:hidden space-y-3">
          {isLoading && <p className="text-center text-muted-foreground py-8">Loading…</p>}
          {!isLoading && filtered.length === 0 && !isAdding && (
            <div className="flex flex-col items-center gap-3 py-16">
              <ShoppingCart size={40} className="text-slate-300 dark:text-slate-600" />
              <p className="font-medium text-slate-700 dark:text-slate-300">
                {hasFilters ? 'No trades match the current filters.' : 'No trades yet'}
              </p>
              {!hasFilters && (
                <p className="text-sm text-muted-foreground text-center">Add your first trade or import a CSV file.</p>
              )}
            </div>
          )}
          <AnimatePresence initial={false}>
            {filtered.map((t) => (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15 }}
                className="rounded-2xl border border-border bg-card p-4 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <OperationBadge operation={t.operation} />
                    <span className="font-mono font-medium text-slate-800 dark:text-slate-100">
                      {assetSymbol(t.asset_id)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setMode({ editing: t.id })} className={iconBtn} aria-label="Edit trade">
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => setDeleteId(t.id)}
                      className={iconBtn + ' hover:text-rose-500 dark:hover:text-rose-400'}
                      aria-label="Delete trade"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-mono text-slate-800 dark:text-slate-100">{fmtDecimal(t.quantity)}</span>
                  <span className="text-muted-foreground text-xs">×</span>
                  <span className="font-mono text-slate-700 dark:text-slate-300">{fmtDecimal(t.price_per_unit)}</span>
                  <span
                    className={
                      t.currency !== defaultCurrency
                        ? 'inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-mono font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                        : 'font-mono text-xs text-slate-500 dark:text-slate-400'
                    }
                  >
                    {t.currency}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{accountName(t.account_id)} · {t.date.slice(0, 10)}</span>
                  {t.note && (
                    <span title={t.note} className="flex items-center cursor-default">
                      <MessageSquare className="w-3 h-3 text-slate-400 dark:text-slate-500" />
                    </span>
                  )}
                </div>
                {editingId === t.id && (
                  <div className="pt-2">
                    <TradeForm
                      initial={tradeToForm(t)}
                      isPending={updateTrade.isPending}
                      onSubmit={(f) => handleUpdate(t.id, f)}
                      onCancel={() => setMode('idle')}
                      submitLabel="Save changes"
                    />
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </PageTransition>
  )
}
