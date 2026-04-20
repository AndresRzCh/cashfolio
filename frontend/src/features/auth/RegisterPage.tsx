import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { api } from '@/lib/api'
import { useAuth } from '@/features/auth/AuthContext'

export function RegisterPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setLoading(true)

    try {
      await api.post('/auth/register', { email, password })
      // Auto-login after registration
      const params = new URLSearchParams()
      params.append('username', email)
      params.append('password', password)

      const { data } = await api.post<{ access_token: string; refresh_token: string }>(
        '/auth/login',
        params,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      )

      await login(data.access_token, data.refresh_token ?? '')
      navigate('/', { replace: true })
    } catch (err) {
      const message =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ?? 'Registration failed. Please try again.'
      setError(typeof message === 'string' ? message : 'Registration failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-accent-50 via-slate-50 to-accent-100 dark:from-accent-900 dark:via-slate-900 dark:to-accent-800 px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="w-full max-w-sm"
      >
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg shadow-slate-200/60 dark:shadow-slate-900/60 p-8 space-y-6">
          {/* Header */}
          <div className="text-center space-y-1">
            <div className="flex justify-center mb-3">
              <img src="/favicon.svg" alt="CashFolio" className="w-10 h-10" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-800 dark:text-slate-100">
              Create account
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Track your wealth, calmly.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label
                htmlFor="email"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 px-4 py-2.5 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-400/20 dark:focus:border-accent-400"
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="password"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 8 characters"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 px-4 py-2.5 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-400/20 dark:focus:border-accent-400"
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="confirm-password"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Confirm password
              </label>
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className={[
                  'w-full rounded-xl border bg-slate-50 dark:bg-slate-700 px-4 py-2.5 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 outline-none transition focus:ring-2',
                  confirmPassword && confirmPassword !== password
                    ? 'border-rose-400 focus:border-rose-400 focus:ring-rose-400/20'
                    : 'border-slate-200 dark:border-slate-600 focus:border-accent-400 focus:ring-accent-400/20 dark:focus:border-accent-400',
                ].join(' ')}
              />
              {confirmPassword && confirmPassword !== password && (
                <p className="text-xs text-rose-500 dark:text-rose-400 mt-1">
                  Passwords do not match.
                </p>
              )}
            </div>

            {error && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-sm text-rose-500 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 rounded-lg px-3 py-2"
              >
                {error}
              </motion.p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-accent-500 hover:bg-accent-600 disabled:bg-accent-300 dark:disabled:bg-accent-700 text-white font-medium py-2.5 text-sm transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-accent-400 focus:ring-offset-2 dark:focus:ring-offset-slate-800"
            >
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          {/* Footer link */}
          <p className="text-center text-sm text-slate-500 dark:text-slate-400">
            Already have an account?{' '}
            <Link
              to="/login"
              className="font-medium text-accent-500 hover:text-accent-600 dark:text-accent-400 dark:hover:text-accent-300 transition-colors"
            >
              Sign in
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  )
}
