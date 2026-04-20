import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, Pencil, RefreshCw, Trash2, Plus, Check, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { useAuth } from '@/features/auth/AuthContext'
import { PageTransition } from '@/components/PageTransition'
import { AssetsSettings } from '@/features/assets/AssetsSettings'
import { FxRatesSettings } from '@/features/fx-rates/FxRatesSettings'
import {
  useFireflyConfig,
  useSaveFireflyConfig,
  useDeleteFireflyConfig,
  useSyncFirefly,
} from '@/features/firefly/useFirefly'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Account {
  id: number
  name: string
  type: string
}

interface AssetType {
  id: number
  name: string
}

type AccountType = 'bank' | 'broker' | 'exchange' | 'wallet' | 'other'

const ACCOUNT_TYPES: AccountType[] = ['bank', 'broker', 'exchange', 'wallet', 'other']
const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD']

// ---------------------------------------------------------------------------
// Shared style helpers
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
// Inline status message
// ---------------------------------------------------------------------------

function StatusMessage({ status }: { status: { type: 'success' | 'error'; text: string } | null }) {
  return (
    <AnimatePresence>
      {status && (
        <motion.p
          key={status.text}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className={[
            'text-sm rounded-lg px-3 py-2',
            status.type === 'success'
              ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30'
              : 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30',
          ].join(' ')}
        >
          {status.text}
        </motion.p>
      )}
    </AnimatePresence>
  )
}

// ---------------------------------------------------------------------------
// Section: Profile / Base Currency
// ---------------------------------------------------------------------------

