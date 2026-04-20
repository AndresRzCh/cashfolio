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
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronsUpDown,
  Download,
  Pencil,
  Plus,
  SlidersHorizontal,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { PageTransition } from '@/components/PageTransition'
import { useAccounts } from '@/features/accounts/useAccounts'
import { useAuth } from '@/features/auth/AuthContext'
import {
  useTransfers,
  useCreateTransfer,
  useUpdateTransfer,
  useDeleteTransfer,
  useImportTransfers,
} from './useTransfers'
import type { Transfer, TransferCreate, TransferUpdate } from './types'

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
// Direction indicator
// ---------------------------------------------------------------------------

function fmtDecimal(val: string | null | undefined): string {
  if (val == null || val === '') return '—'
  const n = parseFloat(val)
  if (isNaN(n)) return val
  return n.toFixed(10).replace(/\.?0+$/, '') || '0'
}

function DirectionIcon({ fromId, toId }: { fromId: number | null; toId: number | null }) {
  if (fromId !== null && toId !== null) {
    return <ArrowLeftRight className="w-4 h-4 text-slate-400 shrink-0" />
  }
  if (toId !== null) {
    return <ArrowDownToLine className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
  }
  return <ArrowUpFromLine className="w-4 h-4 text-rose-500 dark:text-rose-400 shrink-0" />
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
  from_account_id: string
  to_account_id: string
  amount: string
  currency: string
  fee: string
  date: string
  note: string
}

function blankForm(defaultCurrency: string): FormState {
  return {
    from_account_id: '',
    to_account_id: '',
    amount: '',
    currency: defaultCurrency,
    fee: '',
    date: new Date().toISOString().slice(0, 10),
    note: '',
  }
}

function transferToForm(t: Transfer): FormState {
  return {
    from_account_id: t.from_account_id !== null ? String(t.from_account_id) : '',
    to_account_id: t.to_account_id !== null ? String(t.to_account_id) : '',
    amount: t.amount,
    currency: t.currency,
    fee: t.fee ?? '',
    date: t.date.slice(0, 10),
    note: t.note ?? '',
  }
}

function formToCreate(f: FormState): TransferCreate {
  return {
    from_account_id: f.from_account_id !== '' ? Number(f.from_account_id) : null,
    to_account_id: f.to_account_id !== '' ? Number(f.to_account_id) : null,
    amount: f.amount.trim(),
    currency: f.currency.trim().toUpperCase(),
    fee: f.fee.trim() || null,
    date: f.date,
    note: f.note.trim() || null,
  }
}

function formToUpdate(f: FormState): TransferUpdate {
  return {
    from_account_id: f.from_account_id !== '' ? Number(f.from_account_id) : null,
    to_account_id: f.to_account_id !== '' ? Number(f.to_account_id) : null,
    amount: f.amount.trim(),
    currency: f.currency.trim().toUpperCase(),
    fee: f.fee.trim() || null,
    date: f.date,
    note: f.note.trim() || null,
  }
}

// ---------------------------------------------------------------------------
// Inline transfer form
// ---------------------------------------------------------------------------

interface TransferFormProps {
  initial: FormState
  isPending: boolean
  onSubmit: (f: FormState) => void
  onCancel: () => void
  submitLabel: string
}

