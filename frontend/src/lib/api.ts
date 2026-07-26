import axios, { type AxiosRequestConfig } from 'axios'

export const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token =
    localStorage.getItem('access_token') ?? sessionStorage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

let isRefreshing = false
let subscribers: Array<(token: string) => void> = []

function onRefreshed(token: string) {
  subscribers.forEach((cb) => cb(token))
  subscribers = []
}

function addSubscriber(cb: (token: string) => void) {
  subscribers.push(cb)
}

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config as AxiosRequestConfig & { _retry?: boolean }
    if (err.response?.status !== 401 || original._retry) {
      return Promise.reject(err)
    }

    const refreshToken =
      localStorage.getItem('refresh_token') ?? sessionStorage.getItem('refresh_token')
    if (!refreshToken) {
      localStorage.removeItem('access_token')
      sessionStorage.removeItem('access_token')
      window.location.href = '/login'
      return Promise.reject(err)
    }

    if (isRefreshing) {
      return new Promise<string>((resolve) => {
        addSubscriber(resolve)
      }).then((newToken) => {
        original.headers = (original.headers ?? {}) as Record<string, string>
        ;(original.headers as Record<string, string>).Authorization = `Bearer ${newToken}`
        return api(original)
      })
    }

    original._retry = true
    isRefreshing = true

    try {
      const { data } = await axios.post<{ access_token: string; refresh_token: string }>(
        '/api/v1/auth/refresh',
        { refresh_token: refreshToken },
      )
      const { access_token, refresh_token: newRefreshToken } = data

      if (localStorage.getItem('refresh_token')) {
        localStorage.setItem('access_token', access_token)
        localStorage.setItem('refresh_token', newRefreshToken)
      } else {
        sessionStorage.setItem('access_token', access_token)
        sessionStorage.setItem('refresh_token', newRefreshToken)
      }

      onRefreshed(access_token)
      isRefreshing = false

      original.headers = (original.headers ?? {}) as Record<string, string>
      ;(original.headers as Record<string, string>).Authorization = `Bearer ${access_token}`
      return api(original)
    } catch {
      isRefreshing = false
      subscribers = []
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      sessionStorage.removeItem('access_token')
      sessionStorage.removeItem('refresh_token')
      window.location.href = '/login'
      return Promise.reject(err)
    }
  },
)
