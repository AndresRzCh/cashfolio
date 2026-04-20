import { Fragment, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Download, Pencil, Plus, RefreshCw, Trash2, Upload, X } from 'lucide-react'
import {
  exportPriceCache,
  useAssets,
  useCreateAsset,
  useDeleteAsset,
  useImportPriceCache,
  useRefreshAssetPrice,
  useUpdateAsset,
  useUploadCustomPrices,
} from './useAssets'
import { PRICE_SOURCES } from './types'
import type { Asset, AssetCreate, AssetUpdate } from './types'

// ---------------------------------------------------------------------------
// Style helpers (mirror SettingsPage conventions)
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
// Props
// ---------------------------------------------------------------------------

interface AssetsSettingsProps {
  assetTypes: Array<{ id: number; name: string }>
}

// ---------------------------------------------------------------------------
// Blank form state
// ---------------------------------------------------------------------------

interface FormState {
  symbol: string
  name: string
  asset_type_id: string // select value as string, convert on submit
  price_source: Asset['price_source']
  external_id: string
}

function blankForm(): FormState {
  return {
    symbol: '',
    name: '',
    asset_type_id: '',
    price_source: 'none',
    external_id: '',
  }
}

function assetToForm(a: Asset): FormState {
  return {
    symbol: a.symbol,
    name: a.name,
    asset_type_id: a.asset_type_id !== null ? String(a.asset_type_id) : '',
    price_source: a.price_source,
    external_id: a.external_id ?? '',
  }
}

function formToCreate(f: FormState): AssetCreate {
  return {
    symbol: f.symbol.trim().toUpperCase(),
    name: f.name.trim(),
    asset_type_id: f.asset_type_id !== '' ? Number(f.asset_type_id) : null,
    price_source: f.price_source,
    external_id: f.external_id.trim() || null,
  }
}

function formToUpdate(f: FormState): AssetUpdate {
  return {
    symbol: f.symbol.trim().toUpperCase(),
    name: f.name.trim(),
    asset_type_id: f.asset_type_id !== '' ? Number(f.asset_type_id) : null,
    price_source: f.price_source,
    external_id: f.external_id.trim() || null,
  }
}

// ---------------------------------------------------------------------------
// External ID label helper
// ---------------------------------------------------------------------------

function externalIdLabel(src: Asset['price_source']): string {
  if (src === 'binance') return 'Binance Symbol (e.g. BTC)'
  if (src === 'yfinance') return 'Yahoo Finance Ticker'
  return 'External ID'
}

// ---------------------------------------------------------------------------
// Inline asset form (add or edit)
// ---------------------------------------------------------------------------

interface AssetFormProps {
  initial: FormState
  assetTypes: Array<{ id: number; name: string }>
  isPending: boolean
  onSubmit: (f: FormState) => void
  onCancel: () => void
  submitLabel: string
}