function ProfileSection() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [currency, setCurrency] = useState(user?.base_currency ?? 'EUR')
  const [status, setStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const mutation = useMutation({
    mutationFn: (base_currency: string) =>
      api.patch('/users/me', { base_currency }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me'] })
      setStatus({ type: 'success', text: 'Base currency updated.' })
      setTimeout(() => setStatus(null), 3000)
    },
    onError: () => {
      setStatus({ type: 'error', text: 'Failed to update. Please try again.' })
    },
  })

  function handleSave() {
    mutation.mutate(currency)
  }

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Profile</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Your account settings.</p>
      </div>

      <div className="space-y-4">
        <div className="space-y-1">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Email
          </label>
          <input
            readOnly
            value={user?.email ?? ''}
            className={inputCls + ' opacity-60 cursor-default'}
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="base-currency" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Base currency
          </label>
          <select
            id="base-currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className={inputCls}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <StatusMessage status={status} />

        <button onClick={handleSave} disabled={mutation.isPending} className={btnPrimary}>
          {mutation.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Section: Accounts
// ---------------------------------------------------------------------------

function AccountsSection() {
  const queryClient = useQueryClient()
  const [editId, setEditId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editType, setEditType] = useState<AccountType>('broker')
  const [addingRow, setAddingRow] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<AccountType>('broker')
  const [deleteId, setDeleteId] = useState<number | null>(null)

  const { data: accounts = [], isLoading } = useQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: () => api.get<Account[]>('/accounts').then((r) => r.data),
  })

  const createMutation = useMutation({
    mutationFn: (body: { name: string; type: string }) =>
      api.post('/accounts', body).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      setAddingRow(false)
      setNewName('')
      setNewType('broker')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: { name: string; type: string } }) =>
      api.patch(`/accounts/${id}`, body).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      setEditId(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/accounts/${id}`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      setDeleteId(null)
    },
  })

  function startEdit(account: Account) {
    setEditId(account.id)
    setEditName(account.name)
    setEditType(account.type as AccountType)
  }

  function cancelEdit() {
    setEditId(null)
  }

  function saveEdit(id: number) {
    updateMutation.mutate({ id, body: { name: editName, type: editType } })
  }

  function confirmDelete(id: number) {
    setDeleteId(id)
  }

  function handleDelete() {
    if (deleteId !== null) deleteMutation.mutate(deleteId)
  }

  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Accounts</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Manage your financial accounts.</p>
        </div>
        <button
          onClick={() => setAddingRow(true)}
          className={btnGhost}
          disabled={addingRow}
        >
          <Plus size={15} />
          Add account
        </button>
      </div>

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
              Delete this account? This cannot be undone.
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

      <div className="rounded-2xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Name</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Type</th>
              <th className="px-4 py-2.5 w-20" />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading && accounts.length === 0 && !addingRow && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">
                  No accounts yet.
                </td>
              </tr>
            )}
            {accounts.map((account) =>
              editId === account.id ? (
                <tr key={account.id} className="border-b border-border last:border-0 bg-accent-50/40 dark:bg-accent-900/10">
                  <td className="px-4 py-2">
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className={inputCls}
                      autoFocus
                    />
                  </td>
                  <td className="px-4 py-2">
                    <select
                      value={editType}
                      onChange={(e) => setEditType(e.target.value as AccountType)}
                      className={inputCls}
                    >
                      {ACCOUNT_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => saveEdit(account.id)}
                        disabled={updateMutation.isPending}
                        className={iconBtn + ' text-emerald-600 dark:text-emerald-400'}
                        aria-label="Save"
                      >
                        <Check size={15} />
                      </button>
                      <button onClick={cancelEdit} className={iconBtn} aria-label="Cancel">
                        <X size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={account.id} className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors">
                  <td className="px-4 py-3 text-slate-800 dark:text-slate-100">{account.name}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400 capitalize">
                    {account.type}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => startEdit(account)}
                        className={iconBtn}
                        aria-label="Edit account"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => confirmDelete(account.id)}
                        className={iconBtn + ' hover:text-rose-500 dark:hover:text-rose-400'}
                        aria-label="Delete account"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            )}

            {/* Add row */}
            {addingRow && (
              <tr className="border-t border-border bg-accent-50/40 dark:bg-accent-900/10">
                <td className="px-4 py-2">
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Account name"
                    className={inputCls}
                    autoFocus
                  />
                </td>
                <td className="px-4 py-2">
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as AccountType)}
                    className={inputCls}
                  >
                    {ACCOUNT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() =>
                        createMutation.mutate({ name: newName, type: newType })
                      }
                      disabled={!newName.trim() || createMutation.isPending}
                      className={iconBtn + ' text-emerald-600 dark:text-emerald-400'}
                      aria-label="Save new account"
                    >
                      <Check size={15} />
                    </button>
                    <button
                      onClick={() => {
                        setAddingRow(false)
                        setNewName('')
                      }}
                      className={iconBtn}
                      aria-label="Cancel"
                    >
                      <X size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Section: Asset Types
// ---------------------------------------------------------------------------

function AssetTypesSection() {
  const queryClient = useQueryClient()
  const [editId, setEditId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [addingRow, setAddingRow] = useState(false)
  const [newName, setNewName] = useState('')
  const [deleteId, setDeleteId] = useState<number | null>(null)

  const { data: assetTypes = [], isLoading } = useQuery<AssetType[]>({
    queryKey: ['asset-types'],
    queryFn: () => api.get<AssetType[]>('/asset-types').then((r) => r.data),
  })

  const createMutation = useMutation({
    mutationFn: (body: { name: string }) =>
      api.post('/asset-types', body).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asset-types'] })
      setAddingRow(false)
      setNewName('')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: { name: string } }) =>
      api.patch(`/asset-types/${id}`, body).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asset-types'] })
      setEditId(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/asset-types/${id}`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asset-types'] })
      setDeleteId(null)
    },
  })

  function startEdit(at: AssetType) {
    setEditId(at.id)
    setEditName(at.name)
  }

  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">
            Asset Types
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">Categorise your assets.</p>
        </div>
        <button
          onClick={() => setAddingRow(true)}
          className={btnGhost}
          disabled={addingRow}
        >
          <Plus size={15} />
          Add type
        </button>
      </div>

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
              Delete this asset type? This cannot be undone.
            </p>
            <button
              onClick={() => deleteMutation.mutate(deleteId)}
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

      <div className="rounded-2xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Name</th>
              <th className="px-4 py-2.5 w-20" />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={2} className="px-4 py-6 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading && assetTypes.length === 0 && !addingRow && (
              <tr>
                <td colSpan={2} className="px-4 py-6 text-center text-muted-foreground">
                  No asset types yet.
                </td>
              </tr>
            )}
            {assetTypes.map((at) =>
              editId === at.id ? (
                <tr key={at.id} className="border-b border-border last:border-0 bg-accent-50/40 dark:bg-accent-900/10">
                  <td className="px-4 py-2">
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className={inputCls}
                      autoFocus
                    />
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => updateMutation.mutate({ id: at.id, body: { name: editName } })}
                        disabled={updateMutation.isPending}
                        className={iconBtn + ' text-emerald-600 dark:text-emerald-400'}
                        aria-label="Save"
                      >
                        <Check size={15} />
                      </button>
                      <button onClick={() => setEditId(null)} className={iconBtn} aria-label="Cancel">
                        <X size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={at.id} className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors">
                  <td className="px-4 py-3 text-slate-800 dark:text-slate-100">{at.name}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => startEdit(at)}
                        className={iconBtn}
                        aria-label="Edit asset type"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => setDeleteId(at.id)}
                        className={iconBtn + ' hover:text-rose-500 dark:hover:text-rose-400'}
                        aria-label="Delete asset type"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            )}

            {/* Add row */}
            {addingRow && (
              <tr className="border-t border-border bg-accent-50/40 dark:bg-accent-900/10">
                <td className="px-4 py-2">
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Asset type name"
                    className={inputCls}
                    autoFocus
                  />
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => createMutation.mutate({ name: newName })}
                      disabled={!newName.trim() || createMutation.isPending}
                      className={iconBtn + ' text-emerald-600 dark:text-emerald-400'}
                      aria-label="Save new asset type"
                    >
                      <Check size={15} />
                    </button>
                    <button
                      onClick={() => {
                        setAddingRow(false)
                        setNewName('')
                      }}
                      className={iconBtn}
                      aria-label="Cancel"
                    >
                      <X size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Section: Change Password
// ---------------------------------------------------------------------------

function ChangePasswordSection() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setValidationError(null)

    if (newPassword.length < 8) {
      setValidationError('New password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setValidationError('New password and confirmation do not match.')
      return
    }

    setIsLoading(true)
    try {
      await api.patch('/users/me/password', {
        current_password: currentPassword,
        new_password: newPassword,
      })
      toast.success('Password updated')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 400) {
        toast.error('Current password is incorrect')
      } else {
        toast.error('Failed to update password. Please try again.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Change Password</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Update your account password.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Current password
          </label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className={inputCls}
            autoComplete="current-password"
            required
          />
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            New password
          </label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className={inputCls}
            autoComplete="new-password"
            required
          />
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Confirm new password
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={inputCls}
            autoComplete="new-password"
            required
          />
        </div>

        {validationError && (
          <p className="text-sm text-rose-600 dark:text-rose-400">{validationError}</p>
        )}

        <button type="submit" disabled={isLoading} className={btnPrimary}>
          {isLoading ? 'Updating…' : 'Change Password'}
        </button>
      </form>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Firefly III section
// ---------------------------------------------------------------------------

function FireflySection() {
  const { data: config, isLoading } = useFireflyConfig()
  const saveConfig = useSaveFireflyConfig()
  const deleteConfig = useDeleteFireflyConfig()
  const sync = useSyncFirefly()

  const [editing, setEditing] = useState(false)
  const [url, setUrl] = useState('')
  const [token, setToken] = useState('')

  function startEdit() {
    setUrl(config?.url ?? '')
    setToken('')
    setEditing(true)
  }

  function handleSave() {
    if (!url.trim() || !token.trim()) return
    saveConfig.mutate(
      { url: url.trim().replace(/\/$/, ''), api_token: token.trim() },
      { onSuccess: () => setEditing(false) },
    )
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <ExternalLink size={16} className="text-accent-500" />
          Firefly III
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Connect your Firefly III instance to include account balances in your net worth.
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : config && !editing ? (
        <div className="rounded-2xl border border-border bg-muted/30 p-4 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1 min-w-0">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{config.url}</p>
              <p className="text-xs text-muted-foreground">
                {config.last_synced_at
                  ? `Last synced: ${new Date(config.last_synced_at).toLocaleString()}`
                  : 'Never synced'}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => sync.mutate()}
                disabled={sync.isPending}
                className={btnGhost}
              >
                <RefreshCw size={14} className={sync.isPending ? 'animate-spin' : ''} />
                {sync.isPending ? 'Syncing…' : 'Sync now'}
              </button>
              <button onClick={startEdit} className={btnGhost}>
                <Pencil size={14} />
                Edit
              </button>
              <button
                onClick={() => deleteConfig.mutate()}
                disabled={deleteConfig.isPending}
                className={`${btnGhost} text-rose-500 dark:text-rose-400 hover:border-rose-300`}
              >
                <Trash2 size={14} />
                Disconnect
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-accent-200 dark:border-accent-700/40 bg-accent-50/40 dark:bg-accent-900/10 p-4 space-y-4">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              Firefly III URL <span className="text-rose-500">*</span>
            </label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://firefly.example.com"
              className={inputCls}
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              Personal Access Token <span className="text-rose-500">*</span>
            </label>
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="eyJ0eXAiOiJKV1Qi…"
              className={inputCls}
              type="password"
            />
            <p className="text-xs text-muted-foreground">
              Create a token in Firefly III → Profile → OAuth → Personal Access Tokens.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={!url.trim() || !token.trim() || saveConfig.isPending}
              className={btnPrimary}
            >
              <Check size={14} />
              {saveConfig.isPending ? 'Saving…' : 'Save'}
            </button>
            {config || editing ? (
              <button onClick={() => setEditing(false)} className={btnGhost}>
                <X size={14} />
                Cancel
              </button>
            ) : null}
          </div>
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// SettingsPage (default export — route page)
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  // Queried here so AssetsSettings can receive it as a prop without a
  // duplicate network request (TanStack Query deduplicates same queryKey).
  const { data: assetTypes = [] } = useQuery<AssetType[]>({
    queryKey: ['asset-types'],
    queryFn: () => api.get<AssetType[]>('/asset-types').then((r) => r.data),
  })

  return (
    <PageTransition>
      <div className="max-w-5xl mx-auto space-y-10">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-800 dark:text-slate-100">
            Settings
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your profile and data.</p>
        </div>

        <div className="space-y-10 divide-y divide-border">
          <div className="pt-0">
            <AssetsSettings assetTypes={assetTypes} />
          </div>
          <div className="pt-8">
            <FxRatesSettings />
          </div>
          <div className="pt-8">
            <AccountsSection />
          </div>
          <div className="pt-8">
            <AssetTypesSection />
          </div>
          <div className="pt-8">
            <ProfileSection />
          </div>
          <div className="pt-8">
            <ChangePasswordSection />
          </div>
          <div className="pt-8 pb-24">
            <FireflySection />
          </div>
        </div>
      </div>
    </PageTransition>
  )
}
