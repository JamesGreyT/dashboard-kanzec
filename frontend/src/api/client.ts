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

/**
 * Authenticated file download. Plain `<a href download>` cannot attach the
 * Bearer token, so the backend rejects with 401 JSON instead of returning
 * a binary file. This helper goes through the axios instance (which adds
 * the token via the request interceptor and rotates it via the 401 retry
 * path) and then triggers a save dialog from the resulting Blob.
 *
 * `url` may be a full path starting with `/api/...` (matching what the
 * `*ExportHref` helpers return today) or a path relative to the axios
 * baseURL — both are accepted.
 */
export async function downloadAuthed(url: string, filename: string): Promise<void> {
  const path = url.startsWith('/api/') ? url.slice('/api'.length) : url
  const response = await api.get<Blob>(path, { responseType: 'blob' })
  const blobUrl = URL.createObjectURL(response.data)
  const a = document.createElement('a')
  a.href = blobUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(blobUrl)
}
