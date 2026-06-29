import { createContext, useContext, useEffect, useState } from 'react'

import { getWebStoreRuntime } from '@/store'
import type { WebStores, WebStoreRuntime } from '@/store'

export type AppContextValue = WebStoreRuntime['core'] & {
  stores: WebStores
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: React.ReactNode }) {
  const runtime = useWebStoreRuntime()
  if (runtime === null) {
    return null
  }

  // Reactive reads bind to module-level store instances, so no TinyBase Provider is needed;
  // this context only hands components the imperative core commands and store handles.
  const { core, stores } = runtime
  return <AppContext value={{ ...core, stores }}>{children}</AppContext>
}

function useWebStoreRuntime(): WebStoreRuntime | null {
  const [runtime, setRuntime] = useState<WebStoreRuntime | null>(null)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let mounted = true

    // The runtime is a page-lifetime singleton; the effect only mirrors it into React state.
    // Browser-only stores mean this resolves client-side, after hydration.
    void (async () => {
      try {
        const nextRuntime = await getWebStoreRuntime()
        if (mounted) {
          setRuntime(nextRuntime)
        }
      } catch (nextError) {
        if (mounted) {
          setError(toError(nextError))
        }
      }
    })()

    return () => {
      mounted = false
    }
  }, [])

  if (error !== null) {
    throw error
  }

  return runtime
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (ctx === null) {
    throw new Error('useApp must be used within AppProvider')
  }
  return ctx
}