function AssetForm({ initial, assetTypes, isPending, onSubmit, onCancel, submitLabel }: AssetFormProps) {
  const [form, setForm] = useState<FormState>(initial)

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const showExternalId = form.price_source === 'binance' || form.price_source === 'yfinance'
  const canSubmit = form.symbol.trim() !== '' && form.name.trim() !== '' && !isPending

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.18 }}
      className="rounded-2xl border border-accent-200 dark:border-accent-700/40 bg-accent-50/40 dark:bg-accent-900/10 p-4 space-y-4"
    >
      {/* Row 1: Symbol + Name */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
            Symbol <span className="text-rose-500">*</span>
          </label>
          <input
            value={form.symbol}
            onChange={(e) => set('symbol', e.target.value.toUpperCase())}
            placeholder="BTC"
            className={inputCls + ' font-mono'}
            autoFocus
            spellCheck={false}
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
            Name <span className="text-rose-500">*</span>
          </label>
          <input
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="Bitcoin"
            className={inputCls}
          />
        </div>
      </div>

      {/* Row 2: Asset Type + Price Source */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
            Asset Type
          </label>
          <select
            value={form.asset_type_id}
            onChange={(e) => set('asset_type_id', e.target.value)}
            className={inputCls}
          >
            <option value="">— None —</option>
            {assetTypes.map((at) => (
              <option key={at.id} value={String(at.id)}>
                {at.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
            Price Source
          </label>
          <select
            value={form.price_source}
            onChange={(e) => {
              set('price_source', e.target.value as Asset['price_source'])
              // clear external_id when switching away from sources that use it
              if (e.target.value !== 'binance' && e.target.value !== 'yfinance') {
                set('external_id', '')
              }
            }}
            className={inputCls}
          >
            {PRICE_SOURCES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Row 3: External ID (conditional) */}
      {showExternalId && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              {externalIdLabel(form.price_source)}
            </label>
            <input
              value={form.external_id}
              onChange={(e) => set('external_id', e.target.value)}
              placeholder={form.price_source === 'binance' ? 'BTC' : 'AAPL'}
              className={inputCls + ' font-mono'}
              spellCheck={false}
            />
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={() => onSubmit(form)}
          disabled={!canSubmit}
          className={btnPrimary}
        >
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
// Upload CSV button (per-row, custom price source)
// ---------------------------------------------------------------------------

interface UploadCsvButtonProps {
  assetId: number
}

function UploadCsvButton({ assetId }: UploadCsvButtonProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const upload = useUploadCustomPrices()
  const [result, setResult] = useState<{ imported: number; errors: string[] } | null>(null)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setResult(null)
    upload.mutate(
      { id: assetId, file },
      {
        onSuccess: (data) => {
          setResult(data)
          // reset file input so the same file can be re-selected
          if (fileRef.current) fileRef.current.value = ''
        },
        onError: () => {
          setResult({ imported: 0, errors: ['Upload failed. Please try again.'] })
          if (fileRef.current) fileRef.current.value = ''
        },
      },
    )
  }

  return (
    <div className="flex flex-col items-start gap-1 min-w-0">
      <input
        ref={fileRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={handleChange}
        aria-label="Upload CSV"
      />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={upload.isPending}
        className={iconBtn}
        title="Upload custom price CSV"
      >
        {upload.isPending
          ? <RefreshCw size={14} className="animate-spin" />
          : <Upload size={14} />}
      </button>
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: -2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="max-w-xs"
          >
            {result.errors.length === 0 ? (
              <p className="text-xs text-emerald-700 dark:text-emerald-400">
                Imported {result.imported} row{result.imported !== 1 ? 's' : ''}.
              </p>
            ) : (
              <ul className="text-xs text-rose-600 dark:text-rose-400 list-disc list-inside space-y-0.5">
                {result.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Price history buttons (refresh/backfill + export + import)
// ---------------------------------------------------------------------------

interface HistoryButtonsProps {
  asset: import('./types').Asset
}

function HistoryButtons({ asset }: HistoryButtonsProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const refresh = useRefreshAssetPrice()
  const importCache = useImportPriceCache()
  const [importResult, setImportResult] = useState<{ imported: number; errors: string[] } | null>(null)

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportResult(null)
    importCache.mutate(
      { id: asset.id, file },
      {
        onSuccess: (data) => {
          setImportResult(data)
          if (fileRef.current) fileRef.current.value = ''
        },
        onError: () => {
          setImportResult({ imported: 0, errors: ['Import failed. Please try again.'] })
          if (fileRef.current) fileRef.current.value = ''
        },
      },
    )
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleImport} />
      <div className="flex items-center gap-1 flex-wrap justify-end">
        {asset.price_source !== 'none' && (
          <button
            onClick={() => refresh.mutate(asset.id)}
            disabled={refresh.isPending}
            className={iconBtn}
            title="Backfill price history from earliest trade date"
          >
            <RefreshCw size={14} className={refresh.isPending ? 'animate-spin' : ''} />
          </button>
        )}
        <button
          onClick={() => exportPriceCache(asset.id)}
          className={iconBtn}
          title="Export price history CSV"
        >
          <Download size={14} />
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={importCache.isPending}
          className={iconBtn}
          title="Import price history CSV (date,price)"
        >
          {importCache.isPending
            ? <RefreshCw size={14} className="animate-spin" />
            : <Upload size={14} />}
        </button>
      </div>
      <AnimatePresence>
        {importResult && (
          <motion.div
            initial={{ opacity: 0, y: -2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {importResult.errors.length === 0 ? (
              <p className="text-xs text-emerald-700 dark:text-emerald-400">
                Imported {importResult.imported} row{importResult.imported !== 1 ? 's' : ''}.
              </p>
            ) : (
              <ul className="text-xs text-rose-600 dark:text-rose-400 list-disc list-inside space-y-0.5">
                {importResult.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AssetsSettings({ assetTypes }: AssetsSettingsProps) {
  const { data: assets = [], isLoading } = useAssets()
  const createAsset = useCreateAsset()
  const updateAsset = useUpdateAsset()
  const deleteAsset = useDeleteAsset()

  const [mode, setMode] = useState<'idle' | 'adding' | { editing: number }>('idle')
  const [deleteId, setDeleteId] = useState<number | null>(null)

  function assetTypeName(id: number | null): string {
    if (id === null) return '—'
    return assetTypes.find((at) => at.id === id)?.name ?? '—'
  }

  function priceSourceLabel(src: Asset['price_source']): string {
    return PRICE_SOURCES.find((s) => s.value === src)?.label ?? src
  }

  function handleCreate(form: FormState) {
    createAsset.mutate(formToCreate(form), {
      onSuccess: () => setMode('idle'),
    })
  }

  function handleUpdate(id: number, form: FormState) {
    updateAsset.mutate(
      { id, data: formToUpdate(form) },
      { onSuccess: () => setMode('idle') },
    )
  }

  function handleDelete() {
    if (deleteId === null) return
    deleteAsset.mutate(deleteId, {
      onSuccess: () => setDeleteId(null),
    })
  }

  const isAdding = mode === 'adding'
  const editingId = typeof mode === 'object' ? mode.editing : null

  return (
    <section className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Assets</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage assets, price sources, and icons.
          </p>
        </div>
        <button
          onClick={() => setMode('adding')}
          disabled={isAdding || editingId !== null}
          className={btnGhost}
        >
          <Plus size={15} />
          Add asset
        </button>
      </div>

      {/* Delete confirmation banner */}
      <AnimatePresence>
        {deleteId !== null && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-3 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 px-4 py-3"
          >
            <p className="flex-1 text-sm text-rose-700 dark:text-rose-400">
              Delete this asset? This cannot be undone.
            </p>
            <button
              onClick={handleDelete}
              disabled={deleteAsset.isPending}
              className="rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-xs font-medium px-3 py-1.5 transition-colors"
            >
              {deleteAsset.isPending ? 'Deleting…' : 'Delete'}
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

      {/* Table */}
      <div className="rounded-2xl border border-border overflow-hidden">
        <div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Symbol</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Name</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">
                  Type
                </th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden lg:table-cell">
                  Price Source
                </th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">
                  Current Price
                </th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground hidden xl:table-cell">
                  History
                </th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              )}
              {!isLoading && assets.length === 0 && !isAdding && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                    No assets yet. Add one below.
                  </td>
                </tr>
              )}

              {assets.map((asset) => (
                <Fragment key={asset.id}>
                  {/* Normal or edit-mode row */}
                  {editingId === asset.id ? null : (
                    <tr
                      className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors"
                    >
                      {/* Symbol */}
                      <td className="px-4 py-3">
                        <span className="font-mono text-slate-800 dark:text-slate-100 font-medium">
                          {asset.symbol}
                        </span>
                      </td>
                      {/* Name */}
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                        {asset.name}
                      </td>
                      {/* Type */}
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 hidden md:table-cell">
                        {assetTypeName(asset.asset_type_id)}
                      </td>
                      {/* Price Source */}
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 hidden lg:table-cell text-xs">
                        {priceSourceLabel(asset.price_source)}
                      </td>
                      {/* Current Price */}
                      <td className="px-4 py-3 text-right">
                        <span className="font-mono text-slate-800 dark:text-slate-100">
                          {asset.current_price ?? '—'}
                        </span>
                        {asset.price_date && (
                          <span className="block text-xs text-slate-400 dark:text-slate-500">
                            {asset.price_date.slice(0, 10)}
                          </span>
                        )}
                      </td>
                      {/* History range */}
                      <td className="px-4 py-3 text-right hidden xl:table-cell">
                        {asset.history_first_date ? (
                          <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                            {asset.history_first_date.slice(0, 10)}
                            <span className="text-slate-300 dark:text-slate-600 mx-1">→</span>
                            {asset.history_last_date?.slice(0, 10)}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400 dark:text-slate-600">—</span>
                        )}
                      </td>
                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1 flex-wrap">
                          <HistoryButtons asset={asset} />
                          {asset.price_source === 'custom' && (
                            <UploadCsvButton assetId={asset.id} />
                          )}
                          <button
                            onClick={() => setMode({ editing: asset.id })}
                            disabled={isAdding}
                            className={iconBtn}
                            aria-label="Edit asset"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => setDeleteId(asset.id)}
                            className={iconBtn + ' hover:text-rose-500 dark:hover:text-rose-400'}
                            aria-label="Delete asset"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}

                  {/* Edit form inlined below the row (rendered as a full-width row) */}
                  {editingId === asset.id && (
                    <tr className="border-b border-border last:border-0">
                      <td colSpan={7} className="px-4 py-3">
                        <AnimatePresence>
                          <AssetForm
                            key={`form-edit-${asset.id}`}
                            initial={assetToForm(asset)}
                            assetTypes={assetTypes}
                            isPending={updateAsset.isPending}
                            onSubmit={(f) => handleUpdate(asset.id, f)}
                            onCancel={() => setMode('idle')}
                            submitLabel="Save changes"
                          />
                        </AnimatePresence>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add form panel (below table) */}
      <AnimatePresence>
        {isAdding && (
          <AssetForm
            key="form-add"
            initial={blankForm()}
            assetTypes={assetTypes}
            isPending={createAsset.isPending}
            onSubmit={handleCreate}
            onCancel={() => setMode('idle')}
            submitLabel="Add asset"
          />
        )}
      </AnimatePresence>
    </section>
  )
}
