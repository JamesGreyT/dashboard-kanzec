import { QueryClient } from '@tanstack/react-query'

export const PERSIST_CACHE_KEY = 'kanzec-rq-cache'

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5 * 60 * 1000, retry: 1 } },
})

export function clearAllCaches() {
  queryClient.clear()
  try {
    localStorage.removeItem(PERSIST_CACHE_KEY)
  } catch {
    // localStorage may be disabled in private mode — ignore
  }
}
