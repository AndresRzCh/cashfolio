import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { api } from '@/lib/api'

interface User {
  id: number
  email: string
  base_currency: string
}

interface AuthContextValue {
  user: User | null
  isLoading: boolean
  login: (accessToken: string, refreshToken: string, rememberMe?: boolean) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const token =
      localStorage.getItem('access_token') ?? sessionStorage.getItem('access_token')
    if (!token) {
      setIsLoading(false)
      return
    }
    api
      .get<User>('/auth/me')
      .then((r) => setUser(r.data))
      .catch(() => {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        sessionStorage.removeItem('access_token')
        sessionStorage.removeItem('refresh_token')
      })
      .finally(() => setIsLoading(false))
  }, [])

  async function login(accessToken: string, refreshToken: string, rememberMe = true) {
    const storage = rememberMe ? localStorage : sessionStorage
    storage.setItem('access_token', accessToken)
    storage.setItem('refresh_token', refreshToken)
    const r = await api.get<User>('/auth/me')
    setUser(r.data)
  }

  function logout() {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    sessionStorage.removeItem('access_token')
    sessionStorage.removeItem('refresh_token')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
