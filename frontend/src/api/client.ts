import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { clearAllCaches } from '@/api/queryClient'
import {
  getAccessToken,
  clearAccessToken,
  refreshAccessToken,
} from '@/api/tokenStore'

const baseURL = import.meta.env.VITE_API_URL || '/api'

const api = axios.create({
  baseURL,
  withCredentials: true, // send the kanzec_refresh httpOnly cookie on /auth/refresh
})

api.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

type RetriableConfig = InternalAxiosRequestConfig & { _retry?: boolean }

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const config = error.config as RetriableConfig | undefined
    const status = error.response?.status

    if (status === 401 && config && !config._retry) {
      const url = config.url ?? ''
      // Don't refresh-loop on the auth endpoints themselves
      if (url.includes('/auth/login') || url.includes('/auth/refresh') || url.includes('/auth/logout')) {
        return Promise.reject(error)
      }

      config._retry = true
      try {
        const token = await refreshAccessToken()
        if (config.headers) {
          config.headers.Authorization = `Bearer ${token}`
        }
        return api(config)
      } catch {
        clearAccessToken()
        clearAllCaches()
        window.dispatchEvent(new Event('auth-unauthorized'))
        return Promise.reject(error)
      }
    }

    return Promise.reject(error)
  },
)

export default api
