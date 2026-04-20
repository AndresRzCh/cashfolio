import { useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Download, RefreshCw, Trash2, Upload } from 'lucide-react'
import { exportFxRates, useDeleteFxRate, useFetchFxRates, useFxRates, useImportFxRates } from './useFxRates'

// ---------------------------------------------------------------------------
// Style helpers (mirrored from AssetsSettings / SettingsPage)
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
// FxRatesSettings component
// ---------------------------------------------------------------------------

export function FxRatesSettings() {
  const fileRef = useRef<HTMLInputElement>(null)

  // Filter / fetch form state
  const [fromCurrency, setFromCurrency] = useState('')
  const [toCurrency, setToCurrency] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // Only query when both currencies are filled (>=2 chars)
  const shouldQuery = fromCurrency.length >= 2 && toCurrency.length >= 2

  const { data: rates = [], isLoading } = useFxRates(
    shouldQuery ? fromCurrency : undefined,
    shouldQuery ? toCurrency : undefined,
  )

  const fetchMutation = useFetchFxRates()
  const importMutation = useImportFxRates()
  const deleteMutation = useDeleteFxRate()

  const [importErrors, setImportErrors] = useState<Array<{ row: number; error: string }>>([])
  const [deleteId, setDeleteId] = useState<number | null>(null)

  // Sort by date desc for display
  const sorted = [...rates].sort((a, b) => b.date.localeCompare(a.date))

  function handleFetch() {
    if (!fromCurrency.trim() || !toCurrency.trim() || !startDate || !endDate) return
    fetchMutation.mutate({
      from_currency: fromCurrency.trim().toUpperCase(),
      to_currency: toCurrency.trim().toUpperCase(),
      start_date: startDate,
      end_date: endDate,
    })
  }

  function handleImportChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportErrors([])
    importMutation.mutate(file, {
      onSuccess: (data) => {
        setImportErrors(data.errors)
        if (fileRef.current) fileRef.current.value = ''
      },
      onError: () => {
        if (fileRef.current) fileRef.current.value = ''
      },
    })
  }

  function handleDelete() {
    if (deleteId === null) return
    deleteMutation.mutate(deleteId, {
      onSuccess: () => setDeleteId(null),
    })
  }

  const canFetch =
    fromCurrency.trim().length >= 2 &&
    toCurrency.trim().length >= 2 &&
    startDate !== '' &&
    endDate !== '' &&
    !fetchMutation.isPending

  return (
    <section className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Currency Rates</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Historical exchange rates used for multi-currency cost basis.
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-end">
        {/* From currency */}
        <div className="space-y-1 w-24">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">From</label>
          <input
            value={fromCurrency}
            onChange={(e) => setFromCurrency(e.target.value.toUpperCase().slice(0, 10))}
            placeholder="USD"
            className={inputCls + ' font-mono'}
            spellCheck={false}
          />
        </div>

        {/* To currency */}
        <div className="space-y-1 w-24">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">To</label>
          <input
            value={toCurrency}
            onChange={(e) => setToCurrency(e.target.value.toUpperCase().slice(0, 10))}
            placeholder="EUR"
            className={inputCls + ' font-mono'}
            spellCheck={false}
          />
        </div>

        {/* Start date */}
        <div className="space-y-1 w-36">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Start date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className={inputCls}
          />
        </div>

        {/* End date */}
        <div className="space-y-1 w-36">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">End date</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className={inputCls}
          />
        </div>

        {/* Action buttons */}
        <div className="flex items-end gap-2 flex-wrap">
          <button
            onClick={handleFetch}
            disabled={!canFetch}
            className={btnPrimary}
          >
            <RefreshCw size={14} className={fetchMutation.isPending ? 'animate-spin' : ''} />
            {fetchMutation.isPending ? 'Fetching…' : 'Fetch from Frankfurter'}
          </button>

          <button
            onClick={() => exportFxRates()}
            className={btnGhost}
          >
            <Download size={14} />
            Export CSV
          </button>

          {/* Hidden file input */}
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleImportChange}
            aria-label="Import FX rates CSV"
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={importMutation.isPending}
            className={btnGhost}
          >
            {importMutation.isPending
              ? <RefreshCw size={14} className="animate-spin" />
              : <Upload size={14} />}
            {importMutation.isPending ? 'Importing…' : 'Import CSV'}
          </button>
        </div>
      </div>

      {/* Import errors */}
      <AnimatePresence>
        {importErrors.length > 0 && (
          <motion.ul
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="text-xs text-rose-600 dark:text-rose-400 list-disc list-inside space-y-0.5 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 px-4 py-3"
          >
            {importErrors.map((err) => (
              <li key={err.row}>Row {err.row}: {err.error}</li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>

      {/* Delete confirmation */}
      <AnimatePresence>
        {deleteId !== null && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-3 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 px-4 py-3"
          >
            <p className="flex-1 text-sm text-rose-700 dark:text-rose-400">
              Delete this rate entry? This cannot be undone.
            </p>
            <button
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-xs font-medium px-3 py-1.5 transition-colors"
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </button>
            <button
              onClick={() => setDeleteId(null)}
              className="rounded-lg border border-border text-xs font-medium px-3 py-1.5 text-slate-600 dark:text-slate-400 hover:bg-muted transition-colors"
            >
              Cancel
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Desktop table */}
      <div className="hidden sm:block rounded-2xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Date</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">From</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">To</th>
              <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Rate</th>
              <th className="px-4 py-2.5 w-12" />
            </tr>
          </thead>
          <tbody>
            {!shouldQuery && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  Enter currencies above to browse rates.
                </td>
              </tr>
            )}
            {shouldQuery && isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {shouldQuery && !isLoading && sorted.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No rates cached yet — use Fetch to pull from Frankfurter.
                </td>
              </tr>
            )}
            {shouldQuery && sorted.map((r) => (
              <tr
                key={r.id}
                className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors"
              >
                <td className="px-4 py-3 font-mono text-slate-700 dark:text-slate-300">{r.date}</td>
                <td className="px-4 py-3 font-mono font-medium text-slate-800 dark:text-slate-100">
                  {r.from_currency}
                </td>
                <td className="px-4 py-3 font-mono font-medium text-slate-800 dark:text-slate-100">
                  {r.to_currency}
                </td>
                <td className="px-4 py-3 text-right font-mono text-slate-800 dark:text-slate-100">
                  {parseFloat(r.rate).toFixed(6)}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => setDeleteId(r.id)}
                    className={iconBtn + ' hover:text-rose-500 dark:hover:text-rose-400'}
                    aria-label="Delete rate"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-2">
        {!shouldQuery && (
          <p className="text-sm text-muted-foreground text-center py-6">
            Enter currencies above to browse rates.
          </p>
        )}
        {shouldQuery && isLoading && (
          <p className="text-sm text-muted-foreground text-center py-6">Loading…</p>
        )}
        {shouldQuery && !isLoading && sorted.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">
            No rates cached yet — use Fetch to pull from Frankfurter.
          </p>
        )}
        {shouldQuery && sorted.map((r) => (
          <div
            key={r.id}
            className="rounded-2xl border border-border bg-card p-4 flex items-center justify-between gap-3"
          >
            <div className="space-y-0.5 min-w-0">
              <p className="text-xs text-muted-foreground font-mono">{r.date}</p>
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100 font-mono">
                {r.from_currency} → {r.to_currency}
              </p>
              <p className="text-sm font-mono text-slate-700 dark:text-slate-300">
                {parseFloat(r.rate).toFixed(6)}
              </p>
            </div>
            <button
              onClick={() => setDeleteId(r.id)}
              className={iconBtn + ' hover:text-rose-500 dark:hover:text-rose-400 shrink-0'}
              aria-label="Delete rate"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}
