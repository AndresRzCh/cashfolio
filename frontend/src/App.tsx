import { Routes, Route, Navigate } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { Toaster } from 'sonner'
import { AuthProvider } from './features/auth/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AppLayout } from './components/AppLayout'
import { LoginPage } from './features/auth/LoginPage'
import { RegisterPage } from './features/auth/RegisterPage'
import HomePage from './features/home/HomePage'
import HoldingsPage from './features/holdings/HoldingsPage'
import AccountsPage from './features/accounts/AccountsPage'
import SettingsPage from './features/settings/SettingsPage'
import { TransfersPage } from './features/transfers/TransfersPage'
import { TradesPage } from './features/trades/TradesPage'

export default function App() {
  return (
    <AuthProvider>
      <AnimatePresence mode="wait">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/holdings" element={<HoldingsPage />} />
                    <Route path="/accounts" element={<AccountsPage />} />
                    <Route path="/investments" element={<Navigate to="/holdings" replace />} />
                    <Route path="/transfers" element={<TransfersPage />} />
                    <Route path="/trades" element={<TradesPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </AppLayout>
              </ProtectedRoute>
            }
          />
        </Routes>
      </AnimatePresence>
      <Toaster position="bottom-right" richColors />
    </AuthProvider>
  )
}
