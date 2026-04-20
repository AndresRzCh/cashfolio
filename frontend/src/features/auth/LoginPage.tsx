import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { api } from '@/lib/api'
import { useAuth } from '@/features/auth/AuthContext'

export function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      // FastAPI OAuth2 password flow expects form-encoded body
      const params = new URLSearchParams()
      params.append('username', email)
      params.append('password', password)

      const { data } = await api.post<{ access_token: string; refresh_token: string }>(
        '/auth/login',
        params,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      )

      await login(data.access_token, data.refresh_token ?? '', rememberMe)
      navigate('/', { replace: true })
    } catch {
      setError('Invalid email or password. Please try again.')
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
              CashFolio
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
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 px-4 py-2.5 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-400/20 dark:focus:border-accent-400"
              />
            </div>

            {/* Remember me */}
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 accent-accent-500 cursor-pointer"
              />
              <span className="text-sm text-slate-600 dark:text-slate-400">Remember me</span>
            </label>

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
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          {/* Footer link */}
          <p className="text-center text-sm text-slate-500 dark:text-slate-400">
            No account?{' '}
            <Link
              to="/register"
              className="font-medium text-accent-500 hover:text-accent-600 dark:text-accent-400 dark:hover:text-accent-300 transition-colors"
            >
              Create one
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  )
}