function TransferForm({ initial, isPending, onSubmit, onCancel, submitLabel }: TransferFormProps) {
  const [form, setForm] = useState<FormState>(initial)
  const { data: accounts = [] } = useAccounts()

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const bothNull = form.from_account_id === '' && form.to_account_id === ''
  const canSubmit = !bothNull && form.amount.trim() !== '' && form.currency.trim() !== '' && form.date !== '' && !isPending

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.18 }}
      className="rounded-2xl border border-accent-200 dark:border-accent-700/40 bg-accent-50/40 dark:bg-accent-900/10 p-4 space-y-4"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
            Date <span className="text-rose-500">*</span>
          </label>
          <input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} className={inputCls} autoFocus />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">From Account</label>
          <select value={form.from_account_id} onChange={(e) => set('from_account_id', e.target.value)} className={inputCls}>
            <option value="">External (deposit source)</option>
            {accounts.map((a) => <option key={a.id} value={String(a.id)}>{a.name}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">To Account</label>
          <select value={form.to_account_id} onChange={(e) => set('to_account_id', e.target.value)} className={inputCls}>
            <option value="">External (withdrawal destination)</option>
            {accounts.map((a) => <option key={a.id} value={String(a.id)}>{a.name}</option>)}
          </select>
        </div>
      </div>
      {bothNull && (
        <p className="text-xs text-rose-500 dark:text-rose-400 -mt-1">
          At least one of From Account or To Account must be set.
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
            Amount <span className="text-rose-500">*</span>
          </label>
          <input value={form.amount} onChange={(e) => set('amount', e.target.value)} placeholder="0.00" className={inputCls + ' font-mono'} inputMode="decimal" />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
            Currency <span className="text-rose-500">*</span>
          </label>
          <input value={form.currency} onChange={(e) => set('currency', e.target.value.toUpperCase())} placeholder="EUR" maxLength={10} className={inputCls + ' font-mono uppercase'} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
            Fee <span className="text-slate-400 font-normal">(optional)</span>
          </label>
          <input value={form.fee} onChange={(e) => set('fee', e.target.value)} placeholder="0.00" className={inputCls + ' font-mono'} inputMode="decimal" />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
            Note <span className="text-slate-400 font-normal">(optional)</span>
          </label>
          <input value={form.note} onChange={(e) => set('note', e.target.value)} placeholder="Optional note" className={inputCls} />
        </div>
      </div>
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

function exportTransfersCSV(transfers: Transfer[], accountLabel: (id: number | null) => string) {
  const headers = ['id', 'date', 'from_account', 'to_account', 'amount', 'currency', 'fee', 'note']
  const rows = transfers.map((t) =>
    [t.id, t.date.slice(0, 10), accountLabel(t.from_account_id), accountLabel(t.to_account_id), t.amount, t.currency, t.fee ?? '', t.note ?? ''].join(',')
  )
  const csv = [headers.join(','), ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'transfers.csv'
  a.click()
  URL.revokeObjectURL(url)
}

// ---------------------------------------------------------------------------
// TransfersPage
// ---------------------------------------------------------------------------

export function TransfersPage() {
  const { user } = useAuth()
  const defaultCurrency = user?.base_currency ?? 'EUR'

  const { data: transfers = [], isLoading } = useTransfers()
  const { data: accounts = [] } = useAccounts()
  const createTransfer = useCreateTransfer()
  const updateTransfer = useUpdateTransfer()
  const deleteTransfer = useDeleteTransfer()
  const importTransfers = useImportTransfers()

  const [mode, setMode] = useState<'idle' | 'adding' | { editing: number }>('idle')
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Filters
  const [filterOpen, setFilterOpen] = useState(false)
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [filterAccountId, setFilterAccountId] = useState('')

  // TanStack Table state
  const [sorting, setSorting] = useState<SortingState>([{ id: 'date', desc: true }])
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 25 })

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) { importTransfers.mutate(file); e.target.value = '' }
  }

  const isAdding = mode === 'adding'
  const editingId = typeof mode === 'object' ? mode.editing : null

  function accountName(id: number | null): string {
    if (id === null) return 'External'
    return accounts.find((a) => a.id === id)?.name ?? `#${id}`
  }

  function handleCreate(form: FormState) {
    createTransfer.mutate(formToCreate(form), { onSuccess: () => setMode('idle') })
  }
  function handleUpdate(id: number, form: FormState) {
    updateTransfer.mutate({ id, data: formToUpdate(form) }, { onSuccess: () => setMode('idle') })
  }
  function handleDelete() {
    if (deleteId === null) return
    deleteTransfer.mutate(deleteId, { onSuccess: () => setDeleteId(null) })
  }

  const hasFilters = filterDateFrom || filterDateTo || filterAccountId
  const filtered = useMemo(
    () => transfers.filter((t) => {
      if (filterDateFrom && t.date.slice(0, 10) < filterDateFrom) return false
      if (filterDateTo && t.date.slice(0, 10) > filterDateTo) return false
      if (filterAccountId) {
        const aid = Number(filterAccountId)
        if (t.from_account_id !== aid && t.to_account_id !== aid) return false
      }
      return true
    }),
    [transfers, filterDateFrom, filterDateTo, filterAccountId],
  )

  // Column definitions — closures capture accountName, isAdding, setMode, setDeleteId
  const columns = useMemo<ColumnDef<Transfer>[]>(
    () => [
      {
        id: 'direction',
        header: '',
        cell: ({ row }) => <DirectionIcon fromId={row.original.from_account_id} toId={row.original.to_account_id} />,
        enableSorting: false,
      },
      {
        accessorKey: 'date',
        header: 'Date',
        cell: ({ getValue }) => (getValue<string>()).slice(0, 10),
      },
      {
        id: 'from',
        header: 'From',
        accessorFn: (row) => accountName(row.from_account_id),
      },
      {
        id: 'to',
        header: 'To',
        accessorFn: (row) => accountName(row.to_account_id),
      },
      {
        accessorKey: 'amount',
        header: 'Amount',
        sortingFn: (a, b) => parseFloat(a.original.amount) - parseFloat(b.original.amount),
        cell: ({ getValue }) => fmtDecimal(getValue<string>()),
      },
      {
        accessorKey: 'currency',
        header: 'Currency',
        enableSorting: false,
      },
      {
        accessorKey: 'fee',
        header: 'Fee',
        cell: ({ getValue }) => fmtDecimal(getValue<string | null>()),
        enableSorting: false,
      },
      {
        accessorKey: 'note',
        header: 'Note',
        cell: ({ getValue }) => getValue<string | null>() ?? '—',
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
              aria-label="Edit transfer"
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={() => setDeleteId(row.original.id)}
              className={iconBtn + ' hover:text-rose-500 dark:hover:text-rose-400'}
              aria-label="Delete transfer"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accounts, isAdding],
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
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <ArrowLeftRight size={22} className="text-accent-500" />
              Transfers
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Record account-to-account money movements and external deposits or withdrawals.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
            <button onClick={() => fileInputRef.current?.click()} disabled={importTransfers.isPending} className={btnGhost}>
              <Upload size={15} />
              {importTransfers.isPending ? 'Importing…' : 'Import CSV'}
            </button>
            <button onClick={() => exportTransfersCSV(transfers, (id) => id === null ? '' : (accounts.find((a) => a.id === id)?.name ?? `#${id}`))} disabled={transfers.length === 0} className={btnGhost}>
              <Download size={15} />
              Export CSV
            </button>
            <button onClick={() => setMode('adding')} disabled={isAdding || editingId !== null} className={btnPrimary}>
              <Plus size={15} />
              Add Transfer
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
            Filters{hasFilters ? ` (${[filterDateFrom, filterDateTo, filterAccountId].filter(Boolean).length})` : ''}
          </button>
          {hasFilters && (
            <button
              onClick={() => { setFilterDateFrom(''); setFilterDateTo(''); setFilterAccountId('') }}
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
              className="rounded-2xl border border-border bg-muted/30 p-4 grid grid-cols-1 sm:grid-cols-3 gap-3"
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
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Account</label>
                <select value={filterAccountId} onChange={(e) => setFilterAccountId(e.target.value)} className={inputCls}>
                  <option value="">All accounts</option>
                  {accounts.map((a) => <option key={a.id} value={String(a.id)}>{a.name}</option>)}
                </select>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Add form */}
        <AnimatePresence>
          {isAdding && (
            <TransferForm
              key="form-add"
              initial={blankForm(defaultCurrency)}
              isPending={createTransfer.isPending}
              onSubmit={handleCreate}
              onCancel={() => setMode('idle')}
              submitLabel="Add transfer"
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
              <p className="flex-1 text-sm text-rose-700 dark:text-rose-400">Delete this transfer? This cannot be undone.</p>
              <button onClick={handleDelete} disabled={deleteTransfer.isPending} className="rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-xs font-medium px-3 py-1.5 transition-colors">
                {deleteTransfer.isPending ? 'Deleting…' : 'Delete'}
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
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id} className="border-b border-border bg-muted/50">
                    {hg.headers.map((header, i) => {
                      const canSort = header.column.getCanSort()
                      const sorted = header.column.getIsSorted()
                      const isNumeric = header.column.id === 'amount' || header.column.id === 'fee'
                      const isHiddenLg = header.column.id === 'fee'
                      const isHiddenXl = header.column.id === 'note'
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
                            i === 0 ? 'w-8' : '',
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
                        <ArrowLeftRight size={40} className="text-slate-300 dark:text-slate-600" />
                        <p className="font-medium text-slate-700 dark:text-slate-300">
                          {hasFilters ? 'No transfers match the current filters.' : 'No transfers yet'}
                        </p>
                        {!hasFilters && <p className="text-sm text-muted-foreground">Add your first transfer or import a CSV file.</p>}
                      </div>
                    </td>
                  </tr>
                )}
                {table.getRowModel().rows.map((row) => (
                  <Fragment key={row.id}>
                    {editingId === row.original.id ? (
                      <tr className="border-b border-border last:border-0">
                        <td colSpan={colCount} className="px-4 py-3">
                          <TransferForm
                            initial={transferToForm(row.original)}
                            isPending={updateTransfer.isPending}
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
                          const isNumeric = col === 'amount' || col === 'fee'
                          const isHiddenLg = col === 'fee'
                          const isHiddenXl = col === 'note'
                          return (
                            <td
                              key={cell.id}
                              className={[
                                'px-4 py-3',
                                isNumeric ? 'text-right font-mono text-slate-800 dark:text-slate-100' : '',
                                col === 'currency' ? 'font-mono text-xs text-slate-500 dark:text-slate-400' : '',
                                col === 'note' ? 'text-slate-500 dark:text-slate-400 text-xs max-w-[180px] truncate' : '',
                                col === 'fee' ? 'text-right font-mono text-slate-500 dark:text-slate-400' : '',
                                col === 'date' ? 'text-slate-700 dark:text-slate-300 whitespace-nowrap' : '',
                                col === 'from' || col === 'to' ? 'text-slate-700 dark:text-slate-300' : '',
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
              <ArrowLeftRight size={40} className="text-slate-300 dark:text-slate-600" />
              <p className="font-medium text-slate-700 dark:text-slate-300">
                {hasFilters ? 'No transfers match the current filters.' : 'No transfers yet'}
              </p>
              {!hasFilters && <p className="text-sm text-muted-foreground text-center">Add your first transfer or import a CSV file.</p>}
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
                    <DirectionIcon fromId={t.from_account_id} toId={t.to_account_id} />
                    <span className="font-mono font-medium text-slate-800 dark:text-slate-100">{fmtDecimal(t.amount)}</span>
                    <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{t.currency}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setMode({ editing: t.id })} className={iconBtn} aria-label="Edit transfer"><Pencil size={14} /></button>
                    <button onClick={() => setDeleteId(t.id)} className={iconBtn + ' hover:text-rose-500 dark:hover:text-rose-400'} aria-label="Delete transfer"><Trash2 size={14} /></button>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <span>{accountName(t.from_account_id)}</span>
                  <ArrowLeftRight size={12} className="shrink-0" />
                  <span>{accountName(t.to_account_id)}</span>
                </div>
                <div className="text-xs text-muted-foreground">{t.date.slice(0, 10)}</div>
                {editingId === t.id && (
                  <div className="pt-2">
                    <TransferForm
                      initial={transferToForm(t)}
                      isPending={updateTransfer.isPending}
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
