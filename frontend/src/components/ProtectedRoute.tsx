import { Navigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  if (isLoading)
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground">
        Loading…
      </div>
    )
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}
