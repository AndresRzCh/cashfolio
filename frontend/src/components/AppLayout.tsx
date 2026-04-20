import { ReactNode, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  TrendingUp,
  Building2,
  ArrowLeftRight,
  Repeat2,
  Settings,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  Moon,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '@/features/auth/AuthContext'
import { useTheme } from '@/hooks/useTheme'

interface NavItem {
  to: string
  label: string
  icon: React.ElementType
}

const navItems: NavItem[] = [
  { to: '/', label: 'Home', icon: LayoutDashboard },
  { to: '/holdings', label: 'Holdings', icon: TrendingUp },
  { to: '/accounts', label: 'Accounts', icon: Building2 },
  { to: '/transfers', label: 'Transfers', icon: ArrowLeftRight },
  { to: '/trades', label: 'Trades', icon: Repeat2 },
  { to: '/settings', label: 'Settings', icon: Settings },
]

function ZenIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="6" stroke="currentColor" strokeWidth="1.5" />
      <line x1="16" y1="2" x2="16" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function NavLinkItem({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        [
          'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors duration-150 select-none',
          isActive
            ? 'bg-accent-100 text-accent-600 dark:bg-accent-900/30 dark:text-accent-300'
            : 'text-slate-600 dark:text-slate-400 hover:bg-muted hover:text-slate-800 dark:hover:text-slate-200',
        ].join(' ')
      }
    >
      <Icon size={18} className="shrink-0" />
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.span
            key="label"
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 'auto' }}
            exit={{ opacity: 0, width: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden whitespace-nowrap"
          >
            {item.label}
          </motion.span>
        )}
      </AnimatePresence>
    </NavLink>
  )
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)
  const { theme, toggle } = useTheme()

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  const sidebarWidth = collapsed ? 64 : 220

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <motion.aside
        animate={{ width: sidebarWidth }}
        transition={{ duration: 0.22, ease: 'easeInOut' }}
        className="hidden md:flex flex-col shrink-0 bg-card border-r border-border overflow-hidden"
        style={{ width: sidebarWidth }}
      >
        {/* Brand */}
        <div className="flex items-center gap-2.5 px-3 py-5 min-h-[64px]">
          <ZenIcon className="w-7 h-7 text-accent-500 shrink-0" />
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.span
                key="brand"
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.18 }}
                className="overflow-hidden whitespace-nowrap font-semibold text-base tracking-tight text-slate-800 dark:text-slate-100"
              >
                CashFolio
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        {/* Collapse toggle */}
        <div className="px-2 mb-1">
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="flex items-center justify-center w-full p-2 rounded-xl text-slate-400 hover:bg-muted hover:text-slate-600 dark:hover:text-slate-300 transition-colors duration-150"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-2 space-y-0.5 overflow-y-auto overflow-x-hidden py-2">
          {navItems.map((item) => (
            <NavLinkItem key={item.to} item={item} collapsed={collapsed} />
          ))}
        </nav>

        {/* Bottom: user + logout */}
        <div className="px-2 py-4 border-t border-border space-y-1">
          <AnimatePresence initial={false}>
            {!collapsed && user && (
              <motion.p
                key="email"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="px-3 pb-1 text-xs text-muted-foreground truncate"
              >
                {user.email}
              </motion.p>
            )}
          </AnimatePresence>
          <button
            onClick={toggle}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-slate-500 dark:text-slate-400 hover:bg-muted hover:text-slate-700 dark:hover:text-slate-200 transition-colors duration-150"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun size={18} className="shrink-0" /> : <Moon size={18} className="shrink-0" />}
            <AnimatePresence initial={false}>
              {!collapsed && (
                <motion.span
                  key="theme-label"
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.18 }}
                  className="overflow-hidden whitespace-nowrap"
                >
                  {theme === 'dark' ? 'Light mode' : 'Dark mode'}
                </motion.span>
              )}
            </AnimatePresence>
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-slate-500 dark:text-slate-400 hover:bg-muted hover:text-rose-500 dark:hover:text-rose-400 transition-colors duration-150"
          >
            <LogOut size={18} className="shrink-0" />
            <AnimatePresence initial={false}>
              {!collapsed && (
                <motion.span
                  key="logout-label"
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.18 }}
                  className="overflow-hidden whitespace-nowrap"
                >
                  Sign out
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>
      </motion.aside>

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <main className="flex-1 overflow-auto p-4 md:p-8">{children}</main>

        {/* Mobile bottom nav */}
        <nav className="md:hidden flex border-t border-border bg-card shrink-0">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  [
                    'flex flex-col items-center justify-center flex-1 py-2.5 gap-1 text-xs font-medium transition-colors duration-150',
                    isActive
                      ? 'text-accent-600 dark:text-accent-300'
                      : 'text-slate-500 dark:text-slate-400',
                  ].join(' ')
                }
              >
                <Icon size={20} />
                <span>{item.label}</span>
              </NavLink>
            )
          })}
          <button
            onClick={toggle}
            className="flex flex-col items-center justify-center flex-1 py-2.5 gap-1 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors duration-150"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
          </button>
          <button
            onClick={handleLogout}
            className="flex flex-col items-center justify-center flex-1 py-2.5 gap-1 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 transition-colors duration-150"
          >
            <LogOut size={20} />
            <span>Sign out</span>
          </button>
        </nav>
      </div>
    </div>
  )
}
